import { AppError } from '@/lib/utils/errors';
import { fetchJsonWithRetry } from '@/services/http-client';
import type {
  ExternalAccountProfile,
  ExternalVideoItem,
  OAuthAuthorizationUrlParams,
  OAuthExchangeCodeParams,
  OAuthTokenBundle,
  PlatformConfigStatus,
  PlatformSyncPayload,
  SocialPlatformService,
} from '@/services/types';

const TIKTOK_AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize/';
const TIKTOK_TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
const TIKTOK_REVOKE_URL = 'https://open.tiktokapis.com/v2/oauth/revoke/';
const TIKTOK_API_BASE = 'https://open.tiktokapis.com/v2';

const TIKTOK_REQUIRED_SCOPES = ['user.info.basic', 'user.info.stats', 'video.list'];

interface TikTokTokenResponse {
  access_token?: string;
  expires_in?: number;
  open_id?: string;
  refresh_expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

interface TikTokUserInfoResponse {
  data?: {
    user?: {
      open_id?: string;
      union_id?: string;
      avatar_url?: string;
      display_name?: string;
      username?: string;
      follower_count?: number;
      following_count?: number;
      likes_count?: number;
      video_count?: number;
    };
  };
  error?: {
    code?: string;
    message?: string;
  };
}

interface TikTokVideoListResponse {
  data?: {
    videos?: Array<{
      id: string;
      title?: string;
      video_description?: string;
      duration?: number;
      cover_image_url?: string;
      share_url?: string;
      create_time?: number;
      view_count?: number;
      like_count?: number;
      comment_count?: number;
      share_count?: number;
    }>;
    cursor?: number;
    has_more?: boolean;
  };
  error?: {
    code?: string;
    message?: string;
  };
}

export class TikTokService implements SocialPlatformService {
  public readonly platform = 'tiktok' as const;

  private resolveRedirectUri(): string | null {
    if (process.env.TIKTOK_REDIRECT_URI) return process.env.TIKTOK_REDIRECT_URI;
    if (process.env.NEXT_PUBLIC_APP_URL) {
      return `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}/api/oauth/tiktok/callback`;
    }
    return null;
  }

  public getConfigStatus(): PlatformConfigStatus {
    const missingEnvVars: string[] = [];
    if (!process.env.TIKTOK_CLIENT_KEY) missingEnvVars.push('TIKTOK_CLIENT_KEY');
    if (!process.env.TIKTOK_CLIENT_SECRET) missingEnvVars.push('TIKTOK_CLIENT_SECRET');
    if (!this.resolveRedirectUri()) missingEnvVars.push('TIKTOK_REDIRECT_URI');

    return {
      platform: this.platform,
      isConfigured: missingEnvVars.length === 0,
      missingEnvVars,
      requiresPkce: false,
      requiresAppReviewNote:
        'Requiere aplicación en TikTok for Developers con Login Kit v2 y Display API habilitados. En Sandbox funciona con cuentas agregadas como Target Users; en Producción requiere aprobación de scopes user.info.stats y video.list.',
      requiredScopes: TIKTOK_REQUIRED_SCOPES,
    };
  }

  private assertConfigured(): {
    clientKey: string;
    clientSecret: string;
    redirectUri: string;
  } {
    const status = this.getConfigStatus();
    if (!status.isConfigured) {
      throw new AppError({
        code: 'OAUTH_CONFIG_MISSING',
        message: `Faltan variables de entorno para TikTok OAuth: ${status.missingEnvVars.join(', ')}`,
      });
    }
    return {
      clientKey: process.env.TIKTOK_CLIENT_KEY!,
      clientSecret: process.env.TIKTOK_CLIENT_SECRET!,
      redirectUri: this.resolveRedirectUri()!,
    };
  }

  public buildAuthorizationUrl(params: OAuthAuthorizationUrlParams): string {
    const { clientKey, redirectUri } = this.assertConfigured();
    const url = new URL(TIKTOK_AUTH_URL);
    url.searchParams.set('client_key', clientKey);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', TIKTOK_REQUIRED_SCOPES.join(','));
    url.searchParams.set('state', params.state);
    return url.toString();
  }

