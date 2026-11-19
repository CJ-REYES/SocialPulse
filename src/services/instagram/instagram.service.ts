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
  PublishVideoInput,
  PublishVideoResult,
  SocialPlatformService,
} from '@/services/types';

const INSTAGRAM_GRAPH_VERSION = 'v21.0';
const INSTAGRAM_AUTH_URL = 'https://www.instagram.com/oauth/authorize';
const INSTAGRAM_TOKEN_URL = 'https://api.instagram.com/oauth/access_token';
const INSTAGRAM_GRAPH_BASE = 'https://graph.instagram.com';

const INSTAGRAM_PUBLISH_SCOPE = 'instagram_business_content_publish';
const INSTAGRAM_REQUIRED_SCOPES = [
  'instagram_business_basic',
  'instagram_business_manage_insights',
];

interface InstagramShortTokenResponse {
  access_token?: string;
  user_id?: string | number;
  data?: Array<{
    access_token?: string;
    user_id?: string | number;
    permissions?: string;
  }>;
}

interface InstagramLongTokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
}

interface InstagramProfileNode {
  id?: string;
  user_id?: string;
  username?: string;
  name?: string;
  profile_picture_url?: string;
  followers_count?: number;
  follows_count?: number;
  media_count?: number;
}

interface InstagramProfileResponse extends InstagramProfileNode {
  data?: InstagramProfileNode[];
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
        'Utiliza Instagram API with Instagram Login para cuentas Profesionales (Creador o Empresa) sin requerir Página de Facebook.',
      requiredScopes: INSTAGRAM_REQUIRED_SCOPES,
      publishScope: INSTAGRAM_PUBLISH_SCOPE,
      supportsNativeScheduling: false,
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
    const scopes = params.includePublishScopes
      ? [...INSTAGRAM_REQUIRED_SCOPES, INSTAGRAM_PUBLISH_SCOPE]
      : INSTAGRAM_REQUIRED_SCOPES;
    const url = new URL(INSTAGRAM_AUTH_URL);
    url.searchParams.set('enable_fb_login', '0');
    url.searchParams.set('force_authentication', '1');
    url.searchParams.set('client_id', appId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', scopes.join(','));
    url.searchParams.set('state', params.state);
    return url.toString();
  }

  public async exchangeCodeForTokens(params: OAuthExchangeCodeParams): Promise<OAuthTokenBundle> {
    const { appId, appSecret, redirectUri } = this.assertConfigured();

    // Instagram ocasionalmente añade '#_' al final del código de autorización
    const cleanCode = params.code.replace(/#_$/, '');

    const body = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code: cleanCode,
    });

    const shortTokenRes = await fetchJsonWithRetry<InstagramShortTokenResponse>(
      INSTAGRAM_TOKEN_URL,
      {
        platform: this.platform,
        operationName: 'instagram_oauth_short_token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      }
    );

    const shortAccessToken =
      shortTokenRes.access_token ?? shortTokenRes.data?.[0]?.access_token;

    if (!shortAccessToken) {
      throw new AppError({
        code: 'EXTERNAL_API_ERROR',
        message: '[INSTAGRAM] Instagram OAuth no devolvió un access_token válido.',
      });
    }

    // Intercambiar por token de larga duración (60 días) en graph.instagram.com
    return await this.exchangeForLongLivedToken(shortAccessToken);
  }

  public async refreshAccessToken(currentLongLivedToken: string): Promise<OAuthTokenBundle> {
    const refreshUrl = new URL(`${INSTAGRAM_GRAPH_BASE}/refresh_access_token`);
    refreshUrl.searchParams.set('grant_type', 'ig_refresh_token');
    refreshUrl.searchParams.set('access_token', currentLongLivedToken);

    const refreshed = await fetchJsonWithRetry<InstagramLongTokenResponse>(
      refreshUrl.toString(),
      {
        platform: this.platform,
        operationName: 'instagram_oauth_refresh_token',
        method: 'GET',
      }
    );

    const finalToken = refreshed.access_token ?? currentLongLivedToken;
    const expiresInSeconds = refreshed.expires_in ?? 60 * 24 * 3600;
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

    return {
      accessToken: finalToken,
      refreshToken: finalToken,
      tokenType: refreshed.token_type ?? 'Bearer',
      expiresAt,
      refreshTokenExpiresAt: expiresAt,
      grantedScopes: INSTAGRAM_REQUIRED_SCOPES,
    };
  }

