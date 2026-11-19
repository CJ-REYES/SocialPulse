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

const META_GRAPH_VERSION = 'v21.0';
const META_AUTH_URL = `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth`;
const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

const INSTAGRAM_REQUIRED_SCOPES = [
  'instagram_basic',
  'instagram_manage_insights',
  'pages_show_list',
  'pages_read_engagement',
];

interface MetaTokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
}

interface InstagramAccountsResponse {
  data?: Array<{
    id: string;
    name?: string;
    instagram_business_account?: {
      id: string;
      username?: string;
      name?: string;
      profile_picture_url?: string;
      followers_count?: number;
      follows_count?: number;
      media_count?: number;
    };
  }>;
}

interface InstagramMediaListResponse {
  data?: Array<{
    id: string;
    caption?: string;
    media_type?: 'VIDEO' | 'IMAGE' | 'CAROUSEL_ALBUM';
    media_product_type?: 'REELS' | 'FEED' | 'STORY' | 'LIVE';
    media_url?: string;
    thumbnail_url?: string;
    permalink?: string;
    timestamp?: string;
    like_count?: number;
    comments_count?: number;
  }>;
  paging?: {
    next?: string;
  };
}

interface InstagramInsightsResponse {
  data?: Array<{
    name: string;
    values?: Array<{ value?: number }>;
  }>;
}

export class InstagramService implements SocialPlatformService {
  public readonly platform = 'instagram' as const;

  private resolveRedirectUri(): string | null {
    if (process.env.INSTAGRAM_REDIRECT_URI) return process.env.INSTAGRAM_REDIRECT_URI;
    if (process.env.NEXT_PUBLIC_APP_URL) {
      return `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}/api/oauth/instagram/callback`;
    }
    return null;
  }

  public getConfigStatus(): PlatformConfigStatus {
    const missingEnvVars: string[] = [];
    if (!process.env.INSTAGRAM_APP_ID) missingEnvVars.push('INSTAGRAM_APP_ID');
    if (!process.env.INSTAGRAM_APP_SECRET) missingEnvVars.push('INSTAGRAM_APP_SECRET');
    if (!this.resolveRedirectUri()) missingEnvVars.push('INSTAGRAM_REDIRECT_URI');

    return {
      platform: this.platform,
      isConfigured: missingEnvVars.length === 0,
      missingEnvVars,
      requiresPkce: false,
      requiresAppReviewNote:
        'Requiere cuenta Profesional de Instagram (Creator o Business) vinculada a una Página de Facebook y una App en Meta for Developers con Instagram Graph API. En modo Desarrollo funciona con cuentas con rol en la App; en modo Live requiere App Review para instagram_basic e instagram_manage_insights.',
      requiredScopes: INSTAGRAM_REQUIRED_SCOPES,
    };
  }

  private assertConfigured(): {
    appId: string;
    appSecret: string;
    redirectUri: string;
  } {
    const status = this.getConfigStatus();
    if (!status.isConfigured) {
      throw new AppError({
        code: 'OAUTH_CONFIG_MISSING',
        message: `Faltan variables de entorno para Instagram OAuth: ${status.missingEnvVars.join(', ')}`,
      });
    }
    return {
      appId: process.env.INSTAGRAM_APP_ID!,
      appSecret: process.env.INSTAGRAM_APP_SECRET!,
      redirectUri: this.resolveRedirectUri()!,
    };
  }

