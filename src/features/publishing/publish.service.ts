import { randomUUID } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { decryptOAuthToken, encryptOAuthToken } from '@/lib/security/crypto';
import { AppError, normalizeError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import { getPlatformService } from '@/services/registry';
import type { Database } from '@/types/database';
import type {
  Platform,
  PublishJobRecord,
  PublishMode,
  PublishPrivacyStatus,
} from '@/types/domain';

type PublishJobRow = Database['public']['Tables']['publish_jobs']['Row'];
type SocialAccountRow = Database['public']['Tables']['social_accounts']['Row'];
type OAuthCredentialRow = Database['public']['Tables']['oauth_credentials']['Row'];

const VIDEO_BUCKET = 'video-uploads';
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

export function mapPublishJobRow(row: PublishJobRow): PublishJobRecord {
  return {
    id: row.id,
    userId: row.user_id,
    socialAccountId: row.social_account_id,
    platform: row.platform,
    title: row.title,
    description: row.description,
    privacyStatus: row.privacy_status,
    storagePath: row.storage_path,
    thumbnailStoragePath: row.thumbnail_storage_path,
    thumbnailMimeType: row.thumbnail_mime_type,
    fileName: row.file_name,
    fileSizeBytes: Number(row.file_size_bytes),
    mimeType: row.mime_type,
    publishMode: row.publish_mode,
    scheduledAt: row.scheduled_at,
    status: row.status,
    externalPostId: row.external_post_id,
    externalPostUrl: row.external_post_url,
    errorMessage: row.error_message,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function resolveExtensionFromMime(mimeType: string): string {
  switch (mimeType) {
    case 'video/quicktime':
      return 'mov';
    case 'video/webm':
      return 'webm';
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    default:
      return 'mp4';
  }
}

export async function createSignedVideoUploadUrl(params: {
  userId: string;
  fileName: string;
  mimeType: string;
}): Promise<{ storagePath: string; signedUrl: string; token: string }> {
  if (!isSupabaseConfigured()) {
    throw new AppError({
      code: 'INTERNAL_ERROR',
      message: 'Almacenamiento no configurado en este entorno.',
    });
  }

  const ext = resolveExtensionFromMime(params.mimeType);
  const storagePath = `${params.userId}/${randomUUID()}.${ext}`;

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(VIDEO_BUCKET)
    .createSignedUploadUrl(storagePath);

  if (error || !data) {
    throw new AppError({
      code: 'DATABASE_ERROR',
      message: `No fue posible generar la URL firmada de carga: ${error?.message ?? 'Error'}`,
    });
  }

  return {
    storagePath,
    signedUrl: data.signedUrl,
    token: data.token,
  };
}

export async function listUserPublishJobs(userId: string): Promise<PublishJobRecord[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('publish_jobs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) {
    throw new AppError({
      code: 'DATABASE_ERROR',
      message: `Error al consultar historial de publicaciones: ${error.message}`,
    });
  }

  return ((data ?? []) as PublishJobRow[]).map(mapPublishJobRow);
}

async function cleanupStorageIfUnused(
  storagePath: string | null,
  column: 'storage_path' | 'thumbnail_storage_path' = 'storage_path'
): Promise<void> {
  if (!storagePath) return;

  const admin = createAdminClient();
  const { count } = await admin
    .from('publish_jobs')
    .select('id', { count: 'exact', head: true })
    .eq(column, storagePath)
    .in('status', ['pending', 'uploading', 'scheduled'])
    .neq('publish_mode', 'scheduled_native');

  if ((count ?? 0) === 0) {
    await admin.storage.from(VIDEO_BUCKET).remove([storagePath]);
    await admin
      .from('publish_jobs')
      .update({ [column]: null } as never)
      .eq(column, storagePath);
  }
}

async function resolveValidAccessTokenForAccount(
  account: SocialAccountRow
): Promise<string> {
  const admin = createAdminClient();
  const { data: rawCred, error: credErr } = await admin
    .from('oauth_credentials')
    .select('*')
    .eq('social_account_id', account.id)
    .eq('user_id', account.user_id)
    .maybeSingle();

  const cred = rawCred as OAuthCredentialRow | null;
  if (credErr || !cred || cred.revoked_at) {
    throw new AppError({
      code: 'OAUTH_TOKEN_EXPIRED',
      message: 'La cuenta no posee una sesión OAuth activa. Reconéctala desde Conexiones.',
    });
  }

  const now = Date.now();
  const isExpiringSoon =
    cred.expires_at && new Date(cred.expires_at).getTime() - now <= TOKEN_REFRESH_BUFFER_MS;

  if (!isExpiringSoon) {
    return decryptOAuthToken(cred.access_token_encrypted);
  }

  const service = getPlatformService(account.platform);
  const tokenToRefresh = cred.refresh_token_encrypted
    ? decryptOAuthToken(cred.refresh_token_encrypted)
    : decryptOAuthToken(cred.access_token_encrypted);

  const refreshed = await service.refreshAccessToken(tokenToRefresh);
  await admin
    .from('oauth_credentials')
    .update({
      access_token_encrypted: encryptOAuthToken(refreshed.accessToken),
      refresh_token_encrypted: refreshed.refreshToken
        ? encryptOAuthToken(refreshed.refreshToken)
        : cred.refresh_token_encrypted,
      expires_at: refreshed.expiresAt,
      refresh_token_expires_at: refreshed.refreshTokenExpiresAt,
      last_refreshed_at: new Date().toISOString(),
    } as never)
    .eq('id', cred.id);

  return refreshed.accessToken;
}

export async function executePublishJob(jobId: string): Promise<PublishJobRecord> {
  const admin = createAdminClient();
  const { data: rawJob, error: jobErr } = await admin
    .from('publish_jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (jobErr || !rawJob) {
    throw new AppError({
      code: 'NOT_FOUND',
      message: 'Trabajo de publicación no encontrado.',
    });
  }

  const job = rawJob as PublishJobRow;
  if (!job.storage_path) {
    throw new AppError({
      code: 'NOT_FOUND',
      message: 'El archivo de video temporal ya no está disponible en almacenamiento.',
    });
  }

  const { data: rawAccount } = await admin
    .from('social_accounts')
    .select('*')
    .eq('id', job.social_account_id)
    .eq('user_id', job.user_id)
    .maybeSingle();

  const account = rawAccount as SocialAccountRow | null;
  if (!account || account.connection_status !== 'connected') {
    const { data: failedRow } = await admin
      .from('publish_jobs')
      .update({
        status: 'failed',
        error_message: 'La cuenta social seleccionada no está conectada actualmente.',
      } as never)
      .eq('id', job.id)
      .select('*')
      .single();
    return mapPublishJobRow((failedRow ?? job) as PublishJobRow);
  }

  await admin
    .from('publish_jobs')
    .update({ status: 'uploading', error_message: null } as never)
    .eq('id', job.id);

  try {
    const accessToken = await resolveValidAccessTokenForAccount(account);
    const { data: signedData, error: signedErr } = await admin.storage
      .from(VIDEO_BUCKET)
      .createSignedUrl(job.storage_path, 3600);

    if (signedErr || !signedData?.signedUrl) {
      throw new AppError({
        code: 'INTERNAL_ERROR',
        message: 'No fue posible generar el acceso temporal seguro al video.',
      });
    }

    const service = getPlatformService(account.platform);
    const nativeScheduleIso =
      job.publish_mode === 'scheduled_native' ? job.scheduled_at : null;

    let signedThumbnailUrl: string | null = null;
    if (job.thumbnail_storage_path) {
      const { data: thumbSigned } = await admin.storage
        .from(VIDEO_BUCKET)
        .createSignedUrl(job.thumbnail_storage_path, 3600);
      signedThumbnailUrl = thumbSigned?.signedUrl ?? null;
    }

    const result = await service.publishVideo(accessToken, {
      externalAccountId: account.external_account_id,
      title: job.title,
      description: job.description ?? '',
      privacyStatus: job.privacy_status,
      signedDownloadUrl: signedData.signedUrl,
      signedThumbnailUrl,
      thumbnailMimeType: job.thumbnail_mime_type,
      fileSizeBytes: Number(job.file_size_bytes),
      mimeType: job.mime_type,
      scheduledAt: nativeScheduleIso,
    });

    const { data: updatedRow } = await admin
      .from('publish_jobs')
      .update({
        status: result.finalStatus,
        external_post_id: result.externalPostId,
        external_post_url: result.externalPostUrl,
        published_at:
          result.finalStatus === 'published' || result.finalStatus === 'draft_inbox'
            ? new Date().toISOString()
            : null,
        error_message: result.notice ?? null,
      } as never)
      .eq('id', job.id)
      .select('*')
      .single();

    logger.info('publish_job_succeeded', {
      jobId: job.id,
      platform: job.platform,
      finalStatus: result.finalStatus,
    });

    await cleanupStorageIfUnused(job.storage_path, 'storage_path');
    await cleanupStorageIfUnused(job.thumbnail_storage_path, 'thumbnail_storage_path');
    return mapPublishJobRow((updatedRow ?? job) as PublishJobRow);
  } catch (error) {
    const normalized = normalizeError(error);
    logger.error('publish_job_failed', {
      jobId: job.id,
      platform: job.platform,
      code: normalized.code,
      message: normalized.message,
    });

    const { data: failedRow } = await admin
      .from('publish_jobs')
      .update({
        status: 'failed',
        error_message: normalized.publicMessage,
      } as never)
      .eq('id', job.id)
      .select('*')
      .single();

    await cleanupStorageIfUnused(job.storage_path, 'storage_path');
    await cleanupStorageIfUnused(job.thumbnail_storage_path, 'thumbnail_storage_path');
    return mapPublishJobRow((failedRow ?? job) as PublishJobRow);
  }
}

export async function dispatchOrScheduleVideoPublish(params: {
  userId: string;
  socialAccountIds: string[];
  title: string;
  description: string;
  privacyStatus: PublishPrivacyStatus;
  storagePath: string;
  thumbnailStoragePath?: string | null;
  thumbnailMimeType?: string | null;
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
  scheduledAt?: string | null;
}): Promise<PublishJobRecord[]> {
  // Protección estricta contra IDOR/path traversal: los archivos deben pertenecer al prefijo del usuario
  if (
    !params.storagePath.startsWith(`${params.userId}/`) ||
    params.storagePath.includes('..')
  ) {
    throw new AppError({
      code: 'FORBIDDEN',
      message: 'No tienes permiso para utilizar el archivo especificado.',
    });
  }

  if (
    params.thumbnailStoragePath &&
    (!params.thumbnailStoragePath.startsWith(`${params.userId}/`) ||
      params.thumbnailStoragePath.includes('..'))
  ) {
    throw new AppError({
      code: 'FORBIDDEN',
      message: 'No tienes permiso para utilizar la miniatura especificada.',
    });
  }

  const supabase = await createClient();
  const { data: rawAccounts, error: accErr } = await supabase
    .from('social_accounts')
    .select('*')
    .eq('user_id', params.userId)
    .in('id', params.socialAccountIds)
    .eq('connection_status', 'connected');

  if (accErr) {
    throw new AppError({
      code: 'DATABASE_ERROR',
      message: 'Error al verificar las cuentas seleccionadas.',
    });
  }

  const accounts = (rawAccounts ?? []) as SocialAccountRow[];
  if (accounts.length === 0) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      message: 'Ninguna de las cuentas seleccionadas está conectada actualmente.',
    });
  }

  const scheduledDate = params.scheduledAt ? new Date(params.scheduledAt) : null;
  const isFutureSchedule =
    scheduledDate !== null && scheduledDate.getTime() > Date.now() + 2 * 60 * 1000;

  const admin = createAdminClient();
  const createdJobs: PublishJobRow[] = [];

  for (const account of accounts) {
    const config = getPlatformService(account.platform).getConfigStatus();
    let publishMode: PublishMode = 'immediate';
    let initialStatus: PublishJobRecord['status'] = 'pending';

    if (isFutureSchedule) {
      if (config.supportsNativeScheduling) {
        publishMode = 'scheduled_native';
        initialStatus = 'pending';
      } else {
        publishMode = 'scheduled_queue';
        initialStatus = 'scheduled';
      }
    }

    const { data: inserted, error: insertErr } = await admin
      .from('publish_jobs')
      .insert({
        user_id: params.userId,
        social_account_id: account.id,
        platform: account.platform as Platform,
        title: params.title,
        description: params.description || null,
        privacy_status: params.privacyStatus,
        storage_path: params.storagePath,
        thumbnail_storage_path: params.thumbnailStoragePath ?? null,
        thumbnail_mime_type: params.thumbnailMimeType ?? null,
        file_name: params.fileName,
        file_size_bytes: params.fileSizeBytes,
        mime_type: params.mimeType,
        publish_mode: publishMode,
        scheduled_at: isFutureSchedule && scheduledDate ? scheduledDate.toISOString() : null,
        status: initialStatus,
      } as never)
      .select('*')
      .single();

    if (!insertErr && inserted) {
      createdJobs.push(inserted as PublishJobRow);
    }
  }

  const results: PublishJobRecord[] = [];
  for (const job of createdJobs) {
    if (job.publish_mode === 'scheduled_queue') {
      results.push(mapPublishJobRow(job));
    } else {
      const executed = await executePublishJob(job.id);
      results.push(executed);
    }
  }

  await cleanupStorageIfUnused(params.storagePath, 'storage_path');
  await cleanupStorageIfUnused(
    params.thumbnailStoragePath ?? null,
    'thumbnail_storage_path'
  );
  return results;
}