  public async exchangeCodeForTokens(params: OAuthExchangeCodeParams): Promise<OAuthTokenBundle> {
    const { clientKey, clientSecret, redirectUri } = this.assertConfigured();
    const body = new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      code: params.code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    });

    const tokenRes = await fetchJsonWithRetry<TikTokTokenResponse>(TIKTOK_TOKEN_URL, {
      platform: this.platform,
      operationName: 'tiktok_oauth_token_exchange',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!tokenRes.access_token || tokenRes.error) {
      throw new AppError({
        code: 'EXTERNAL_API_ERROR',
        message: `[TIKTOK] Error al canjear código OAuth: ${tokenRes.error_description ?? tokenRes.error ?? 'Respuesta sin access_token'}`,
      });
    }

    const now = Date.now();
    return {
      accessToken: tokenRes.access_token,
      refreshToken: tokenRes.refresh_token ?? null,
      tokenType: tokenRes.token_type ?? 'Bearer',
      expiresAt: tokenRes.expires_in
        ? new Date(now + tokenRes.expires_in * 1000).toISOString()
        : null,
      refreshTokenExpiresAt: tokenRes.refresh_expires_in
        ? new Date(now + tokenRes.refresh_expires_in * 1000).toISOString()
        : null,
      grantedScopes: tokenRes.scope
        ? tokenRes.scope.split(',').map((s) => s.trim()).filter(Boolean)
        : TIKTOK_REQUIRED_SCOPES,
    };
  }

