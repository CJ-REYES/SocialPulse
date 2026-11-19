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

const FACEBOOK_REQUIRED_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_read_user_content',
  'read_insights',
];

interface MetaTokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
}

interface FacebookPagesResponse {
  data?: Array<{
    id: string;
    name: string;
    username?: string;
    access_token?: string;
    followers_count?: number;
    fan_count?: number;
    picture?: {
      data?: {
        url?: string;
      };
    };
  }>;
}

interface FacebookVideosResponse {
  data?: Array<{
    id: string;
    title?: string;
    description?: string;
    created_time?: string;
    length?: number;
    permalink_url?: string;
    picture?: string;
    views?: number;
    likes?: {
      summary?: {
        total_count?: number;
      };
    };
    comments?: {
      summary?: {
        total_count?: number;
      };
    };
  }>;
}

interface FacebookVideoInsightsResponse {
  data?: Array<{
    name: string;
    values?: Array<{ value?: number }>;
  }>;
}

export class FacebookService implements SocialPlatformService {
  public readonly platform = 'facebook' as const;

  private resolveRedirectUri(): string | null {
    if (process.env.FACEBOOK_REDIRECT_URI) return process.env.FACEBOOK_REDIRECT_URI;
    if (process.env.NEXT_PUBLIC_APP_URL) {
      return `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}/api/oauth/facebook/callback`;
    }
    return null;
  }