  private async exchangeForLongLivedToken(shortToken: string): Promise<OAuthTokenBundle> {
    const { appSecret } = this.assertConfigured();
    const longUrl = new URL(`${INSTAGRAM_GRAPH_BASE}/access_token`);
    longUrl.searchParams.set('grant_type', 'ig_exchange_token');
    longUrl.searchParams.set('client_secret', appSecret);
    longUrl.searchParams.set('access_token', shortToken);

    try {
      const longToken = await fetchJsonWithRetry<InstagramLongTokenResponse>(
        longUrl.toString(),
        {
          platform: this.platform,
          operationName: 'instagram_oauth_long_lived_token',
          method: 'GET',
          maxRetries: 1,
        }
      );

      const finalToken = longToken.access_token ?? shortToken;
      const expiresInSeconds = longToken.expires_in ?? 60 * 24 * 3600;
      const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

      return {
        accessToken: finalToken,
        refreshToken: finalToken,
        tokenType: longToken.token_type ?? 'Bearer',
        expiresAt,
        refreshTokenExpiresAt: expiresAt,
        grantedScopes: INSTAGRAM_REQUIRED_SCOPES,
      };
    } catch {
      const fallbackExpiry = new Date(Date.now() + 3600 * 1000).toISOString();
      return {
        accessToken: shortToken,
        refreshToken: shortToken,
        tokenType: 'Bearer',
        expiresAt: fallbackExpiry,
        refreshTokenExpiresAt: fallbackExpiry,
        grantedScopes: INSTAGRAM_REQUIRED_SCOPES,
      };
    }
  }

  public async revokeToken(_accessToken: string): Promise<void> {
    // Instagram Login tokens son revocados por el usuario en Configuración de Instagram > Apps y sitios web;
    // la eliminación local en oauth_credentials revoca inmediatamente el acceso desde SocialPulse.
  }

  public async fetchAccountAndVideos(accessToken: string): Promise<PlatformSyncPayload> {
    const warnings: string[] = [];

    const profileUrl = new URL(`${INSTAGRAM_GRAPH_BASE}/${INSTAGRAM_GRAPH_VERSION}/me`);
    profileUrl.searchParams.set(
      'fields',
      'id,user_id,username,name,profile_picture_url,followers_count,follows_count,media_count'
    );
    profileUrl.searchParams.set('access_token', accessToken);

    const profileRes = await fetchJsonWithRetry<InstagramProfileResponse>(
      profileUrl.toString(),
      {
        platform: this.platform,
        operationName: 'instagram_me_profile',
        method: 'GET',
      }
    );

    const igAccount: InstagramProfileNode | undefined =
      profileRes.user_id || profileRes.id ? profileRes : profileRes.data?.[0];

    const externalId = igAccount?.user_id ?? igAccount?.id;
    if (!igAccount || !externalId) {
      throw new AppError({
        code: 'NOT_FOUND',
        message:
          'No se encontró una cuenta Profesional de Instagram (Creador o Empresa) accesible con este token.',
      });
    }

    const account: ExternalAccountProfile = {
      externalAccountId: externalId,
      accountName: igAccount.name ?? igAccount.username ?? 'Instagram Creador',
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
        authMode: 'instagram_login',
      },
    };

    const mediaUrl = new URL(`${INSTAGRAM_GRAPH_BASE}/${INSTAGRAM_GRAPH_VERSION}/me/media`);
    mediaUrl.searchParams.set(
      'fields',
      'id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count'
    );
    mediaUrl.searchParams.set('limit', '50');
    mediaUrl.searchParams.set('access_token', accessToken);

    const mediaRes = await fetchJsonWithRetry<InstagramMediaListResponse>(
      mediaUrl.toString(),
      {
        platform: this.platform,
        operationName: 'instagram_me_media',
        method: 'GET',
      }
    );

    const videoMediaItems = (mediaRes.data ?? []).filter(
      (item) => item.media_type === 'VIDEO' || item.media_product_type === 'REELS'
    );

    const videos: ExternalVideoItem[] = [];