  public async refreshAccessToken(refreshToken: string): Promise<OAuthTokenBundle> {
    const { clientKey, clientSecret } = this.assertConfigured();
    const body = new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });

    const tokenRes = await fetchJsonWithRetry<TikTokTokenResponse>(TIKTOK_TOKEN_URL, {
      platform: this.platform,
      operationName: 'tiktok_oauth_token_refresh',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!tokenRes.access_token || tokenRes.error) {
      throw new AppError({
        code: 'OAUTH_TOKEN_EXPIRED',
        message: `[TIKTOK] No fue posible renovar el token de acceso: ${tokenRes.error_description ?? tokenRes.error ?? 'Token inválido'}`,
      });
    }

    const now = Date.now();
    return {
      accessToken: tokenRes.access_token,
      refreshToken: tokenRes.refresh_token ?? refreshToken,
      tokenType: tokenRes.token_type ?? 'Bearer',
      expiresAt: tokenRes.expires_in
        ? new Date(now + tokenRes.expires_in * 1000).toISOString()
        : null,
      refreshTokenExpiresAt: tokenRes.refresh_expires_in
        ? new Date(now + tokenRes.refresh_expires_in * 1000).toISOString()
        : null,
      grantedScopes: tokenRes.scope
        ? tokenRes.scope.split(',').map((s) => s.trim()).filter(Boolean)
        : TIKTOK_REQUIRED_SCOPES,
    };
  }

  public async revokeToken(accessToken: string): Promise<void> {
    const { clientKey, clientSecret } = this.assertConfigured();
    const body = new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      token: accessToken,
    });

    await fetchJsonWithRetry<Record<string, unknown>>(TIKTOK_REVOKE_URL, {
      platform: this.platform,
      operationName: 'tiktok_oauth_revoke',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
      maxRetries: 1,
    });
  }

  public async fetchAccountAndVideos(accessToken: string): Promise<PlatformSyncPayload> {
    const warnings: string[] = [];
    const authHeaders = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };

    const userFields = [
      'open_id',
      'union_id',
      'avatar_url',
      'display_name',
      'username',
      'follower_count',
      'following_count',
      'likes_count',
      'video_count',
    ].join(',');

    const userRes = await fetchJsonWithRetry<TikTokUserInfoResponse>(
      `${TIKTOK_API_BASE}/user/info/?fields=${encodeURIComponent(userFields)}`,
      {
        platform: this.platform,
        operationName: 'tiktok_user_info',
        method: 'GET',
        headers: authHeaders,
      }
    );

    if (userRes.error && userRes.error.code && userRes.error.code !== 'ok') {
      throw new AppError({
        code: 'EXTERNAL_API_ERROR',
        message: `[TIKTOK] Error al consultar perfil: ${userRes.error.message ?? userRes.error.code}`,
      });
    }

    const user = userRes.data?.user;
    if (!user?.open_id) {
      throw new AppError({
        code: 'NOT_FOUND',
        message: 'TikTok Display API no devolvió un open_id válido para la cuenta.',
      });
    }

    const statsGranted = user.follower_count !== undefined;
    if (!statsGranted) {
      warnings.push(
        'El permiso user.info.stats no está aprobado o concedido en TikTok; el conteo de seguidores no está disponible.'
      );
    }

    const account: ExternalAccountProfile = {
      externalAccountId: user.open_id,
      accountName: user.display_name ?? user.username ?? 'Cuenta de TikTok',
      accountHandle: user.username ? `@${user.username}` : null,
      accountAvatarUrl: user.avatar_url ?? null,
      followersCount: user.follower_count ?? 0,
      followingCount: user.following_count ?? null,
      postsCount: user.video_count ?? 0,
      permissions: [
        { scope: 'user.info.basic', status: 'granted' },
        {
          scope: 'user.info.stats',
          status: statsGranted ? 'granted' : 'pending_app_review',
        },
        { scope: 'video.list', status: 'granted' },
      ],
      metadata: {
        totalAccountLikes: user.likes_count ?? null,
      },
    };

    const videoFields = [
      'id',
      'title',
      'video_description',
      'duration',
      'cover_image_url',
      'share_url',
      'create_time',
      'view_count',
      'like_count',
      'comment_count',
      'share_count',
    ].join(',');

    const videos: ExternalVideoItem[] = [];
    let cursor: number | undefined;
    let hasMore = true;

    for (let page = 0; page < 3 && hasMore; page += 1) {
      const payload: Record<string, unknown> = { max_count: 20 };
      if (cursor !== undefined) {
        payload.cursor = cursor;
      }

      const listRes = await fetchJsonWithRetry<TikTokVideoListResponse>(
        `${TIKTOK_API_BASE}/video/list/?fields=${encodeURIComponent(videoFields)}`,
        {
          platform: this.platform,
          operationName: 'tiktok_video_list',
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify(payload),
        }
      );

      if (listRes.error && listRes.error.code && listRes.error.code !== 'ok') {
        warnings.push(
          `TikTok Display API (/v2/video/list/) reportó: ${listRes.error.message ?? listRes.error.code}`
        );
        break;
      }

      for (const item of listRes.data?.videos ?? []) {
        const publishedAt = item.create_time
          ? new Date(item.create_time * 1000).toISOString()
          : new Date().toISOString();

        videos.push({
          externalVideoId: item.id,
          title:
            item.title?.trim() ||
            item.video_description?.trim().slice(0, 100) ||
            `TikTok #${item.id.slice(-6)}`,
          description: item.video_description ?? null,
          thumbnailUrl: item.cover_image_url ?? null,
          permalink: item.share_url ?? `https://www.tiktok.com/@${user.username ?? ''}/video/${item.id}`,
          durationSeconds: item.duration ?? null,
          publishedAt,
          contentType: 'short',
          viewsCount: item.view_count ?? 0,
          likesCount: item.like_count ?? 0,
          commentsCount: item.comment_count ?? 0,
          sharesCount: item.share_count ?? null,
          reachCount: null, // No disponible en TikTok Display API v2
          impressionsCount: null, // No disponible en TikTok Display API v2
          watchTimeMinutes: null, // No disponible en TikTok Display API v2
          avgViewDurationSeconds: null, // No disponible en TikTok Display API v2
          unavailableMetrics: [
            'reach',
            'impressions',
            'watch_time_minutes',
            'avg_view_duration_seconds',
          ],
          rawMetadata: {
            createTimeUnix: item.create_time ?? null,
          },
        });
      }

      hasMore = Boolean(listRes.data?.has_more);
      cursor = listRes.data?.cursor;
    }

    return { account, videos, warnings };
  }
}
