import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { decryptOAuthToken, encryptOAuthToken } from '@/lib/security/crypto';
import { AppError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import { getPlatformService } from '@/services/registry';
import type { ExternalAccountProfile, OAuthTokenBundle } from '@/services/types';
import type { Database } from '@/types/database';
import type { Platform, PlatformPermission, SocialAccount } from '@/types/domain';

type SocialAccountRow = Database['public']['Tables']['social_accounts']['Row'];
type PermissionRow = Database['public']['Tables']['platform_permissions']['Row'];
type OAuthCredentialRow = Database['public']['Tables']['oauth_credentials']['Row'];

export function mapSocialAccountRow(row: SocialAccountRow): SocialAccount {
  return {
    id: row.id,
    userId: row.user_id,
    platform: row.platform,
    externalAccountId: row.external_account_id,
    accountName: row.account_name,
    accountHandle: row.account_handle,
    accountAvatarUrl: row.account_avatar_url,
    followersCount: Number(row.followers_count ?? 0),
    followingCount: row.following_count !== null ? Number(row.following_count) : null,
    postsCount: Number(row.posts_count ?? 0),
    connectionStatus: row.connection_status,
    lastErrorCode: row.last_error_code,
    lastErrorMessage: row.last_error_message,
    lastSyncedAt: row.last_synced_at,
    nextAllowedSyncAt: row.next_allowed_sync_at,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapPermissionRow(row: PermissionRow): PlatformPermission {
  return {
    id: row.id,
    socialAccountId: row.social_account_id,
    userId: row.user_id,
    platform: row.platform,
    scope: row.scope,
    status: row.status,
    grantedAt: row.granted_at,
    expiresAt: row.expires_at,
  };
}

export interface ConnectedAccountWithPermissions {
  account: SocialAccount;
  permissions: PlatformPermission[];
}

export async function listUserConnections(
  userId: string
): Promise<ConnectedAccountWithPermissions[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  const supabase = await createClient();
  const [accountsRes, permsRes] = await Promise.all([
    supabase
      .from('social_accounts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true }),
    supabase
      .from('platform_permissions')
      .select('*')
      .eq('user_id', userId)
      .order('scope', { ascending: true }),
  ]);

  if (accountsRes.error) {
    throw new AppError({
      code: 'DATABASE_ERROR',
      message: `Error al consultar cuentas conectadas: ${accountsRes.error.message}`,
    });
  }

  const accountRows = (accountsRes.data ?? []) as SocialAccountRow[];
  const permRows = (permsRes.data ?? []) as PermissionRow[];

  return accountRows.map((row) => ({
    account: mapSocialAccountRow(row),
    permissions: permRows
      .filter((p) => p.social_account_id === row.id)
      .map((p) => mapPermissionRow(p)),
  }));
}

export async function persistOAuthConnection(params: {
  userId: string;
  platform: Platform;
  tokenBundle: OAuthTokenBundle;
  externalProfile: ExternalAccountProfile;
}): Promise<SocialAccount> {
  const { userId, platform, tokenBundle, externalProfile } = params;
  const admin = createAdminClient();

  // Cifrar tokens en reposo con AES-256-GCM antes de tocar PostgreSQL
  const effectiveAccessToken =
    externalProfile.pageAccessToken ?? tokenBundle.accessToken;
  const encryptedAccess = encryptOAuthToken(effectiveAccessToken);
  const encryptedRefresh = tokenBundle.refreshToken
    ? encryptOAuthToken(tokenBundle.refreshToken)
    : null;

  const { data: rawAccount, error: accountErr } = await admin
    .from('social_accounts')
    .upsert(
      {
        user_id: userId,
        platform,
        external_account_id: externalProfile.externalAccountId,
        account_name: externalProfile.accountName,
        account_handle: externalProfile.accountHandle,
        account_avatar_url: externalProfile.accountAvatarUrl,
        followers_count: externalProfile.followersCount,
        following_count: externalProfile.followingCount,
        posts_count: externalProfile.postsCount,
        connection_status: 'connected',
        last_error_code: null,
        last_error_message: null,
        metadata: externalProfile.metadata,
      } as never,
      { onConflict: 'user_id,platform,external_account_id' }
    )
    .select('*')
    .single();

  if (accountErr || !rawAccount) {
    throw new AppError({
      code: 'DATABASE_ERROR',
      message: `Error al persistir la cuenta social (${platform}): ${accountErr?.message ?? 'Sin respuesta'}`,
    });
  }

  const accountRow = rawAccount as SocialAccountRow;

  const { error: credErr } = await admin.from('oauth_credentials').upsert(
    {
      social_account_id: accountRow.id,
      user_id: userId,
      platform,
      access_token_encrypted: encryptedAccess,
      refresh_token_encrypted: encryptedRefresh,
      token_type: tokenBundle.tokenType,
      expires_at: tokenBundle.expiresAt,
      refresh_token_expires_at: tokenBundle.refreshTokenExpiresAt,
      encryption_key_version: 1,
      last_refreshed_at: new Date().toISOString(),
      revoked_at: null,
    } as never,
    { onConflict: 'social_account_id' }
  );

  if (credErr) {
    throw new AppError({
      code: 'DATABASE_ERROR',
      message: `Error al guardar credenciales OAuth cifradas: ${credErr.message}`,
    });
  }

  // Registrar permisos aprobados
  if (externalProfile.permissions.length > 0) {
    const permissionRows = externalProfile.permissions.map((perm) => ({
      social_account_id: accountRow.id,
      user_id: userId,
      platform,
      scope: perm.scope,
      status: perm.status,
      granted_at: new Date().toISOString(),
    }));

    await admin
      .from('platform_permissions')
      .upsert(permissionRows as never, { onConflict: 'social_account_id,scope' });
  }

  logger.info('oauth_connection_persisted', {
    userId,
    platform,
    socialAccountId: accountRow.id,
  });

  return mapSocialAccountRow(accountRow);
}

export async function disconnectAndRevokeAccount(params: {
  userId: string;
  socialAccountId: string;
}): Promise<void> {
  const { userId, socialAccountId } = params;
  const supabase = await createClient();

  // Verificar propiedad estricta mediante sesión autenticada y RLS
  const { data: rawAccount, error: findErr } = await supabase
    .from('social_accounts')
    .select('*')
    .eq('id', socialAccountId)
    .eq('user_id', userId)
    .maybeSingle();

  if (findErr || !rawAccount) {
    throw new AppError({
      code: 'NOT_FOUND',
      message: 'La cuenta social solicitada no existe o no tienes permiso para administrarla.',
    });
  }

  const accountRow = rawAccount as SocialAccountRow;
  const admin = createAdminClient();

  const { data: rawCred } = await admin
    .from('oauth_credentials')
    .select('*')
    .eq('social_account_id', socialAccountId)
    .eq('user_id', userId)
    .maybeSingle();

  const credRow = rawCred as OAuthCredentialRow | null;

  if (credRow && !credRow.revoked_at) {
    try {
      const accessToken = decryptOAuthToken(credRow.access_token_encrypted);
      const service = getPlatformService(accountRow.platform);
      await service.revokeToken(accessToken);
    } catch (revokeErr) {
      logger.warn('oauth_remote_revoke_warning', {
        socialAccountId,
        platform: accountRow.platform,
        reason: revokeErr instanceof Error ? revokeErr.message : 'Revoke warning',
      });
    }
  }

  // Eliminar credenciales OAuth cifradas inmediatamente
  await admin
    .from('oauth_credentials')
    .delete()
    .eq('social_account_id', socialAccountId)
    .eq('user_id', userId);

  // Marcar la cuenta como revocada conservando su historial analítico o permitiendo reconexión
  const { error: updateErr } = await supabase
    .from('social_accounts')
    .update({
      connection_status: 'revoked',
      last_error_code: 'USER_REVOKED',
      last_error_message: 'Conexión revocada manualmente por el propietario.',
    } as never)
    .eq('id', socialAccountId)
    .eq('user_id', userId);

  if (updateErr) {
    throw new AppError({
      code: 'DATABASE_ERROR',
      message: `No fue posible actualizar el estado de desconexión: ${updateErr.message}`,
    });
  }

  logger.info('oauth_account_disconnected', {
    userId,
    socialAccountId,
    platform: accountRow.platform,
  });
}