  public getConfigStatus(): PlatformConfigStatus {
    const missingEnvVars: string[] = [];
    if (!process.env.FACEBOOK_APP_ID) missingEnvVars.push('FACEBOOK_APP_ID');
    if (!process.env.FACEBOOK_APP_SECRET) missingEnvVars.push('FACEBOOK_APP_SECRET');
    if (!this.resolveRedirectUri()) missingEnvVars.push('FACEBOOK_REDIRECT_URI');

    return {
      platform: this.platform,
      isConfigured: missingEnvVars.length === 0,
      missingEnvVars,
      requiresPkce: false,
      requiresAppReviewNote:
        'Requiere una Página de Facebook autorizada y una App en Meta for Developers con Facebook Login. En modo Live requiere App Review para pages_read_engagement, pages_read_user_content y read_insights.',
      requiredScopes: FACEBOOK_REQUIRED_SCOPES,
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
        message: `Faltan variables de entorno para Facebook OAuth: ${status.missingEnvVars.join(', ')}`,
      });
    }
    return {
      appId: process.env.FACEBOOK_APP_ID!,
      appSecret: process.env.FACEBOOK_APP_SECRET!,
      redirectUri: this.resolveRedirectUri()!,
    };
  }

  public buildAuthorizationUrl(params: OAuthAuthorizationUrlParams): string {
    const { appId, redirectUri } = this.assertConfigured();
    const url = new URL(META_AUTH_URL);
    url.searchParams.set('client_id', appId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', FACEBOOK_REQUIRED_SCOPES.join(','));
    url.searchParams.set('auth_type', 'rerequest');
    url.searchParams.set('state', params.state);
    return url.toString();
  }

  public async exchangeCodeForTokens(params: OAuthExchangeCodeParams): Promise<OAuthTokenBundle> {
    const { appId, appSecret, redirectUri } = this.assertConfigured();

    const shortUrl = new URL(`${META_GRAPH_BASE}/oauth/access_token`);
    shortUrl.searchParams.set('client_id', appId);
    shortUrl.searchParams.set('client_secret', appSecret);
    shortUrl.searchParams.set('redirect_uri', redirectUri);
    shortUrl.searchParams.set('code', params.code);

    const shortToken = await fetchJsonWithRetry<MetaTokenResponse>(shortUrl.toString(), {
      platform: this.platform,
      operationName: 'facebook_oauth_short_token',
      method: 'GET',
    });

    if (!shortToken.access_token) {
      throw new AppError({
        code: 'EXTERNAL_API_ERROR',
        message: '[FACEBOOK] Meta OAuth no devolvió un access_token válido.',
      });
    }

    return await this.exchangeForLongLivedToken(shortToken.access_token);
  }

  public async refreshAccessToken(currentToken: string): Promise<OAuthTokenBundle> {
    return await this.exchangeForLongLivedToken(currentToken);
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
      operationName: 'facebook_oauth_long_lived_token',
      method: 'GET',
    });

    const finalToken = longToken.access_token ?? token;
    const expiresInSeconds = longToken.expires_in ?? 60 * 24 * 3600;
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

    return {
      accessToken: finalToken,
      refreshToken: finalToken,
      tokenType: longToken.token_type ?? 'Bearer',
      expiresAt,
      refreshTokenExpiresAt: expiresAt,
      grantedScopes: FACEBOOK_REQUIRED_SCOPES,
    };
  }

  public async revokeToken(accessToken: string): Promise<void> {
    const url = `${META_GRAPH_BASE}/me/permissions`;
    await fetchJsonWithRetry<Record<string, unknown>>(url, {
      platform: this.platform,
      operationName: 'facebook_oauth_revoke',
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      maxRetries: 1,
    });
  }

  public async fetchAccountAndVideos(accessToken: string): Promise<PlatformSyncPayload> {
    const warnings: string[] = [];

    const pagesUrl = new URL(`${META_GRAPH_BASE}/me/accounts`);
    pagesUrl.searchParams.set(
      'fields',
      'id,name,username,access_token,followers_count,fan_count,picture{url}'
    );

    const pagesRes = await fetchJsonWithRetry<FacebookPagesResponse>(pagesUrl.toString(), {
      platform: this.platform,
      operationName: 'facebook_me_accounts',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

    const page = pagesRes.data?.[0];
    if (!page) {
      throw new AppError({
        code: 'NOT_FOUND',
        message: 'La cuenta de Facebook autenticada no administra ninguna Página autorizada.',
      });
    }

    const pageToken = page.access_token ?? accessToken;

    const videosUrl = new URL(`${META_GRAPH_BASE}/${page.id}/videos`);
    videosUrl.searchParams.set(
      'fields',
      'id,title,description,created_time,length,permalink_url,picture,views,likes.summary(true),comments.summary(true)'
    );
    videosUrl.searchParams.set('limit', '50');

    const videosRes = await fetchJsonWithRetry<FacebookVideosResponse>(videosUrl.toString(), {
      platform: this.platform,
      operationName: 'facebook_page_videos',
      headers: {
        Authorization: `Bearer ${pageToken}`,
        Accept: 'application/json',
      },
    });

    const rawVideos = videosRes.data ?? [];
    const account: ExternalAccountProfile = {
      externalAccountId: page.id,
      accountName: page.name,
      accountHandle: page.username ? `@${page.username}` : null,
      accountAvatarUrl: page.picture?.data?.url ?? null,
      followersCount: page.followers_count ?? page.fan_count ?? 0,
      followingCount: null,
      postsCount: rawVideos.length,
      permissions: FACEBOOK_REQUIRED_SCOPES.map((scope) => ({
        scope,
        status: 'granted',
      })),
      metadata: {
        fanCount: page.fan_count ?? null,
      },
      pageAccessToken: page.access_token,
    };

    const videos: ExternalVideoItem[] = [];
    for (const item of rawVideos) {
      const insights = await this.fetchVideoInsights(pageToken, item.id, warnings);
      const titleText =
        item.title?.trim() ||
        item.description?.trim().split('\n')[0]?.slice(0, 100) ||
        `Facebook Video #${item.id.slice(-6)}`;

      const permalinkUrl = item.permalink_url
        ? item.permalink_url.startsWith('http')
          ? item.permalink_url
          : `https://www.facebook.com${item.permalink_url}`
        : `https://www.facebook.com/${page.id}/videos/${item.id}`;

      const unavailableMetrics = ['shares', 'reach'];
      if (insights.impressions === null) unavailableMetrics.push('impressions');
      if (insights.watchTimeMinutes === null) unavailableMetrics.push('watch_time_minutes');
      if (insights.avgViewDurationSeconds === null)
        unavailableMetrics.push('avg_view_duration_seconds');

      videos.push({
        externalVideoId: item.id,
        title: titleText,
        description: item.description ?? null,
        thumbnailUrl: item.picture ?? null,
        permalink: permalinkUrl,
        durationSeconds: item.length ? Math.round(item.length) : null,
        publishedAt: item.created_time ?? new Date().toISOString(),
        contentType: item.length && item.length <= 90 ? 'reel' : 'video',
        viewsCount: insights.views ?? item.views ?? 0,
        likesCount: item.likes?.summary?.total_count ?? 0,
        commentsCount: item.comments?.summary?.total_count ?? 0,
        sharesCount: null, // Graph API /{page_id}/videos no expone shares directamente en el nodo Video
        reachCount: null,
        impressionsCount: insights.impressions,
        watchTimeMinutes: insights.watchTimeMinutes,
        avgViewDurationSeconds: insights.avgViewDurationSeconds,
        unavailableMetrics,
        rawMetadata: {},
      });
    }

    return { account, videos, warnings };
  }

  private async fetchVideoInsights(
    pageToken: string,
    videoId: string,
    warnings: string[]
  ): Promise<{
    views: number | null;
    impressions: number | null;
    watchTimeMinutes: number | null;
    avgViewDurationSeconds: number | null;
  }> {
    try {
      const url = new URL(`${META_GRAPH_BASE}/${videoId}/video_insights`);
      url.searchParams.set(
        'metric',
        'total_video_views,total_video_impressions,total_video_view_total_time,total_video_avg_time_watched'
      );

      const res = await fetchJsonWithRetry<FacebookVideoInsightsResponse>(url.toString(), {
        platform: this.platform,
        operationName: 'facebook_video_insights',
        headers: {
          Authorization: `Bearer ${pageToken}`,
          Accept: 'application/json',
        },
        maxRetries: 1,
      });

      let views: number | null = null;
      let impressions: number | null = null;
      let watchTimeMinutes: number | null = null;
      let avgViewDurationSeconds: number | null = null;

      for (const m of res.data ?? []) {
        const val = m.values?.[0]?.value;
        if (typeof val === 'number') {
          if (m.name === 'total_video_views') views = val;
          if (m.name === 'total_video_impressions') impressions = val;
          // Meta reporta tiempo de reproducción en milisegundos
          if (m.name === 'total_video_view_total_time') {
            watchTimeMinutes = Number((val / 60000).toFixed(2));
          }
          if (m.name === 'total_video_avg_time_watched') {
            avgViewDurationSeconds = Number((val / 1000).toFixed(2));
          }
        }
      }

      return { views, impressions, watchTimeMinutes, avgViewDurationSeconds };
    } catch {
      if (warnings.length === 0) {
        warnings.push(
          'El endpoint video_insights de Facebook no estuvo disponible (puede requerir permiso read_insights aprobado en Meta App Review). Se utilizan las métricas base del nodo Video.'
        );
      }
      return {
        views: null,
        impressions: null,
        watchTimeMinutes: null,
        avgViewDurationSeconds: null,
      };
    }
  }
}