  public buildAuthorizationUrl(params: OAuthAuthorizationUrlParams): string {
    const { appId, redirectUri } = this.assertConfigured();
    const url = new URL(META_AUTH_URL);
    url.searchParams.set('client_id', appId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', INSTAGRAM_REQUIRED_SCOPES.join(','));
    url.searchParams.set('auth_type', 'rerequest');
    url.searchParams.set('state', params.state);
    return url.toString();
  }

  public async exchangeCodeForTokens(params: OAuthExchangeCodeParams): Promise<OAuthTokenBundle> {
    const { appId, appSecret, redirectUri } = this.assertConfigured();

    // Paso 1: Canjear código por token de corta duración
    const shortUrl = new URL(`${META_GRAPH_BASE}/oauth/access_token`);
    shortUrl.searchParams.set('client_id', appId);
    shortUrl.searchParams.set('client_secret', appSecret);
    shortUrl.searchParams.set('redirect_uri', redirectUri);
    shortUrl.searchParams.set('code', params.code);

    const shortToken = await fetchJsonWithRetry<MetaTokenResponse>(shortUrl.toString(), {
      platform: this.platform,
      operationName: 'instagram_oauth_short_token',
      method: 'GET',
    });

    if (!shortToken.access_token) {
      throw new AppError({
        code: 'EXTERNAL_API_ERROR',
        message: '[INSTAGRAM] Meta OAuth no devolvió un access_token válido.',
      });
    }

    // Paso 2: Canjear por token de larga duración (60 días)
    return await this.exchangeForLongLivedToken(shortToken.access_token);
  }

  public async refreshAccessToken(currentLongLivedToken: string): Promise<OAuthTokenBundle> {
    return await this.exchangeForLongLivedToken(currentLongLivedToken);
  }

  private async exchangeForLongLivedToken(token: string): Promise<OAuthTokenBundle> {
    const { appId, appSecret } = this.assertConfigured();
    const longUrl = new URL(`${META_GRAPH_BASE}/oauth/access_token`);
    longUrl.searchParams.set('grant_type', 'fb_exchange_token');
    longUrl.searchParams.set('client_id', appId);
    longUrl.searchParams.set('client_secret', appSecret);
    longUrl.searchParams.set('fb_exchange_token', token);

    const longToken = await fetchJsonWithRetry<MetaTokenResponse>(longUrl.toString(), {
      platform: this.platform,
      operationName: 'instagram_oauth_long_lived_token',
      method: 'GET',
    });

    const finalToken = longToken.access_token ?? token;
    const expiresInSeconds = longToken.expires_in ?? 60 * 24 * 3600;
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

    return {
      accessToken: finalToken,
      refreshToken: finalToken, // Meta utiliza fb_exchange_token sobre el token activo antes de que expire
      tokenType: longToken.token_type ?? 'Bearer',
      expiresAt,
      refreshTokenExpiresAt: expiresAt,
      grantedScopes: INSTAGRAM_REQUIRED_SCOPES,
    };
  }

  public async revokeToken(accessToken: string): Promise<void> {
    const url = `${META_GRAPH_BASE}/me/permissions`;
    await fetchJsonWithRetry<Record<string, unknown>>(url, {
      platform: this.platform,
      operationName: 'instagram_oauth_revoke',
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      maxRetries: 1,
    });
  }

  public async fetchAccountAndVideos(accessToken: string): Promise<PlatformSyncPayload> {
    const warnings: string[] = [];
    const authHeaders = {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    };

    const accountsUrl = new URL(`${META_GRAPH_BASE}/me/accounts`);
    accountsUrl.searchParams.set(
      'fields',
      'id,name,instagram_business_account{id,username,name,profile_picture_url,followers_count,follows_count,media_count}'
    );

    const accountsRes = await fetchJsonWithRetry<InstagramAccountsResponse>(
      accountsUrl.toString(),
      {
        platform: this.platform,
        operationName: 'instagram_discover_business_account',
        headers: authHeaders,
      }
    );

    const linkedPage = (accountsRes.data ?? []).find((p) => p.instagram_business_account?.id);
    const igAccount = linkedPage?.instagram_business_account;

    if (!igAccount) {
      throw new AppError({
        code: 'NOT_FOUND',
        message:
          'No se encontró ninguna cuenta Profesional de Instagram (Creator/Business) vinculada a las Páginas de Facebook autorizadas.',
      });
    }

    const account: ExternalAccountProfile = {
      externalAccountId: igAccount.id,
      accountName: igAccount.name ?? igAccount.username ?? 'Instagram Profesional',
      accountHandle: igAccount.username ? `@${igAccount.username}` : null,
      accountAvatarUrl: igAccount.profile_picture_url ?? null,
      followersCount: igAccount.followers_count ?? 0,
      followingCount: igAccount.follows_count ?? null,
      postsCount: igAccount.media_count ?? 0,
      permissions: INSTAGRAM_REQUIRED_SCOPES.map((scope) => ({
        scope,
        status: 'granted',
      })),
      metadata: {
        linkedFacebookPageId: linkedPage?.id ?? null,
        linkedFacebookPageName: linkedPage?.name ?? null,
      },
    };

    const mediaUrl = new URL(`${META_GRAPH_BASE}/${igAccount.id}/media`);
    mediaUrl.searchParams.set(
      'fields',
      'id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count'
    );
    mediaUrl.searchParams.set('limit', '50');

    const mediaRes = await fetchJsonWithRetry<InstagramMediaListResponse>(mediaUrl.toString(), {
      platform: this.platform,
      operationName: 'instagram_media_list',
      headers: authHeaders,
    });

    const videoMediaItems = (mediaRes.data ?? []).filter(
      (item) => item.media_type === 'VIDEO' || item.media_product_type === 'REELS'
    );

    const videos: ExternalVideoItem[] = [];

    for (const item of videoMediaItems) {
      const insights = await this.fetchMediaInsights(accessToken, item.id, warnings);
      const captionText = item.caption?.trim() ?? '';
      const firstLine = captionText.split('\n')[0]?.slice(0, 110) || `Instagram Reel #${item.id.slice(-6)}`;

      const unavailableMetrics = [
        'impressions',
        'watch_time_minutes',
        'avg_view_duration_seconds',
      ];
      if (insights.views === null) unavailableMetrics.push('views');
      if (insights.reach === null) unavailableMetrics.push('reach');
      if (insights.shares === null) unavailableMetrics.push('shares');

      videos.push({
        externalVideoId: item.id,
        title: firstLine,
        description: captionText || null,
        thumbnailUrl: item.thumbnail_url ?? item.media_url ?? null,
        permalink: item.permalink ?? `https://www.instagram.com/`,
        durationSeconds: null, // Instagram Graph API /media no expone duración en segundos
        publishedAt: item.timestamp ?? new Date().toISOString(),
        contentType: item.media_product_type === 'REELS' ? 'reel' : 'video',
        viewsCount: insights.views ?? 0,
        likesCount: item.like_count ?? 0,
        commentsCount: item.comments_count ?? 0,
        sharesCount: insights.shares,
        reachCount: insights.reach,
        impressionsCount: null, // En Graph API v21+, 'views' reemplaza a 'impressions'/'plays' en Reels
        watchTimeMinutes: null,
        avgViewDurationSeconds: null,
        unavailableMetrics,
        rawMetadata: {
          mediaType: item.media_type ?? null,
          mediaProductType: item.media_product_type ?? null,
        },
      });
    }

    return { account, videos, warnings };
  }

  private async fetchMediaInsights(
    accessToken: string,
    mediaId: string,
    warnings: string[]
  ): Promise<{ views: number | null; reach: number | null; shares: number | null }> {
    try {
      const insightsUrl = new URL(`${META_GRAPH_BASE}/${mediaId}/insights`);
      insightsUrl.searchParams.set('metric', 'views,reach,shares');

      const res = await fetchJsonWithRetry<InstagramInsightsResponse>(insightsUrl.toString(), {
        platform: this.platform,
        operationName: 'instagram_media_insights',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
        maxRetries: 1,
      });

      let views: number | null = null;
      let reach: number | null = null;
      let shares: number | null = null;

      for (const metric of res.data ?? []) {
        const val = metric.values?.[0]?.value;
        if (typeof val === 'number') {
          if (metric.name === 'views') views = val;
          if (metric.name === 'reach') reach = val;
          if (metric.name === 'shares') shares = val;
        }
      }

      return { views, reach, shares };
    } catch {
      if (warnings.length === 0) {
        warnings.push(
          'Algunas métricas de Instagram Insights (views, reach, shares) no estuvieron disponibles para ciertas publicaciones (puede requerir permiso instagram_manage_insights o publicaciones posteriores a la conversión a cuenta Profesional).'
        );
      }
      return { views: null, reach: null, shares: null };
    }
  }
}