    for (const item of videoMediaItems) {
      const insights = await this.fetchMediaInsights(accessToken, item.id, warnings);
      const captionText = item.caption?.trim() ?? '';
      const firstLine =
        captionText.split('\n')[0]?.slice(0, 110) || `Instagram Reel #${item.id.slice(-6)}`;

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
        permalink: item.permalink ?? 'https://www.instagram.com/',
        durationSeconds: null,
        publishedAt: item.timestamp ?? new Date().toISOString(),
        contentType: item.media_product_type === 'REELS' ? 'reel' : 'video',
        viewsCount: insights.views ?? 0,
        likesCount: item.like_count ?? 0,
        commentsCount: item.comments_count ?? 0,
        sharesCount: insights.shares,
        reachCount: insights.reach,
        impressionsCount: null,
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
      const insightsUrl = new URL(
        `${INSTAGRAM_GRAPH_BASE}/${INSTAGRAM_GRAPH_VERSION}/${mediaId}/insights`
      );
      insightsUrl.searchParams.set('metric', 'views,reach,shares');
      insightsUrl.searchParams.set('access_token', accessToken);

      const res = await fetchJsonWithRetry<InstagramInsightsResponse>(
        insightsUrl.toString(),
        {
          platform: this.platform,
          operationName: 'instagram_media_insights',
          method: 'GET',
          maxRetries: 1,
        }
      );

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
          'Algunas métricas de Instagram Insights (views, reach, shares) no estuvieron disponibles para ciertas publicaciones.'
        );
      }
      return { views: null, reach: null, shares: null };
    }
  }

  public async publishVideo(
    accessToken: string,
    input: PublishVideoInput
  ): Promise<PublishVideoResult> {
    const caption = [input.title, input.description].filter(Boolean).join('\n\n').slice(0, 2200);

    // Paso 1: Crear contenedor de Reel en Instagram Graph API
    const createUrl = new URL(
      `${INSTAGRAM_GRAPH_BASE}/${INSTAGRAM_GRAPH_VERSION}/${input.externalAccountId}/media`
    );
    const createBody = new URLSearchParams({
      media_type: 'REELS',
      video_url: input.signedDownloadUrl,
      caption,
      access_token: accessToken,
    });
    if (input.signedThumbnailUrl) {
      createBody.set('cover_url', input.signedThumbnailUrl);
    }

    const containerRes = await fetchJsonWithRetry<{ id?: string }>(createUrl.toString(), {
      platform: this.platform,
      operationName: 'instagram_create_reel_container',
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: createBody.toString(),
      maxRetries: 1,
    });

    const creationId = containerRes.id;
    if (!creationId) {
      throw new AppError({
        code: 'EXTERNAL_API_ERROR',
        message: 'Instagram no devolvió un ID de contenedor para el Reel.',
      });
    }

    // Paso 2: Esperar a que Instagram procese el contenedor (máx ~24s compatible con serverless)
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await new Promise((r) => setTimeout(r, 3000));
      const statusUrl = new URL(
        `${INSTAGRAM_GRAPH_BASE}/${INSTAGRAM_GRAPH_VERSION}/${creationId}`
      );
      statusUrl.searchParams.set('fields', 'status_code');
      statusUrl.searchParams.set('access_token', accessToken);

      const statusRes = await fetchJsonWithRetry<{ status_code?: string }>(
        statusUrl.toString(),
        {
          platform: this.platform,
          operationName: 'instagram_check_container_status',
          method: 'GET',
          maxRetries: 1,
        }
      );

      if (statusRes.status_code === 'FINISHED') {
        break;
      }
      if (statusRes.status_code === 'ERROR' || statusRes.status_code === 'EXPIRED') {
        throw new AppError({
          code: 'EXTERNAL_API_ERROR',
          message: `Instagram no pudo procesar el video (estado: ${statusRes.status_code}). Verifica formato MP4 H.264 / AAC.`,
        });
      }
    }

    // Paso 3: Publicar el contenedor procesado
    const publishUrl = new URL(
      `${INSTAGRAM_GRAPH_BASE}/${INSTAGRAM_GRAPH_VERSION}/${input.externalAccountId}/media_publish`
    );
    const publishBody = new URLSearchParams({
      creation_id: creationId,
      access_token: accessToken,
    });

    const published = await fetchJsonWithRetry<{ id?: string }>(publishUrl.toString(), {
      platform: this.platform,
      operationName: 'instagram_publish_reel',
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: publishBody.toString(),
      maxRetries: 1,
    });

    return {
      externalPostId: published.id ?? creationId,
      externalPostUrl: 'https://www.instagram.com/',
      finalStatus: 'published',
    };
  }
}
