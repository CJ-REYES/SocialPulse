import { type NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getAuthenticatedContext } from '@/features/auth/session';
import { platformSchema } from '@/lib/validation/schemas';
import { createSignedOAuthState, generatePkcePair } from '@/lib/security/oauth-state';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { getPlatformService } from '@/services/registry';
import { normalizeError } from '@/lib/utils/errors';

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
    return NextResponse.redirect(
      new URL('/connections?error=invalid_platform', request.url)
    );
  }

  const platform = parsedPlatform.data;
  const rateLimit = checkRateLimit({
    key: `oauth:connect:${ctx.userId}:${platform}`,
    limit: 10,
    windowMs: 10 * 60 * 1000,
  });

  if (!rateLimit.allowed) {
    return NextResponse.redirect(
      new URL(`/connections?error=rate_limited&platform=${platform}`, request.url)
    );
  }

  const service = getPlatformService(platform);
  const configStatus = service.getConfigStatus();

  if (!configStatus.isConfigured) {
    const errUrl = new URL('/connections', request.url);
    errUrl.searchParams.set('error', 'oauth_config_missing');
    errUrl.searchParams.set('platform', platform);
    return NextResponse.redirect(errUrl);
  }

  try {
    const { state, nonce } = createSignedOAuthState({
      userId: ctx.userId,
      platform,
    });

    const { codeVerifier, codeChallenge } = generatePkcePair();
    const cookieStore = await cookies();

    cookieStore.set(`oauth_nonce_${platform}`, nonce, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 600,
    });

    cookieStore.set(`oauth_pkce_${platform}`, codeVerifier, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 600,
    });

    const authorizationUrl = service.buildAuthorizationUrl({
      state,
      codeChallenge,
    });

    return NextResponse.redirect(authorizationUrl);
  } catch (error) {
    const normalized = normalizeError(error);
    const errUrl = new URL('/connections', request.url);
    errUrl.searchParams.set('error', normalized.code);
    errUrl.searchParams.set('platform', platform);
    return NextResponse.redirect(errUrl);
  }
}