export async function processDueScheduledPublishJobs(
  userId?: string
): Promise<PublishJobRecord[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  const admin = createAdminClient();
  let query = admin
    .from('publish_jobs')
    .select('*')
    .eq('status', 'scheduled')
    .eq('publish_mode', 'scheduled_queue')
    .lte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(10);

  if (userId) {
    query = query.eq('user_id', userId);
  }

  const { data } = await query;
  const dueJobs = (data ?? []) as PublishJobRow[];

  const results: PublishJobRecord[] = [];
  for (const job of dueJobs) {
    const executed = await executePublishJob(job.id);
    results.push(executed);
  }
  return results;
}

export async function cancelScheduledPublishJob(params: {
  userId: string;
  publishJobId: string;
}): Promise<void> {
  const supabase = await createClient();
  const { data: rawJob } = await supabase
    .from('publish_jobs')
    .select('*')
    .eq('id', params.publishJobId)
    .eq('user_id', params.userId)
    .maybeSingle();

  const job = rawJob as PublishJobRow | null;
  if (!job) {
    throw new AppError({
      code: 'NOT_FOUND',
      message: 'Publicación programada no encontrada.',
    });
  }

  if (job.status !== 'scheduled' && job.status !== 'pending') {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      message: 'Solo se pueden cancelar publicaciones pendientes o programadas en cola.',
    });
  }

  const { error } = await supabase
    .from('publish_jobs')
    .update({ status: 'cancelled' } as never)
    .eq('id', job.id)
    .eq('user_id', params.userId);

  if (error) {
    throw new AppError({
      code: 'DATABASE_ERROR',
      message: 'No fue posible cancelar la publicación.',
    });
  }

  await cleanupStorageIfUnused(job.storage_path, 'storage_path');
  await cleanupStorageIfUnused(job.thumbnail_storage_path, 'thumbnail_storage_path');
}
