import { type NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getAuthenticatedContext } from '@/features/auth/session';
import { oauthCallbackQuerySchema, platformSchema } from '@/lib/validation/schemas';
import { verifySignedOAuthState } from '@/lib/security/oauth-state';
import { getPlatformService } from '@/services/registry';
import { persistOAuthConnection } from '@/features/connections/connections.service';
import { synchronizeSocialAccount } from '@/features/synchronization/sync.service';
import { normalizeError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ platform: string }> }
) {
  const ctx = await getAuthenticatedContext();
  if (!ctx) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const { platform: rawPlatform } = await context.params;
  const parsedPlatform = platformSchema.safeParse(rawPlatform);
  if (!parsedPlatform.success) {
    return NextResponse.redirect(new URL('/connections?error=invalid_platform', request.url));
  }

  const platform = parsedPlatform.data;
  const { searchParams } = new URL(request.url);
  const parsedQuery = oauthCallbackQuerySchema.safeParse({
    code: searchParams.get('code') ?? undefined,
    state: searchParams.get('state') ?? undefined,
    error: searchParams.get('error') ?? undefined,
    error_description: searchParams.get('error_description') ?? undefined,
  });

  const cookieStore = await cookies();
  const storedNonce = cookieStore.get(`oauth_nonce_${platform}`)?.value;
  const storedCodeVerifier = cookieStore.get(`oauth_pkce_${platform}`)?.value;

  // Limpiar cookies efímeras inmediatamente (one-time use)
  cookieStore.delete(`oauth_nonce_${platform}`);
  cookieStore.delete(`oauth_pkce_${platform}`);

  if (!parsedQuery.success) {
    return NextResponse.redirect(
      new URL(`/connections?error=invalid_callback_params&platform=${platform}`, request.url)
    );
  }

  if (parsedQuery.data.error) {
    logger.warn('oauth_provider_rejected', {
      platform,
      userId: ctx.userId,
      providerError: parsedQuery.data.error,
    });
    return NextResponse.redirect(
      new URL(`/connections?error=provider_denied&platform=${platform}`, request.url)
    );
  }

  if (!parsedQuery.data.code || !parsedQuery.data.state) {
    return NextResponse.redirect(
      new URL(`/connections?error=missing_code_or_state&platform=${platform}`, request.url)
    );
  }

  try {
    verifySignedOAuthState(parsedQuery.data.state, {
      userId: ctx.userId,
      platform,
      expectedNonce: storedNonce,
    });

    const service = getPlatformService(platform);
    const tokenBundle = await service.exchangeCodeForTokens({
      code: parsedQuery.data.code,
      codeVerifier: storedCodeVerifier,
    });

    const syncPayload = await service.fetchAccountAndVideos(tokenBundle.accessToken);

    const savedAccount = await persistOAuthConnection({
      userId: ctx.userId,
      platform,
      tokenBundle,
      externalProfile: syncPayload.account,
    });

    // Ejecutar sincronización inicial inmediata para almacenar videos y primer snapshot
    await synchronizeSocialAccount({
      socialAccountId: savedAccount.id,
      userId: ctx.userId,
      triggerSource: 'oauth_callback',
      forceBypassCooldown: true,
    });

    const okUrl = new URL('/connections', request.url);
    okUrl.searchParams.set('connected', platform);
    return NextResponse.redirect(okUrl);
  } catch (error) {
    const normalized = normalizeError(error);
    logger.error('oauth_callback_failed', {
      platform,
      userId: ctx.userId,
      errorCode: normalized.code,
      message: normalized.message,
    });

    const errUrl = new URL('/connections', request.url);
    errUrl.searchParams.set('error', normalized.code);
    errUrl.searchParams.set('platform', platform);
    return NextResponse.redirect(errUrl);
  }
}
