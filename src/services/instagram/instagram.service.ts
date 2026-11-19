import { AppError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
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

const META_GRAPH_VERSION = 'v21.0';
const META_AUTH_URL = `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth`;
const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

const INSTAGRAM_PUBLISH_SCOPE = 'instagram_content_publish';
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

interface InstagramBusinessNode {
  id: string;
  username?: string;
  name?: string;
  profile_picture_url?: string;
  followers_count?: number;
  follows_count?: number;
  media_count?: number;
}

interface InstagramAccountsResponse {
  data?: Array<{
    id: string;
    name?: string;
    instagram_business_account?: InstagramBusinessNode;
    connected_instagram_account?: InstagramBusinessNode;
  }>;
}

interface AssignedInstagramAccountsResponse {
  data?: Array<{
    id: string;
    username?: string;
    name?: string;
  }>;
}

interface MetaSystemUserMeResponse {
  id?: string;
  client_business_id?: string;
}

interface MetaDebugTokenResponse {
  data?: {
    type?: string;
    is_valid?: boolean;
    user_id?: string;
    profile_id?: string;
    scopes?: string[];
    granular_scopes?: Array<{
      scope?: string;
      target_ids?: string[];
    }>;
  };
}

interface MetaBusinessesInstagramResponse {
  data?: Array<{
    id: string;
    name?: string;
    owned_instagram_accounts?: {
      data?: InstagramBusinessNode[];
    };
    client_instagram_accounts?: {
      data?: InstagramBusinessNode[];
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
        'Utiliza Meta Unified Login / Instagram Graph API v21.0 para cuentas Profesionales (Creador o Empresa).',
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

    const url = new URL(META_AUTH_URL);
    url.searchParams.set('client_id', appId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('auth_type', 'rerequest');
    url.searchParams.set('state', params.state);

    const unifiedConfigId = process.env.INSTAGRAM_LOGIN_CONFIG_ID?.trim();
    if (unifiedConfigId) {
      url.searchParams.set('config_id', unifiedConfigId);
      url.searchParams.set('override_default_response_type', 'true');
    } else {
      url.searchParams.set('scope', scopes.join(','));
    }

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
      operationName: 'instagram_oauth_short_token',
      method: 'GET',
    });

    if (!shortToken.access_token) {
      throw new AppError({
        code: 'EXTERNAL_API_ERROR',
        message: '[INSTAGRAM] Meta OAuth no devolvió un access_token válido.',
      });
    }

    // Los System User Access Tokens (SUAT) de Meta Unified Login no tienen expires_in y no caducan
    if (shortToken.expires_in === undefined) {
      const debugInfo = await this.inspectTokenInfo(shortToken.access_token);
      const grantedScopes =
        debugInfo?.scopes && debugInfo.scopes.length > 0
          ? debugInfo.scopes
          : INSTAGRAM_REQUIRED_SCOPES;

      return {
        accessToken: shortToken.access_token,
        refreshToken: shortToken.access_token,
        tokenType: shortToken.token_type ?? 'Bearer',
        expiresAt: null,
        refreshTokenExpiresAt: null,
        grantedScopes,
      };
    }

    return await this.exchangeForLongLivedToken(shortToken.access_token);
  }

  public async refreshAccessToken(currentLongLivedToken: string): Promise<OAuthTokenBundle> {
    return await this.exchangeForLongLivedToken(currentLongLivedToken);
  }

  private async inspectTokenInfo(
    accessToken: string
  ): Promise<MetaDebugTokenResponse['data'] | null> {
    try {
      const { appId, appSecret } = this.assertConfigured();
      const debugUrl = new URL(`${META_GRAPH_BASE}/debug_token`);
      debugUrl.searchParams.set('input_token', accessToken);
      debugUrl.searchParams.set('access_token', `${appId}|${appSecret}`);

      const debugRes = await fetchJsonWithRetry<MetaDebugTokenResponse>(debugUrl.toString(), {
        platform: this.platform,
        operationName: 'instagram_debug_token',
        method: 'GET',
        maxRetries: 1,
      });

      return debugRes.data ?? null;
    } catch {
      return null;
    }
  }

  private async exchangeForLongLivedToken(token: string): Promise<OAuthTokenBundle> {
    const { appId, appSecret } = this.assertConfigured();
    const longUrl = new URL(`${META_GRAPH_BASE}/oauth/access_token`);
    longUrl.searchParams.set('grant_type', 'fb_exchange_token');
    longUrl.searchParams.set('client_id', appId);
    longUrl.searchParams.set('client_secret', appSecret);
    longUrl.searchParams.set('fb_exchange_token', token);

    try {
      const longToken = await fetchJsonWithRetry<MetaTokenResponse>(longUrl.toString(), {
        platform: this.platform,
        operationName: 'instagram_oauth_long_lived_token',
        method: 'GET',
        maxRetries: 1,
      });

      const finalToken = longToken.access_token ?? token;
      const debugInfo = await this.inspectTokenInfo(finalToken);
      const grantedScopes =
        debugInfo?.scopes && debugInfo.scopes.length > 0
          ? debugInfo.scopes
          : INSTAGRAM_REQUIRED_SCOPES;
      const expiresInSeconds = longToken.expires_in ?? 60 * 24 * 3600;
      const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

      return {
        accessToken: finalToken,
        refreshToken: finalToken,
        tokenType: longToken.token_type ?? 'Bearer',
        expiresAt,
        refreshTokenExpiresAt: expiresAt,
        grantedScopes,
      };
    } catch {
      const debugInfo = await this.inspectTokenInfo(token);
      const grantedScopes =
        debugInfo?.scopes && debugInfo.scopes.length > 0
          ? debugInfo.scopes
          : INSTAGRAM_REQUIRED_SCOPES;

      // System User Access Tokens (SUAT) en Unified Login no caducan y no necesitan fb_exchange_token
      return {
        accessToken: token,
        refreshToken: token,
        tokenType: 'Bearer',
        expiresAt: null,
        refreshTokenExpiresAt: null,
        grantedScopes,
      };
    }
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

  private async enrichInstagramNode(
    igId: string,
    accessToken: string,
    fallback?: Partial<InstagramBusinessNode>
  ): Promise<InstagramBusinessNode | null> {
    const authHeaders = {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    };

    const fieldSets = [
      'id,username,name,profile_picture_url,followers_count,follows_count,media_count',
      'id,username,name,profile_picture_url,followers_count,media_count',
      'id,username',
    ];

    for (const fields of fieldSets) {
      try {
        const nodeUrl = new URL(`${META_GRAPH_BASE}/${igId}`);
        nodeUrl.searchParams.set('fields', fields);

        const node = await fetchJsonWithRetry<InstagramBusinessNode>(nodeUrl.toString(), {
          platform: this.platform,
          operationName: 'instagram_enrich_account_node',
          headers: authHeaders,
          maxRetries: 1,
        });

        if (node?.id) {
          return {
            ...fallback,
            ...node,
          };
        }
      } catch {
        // Reintentar con subconjunto más básico de campos
      }
    }

    if (fallback?.id) {
      return {
        id: fallback.id,
        username: fallback.username,
        name: fallback.name,
      };
    }

    return null;
  }

  private async discoverInstagramAccount(
    accessToken: string
  ): Promise<{
    igAccount: InstagramBusinessNode;
    metadata: Record<string, unknown>;
    grantedScopes: string[];
  }> {
    const authHeaders = {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    };
    const debugInfo = await this.inspectTokenInfo(accessToken);
    const grantedScopes =
      debugInfo?.scopes && debugInfo.scopes.length > 0
        ? debugInfo.scopes
        : INSTAGRAM_REQUIRED_SCOPES;

    // 1. Estándar oficial de Meta Unified Login (SUAT): /me/assigned_instagram_accounts
    for (const withFields of [true, false]) {
      try {
        const assignedUrl = new URL(`${META_GRAPH_BASE}/me/assigned_instagram_accounts`);
        if (withFields) {
          assignedUrl.searchParams.set('fields', 'id,username');
        }

        const assignedRes = await fetchJsonWithRetry<AssignedInstagramAccountsResponse>(
          assignedUrl.toString(),
          {
            platform: this.platform,
            operationName: 'instagram_discover_assigned_accounts',
            headers: authHeaders,
            maxRetries: 1,
          }
        );

        const firstAssigned = assignedRes.data?.[0];
        if (firstAssigned?.id) {
          const enriched = await this.enrichInstagramNode(
            firstAssigned.id,
            accessToken,
            firstAssigned
          );
          if (enriched?.id) {
            return {
              igAccount: enriched,
              metadata: {
                authMode: 'unified_login_suat',
                discoverySource: 'assigned_instagram_accounts',
              },
              grantedScopes,
            };
          }
        }
        if (withFields) break; // La petición respondió OK (aunque vacía), no repetir sin fields
      } catch {
        // Reintentar sin fields o pasar al siguiente método
      }
    }

    // 2. Unified Login vía client_business_id del System User (/me?fields=client_business_id)
    try {
      const meUrl = new URL(`${META_GRAPH_BASE}/me`);
      meUrl.searchParams.set('fields', 'id,client_business_id');
      const meRes = await fetchJsonWithRetry<MetaSystemUserMeResponse>(meUrl.toString(), {
        platform: this.platform,
        operationName: 'instagram_discover_client_business',
        headers: authHeaders,
        maxRetries: 1,
      });

      if (meRes.client_business_id) {
        const edges = [
          'owned_instagram_accounts',
          'instagram_accounts',
          'client_instagram_accounts',
        ] as const;

        for (const edge of edges) {
          try {
            const edgeUrl = new URL(`${META_GRAPH_BASE}/${meRes.client_business_id}/${edge}`);
            edgeUrl.searchParams.set('fields', 'id,username');

            const edgeRes = await fetchJsonWithRetry<AssignedInstagramAccountsResponse>(
              edgeUrl.toString(),
              {
                platform: this.platform,
                operationName: `instagram_discover_business_${edge}`,
                headers: authHeaders,
                maxRetries: 1,
              }
            );

            const firstIg = edgeRes.data?.[0];
            if (firstIg?.id) {
              const enriched = await this.enrichInstagramNode(firstIg.id, accessToken, firstIg);
              if (enriched?.id) {
                return {
                  igAccount: enriched,
                  metadata: {
                    authMode: 'unified_login_suat',
                    businessPortfolioId: meRes.client_business_id,
                    discoverySource: edge,
                  },
                  grantedScopes,
                };
              }
            }
          } catch {
            // Probar el siguiente edge del business
          }
        }
      }
    } catch {
      // Continuar con siguientes estrategias
    }

    // 3. Buscar vía debug_token -> granular_scopes.target_ids
    if (debugInfo?.granular_scopes && debugInfo.granular_scopes.length > 0) {
      const prioritizedScopes = debugInfo.granular_scopes
        .filter(
          (entry) =>
            typeof entry.scope === 'string' &&
            entry.scope.startsWith('instagram_') &&
            Array.isArray(entry.target_ids) &&
            entry.target_ids.length > 0
        )
        .sort((a, b) => {
          const score = (s?: string) =>
            s === 'instagram_basic' ? 0 : s === 'instagram_content_publish' ? 1 : 2;
          return score(a.scope) - score(b.scope);
        });

      const candidateIds = new Set<string>();
      for (const entry of prioritizedScopes) {
        for (const id of entry.target_ids ?? []) {
          candidateIds.add(id);
        }
      }

      for (const targetIgId of candidateIds) {
        const enriched = await this.enrichInstagramNode(targetIgId, accessToken);
        if (enriched?.id) {
          return {
            igAccount: enriched,
            metadata: {
              authMode: 'unified_login_suat',
              discoverySource: 'debug_token_granular_scopes',
            },
            grantedScopes,
          };
        }
      }
    }

    // 4. Buscar vía Páginas de Facebook vinculadas (/me/accounts)
    try {
      const accountsUrl = new URL(`${META_GRAPH_BASE}/me/accounts`);
      accountsUrl.searchParams.set(
        'fields',
        'id,name,instagram_business_account{id,username,name,profile_picture_url,followers_count,follows_count,media_count},connected_instagram_account{id,username,name,profile_picture_url,followers_count,follows_count,media_count}'
      );

      const accountsRes = await fetchJsonWithRetry<InstagramAccountsResponse>(
        accountsUrl.toString(),
        {
          platform: this.platform,
          operationName: 'instagram_discover_via_pages',
          headers: authHeaders,
          maxRetries: 1,
        }
      );

      const linkedPage = (accountsRes.data ?? []).find(
        (p) => p.instagram_business_account?.id || p.connected_instagram_account?.id
      );
      const linkedIg =
        linkedPage?.instagram_business_account ?? linkedPage?.connected_instagram_account;
      if (linkedPage && linkedIg?.id) {
        return {
          igAccount: linkedIg,
          metadata: {
            linkedFacebookPageId: linkedPage.id,
            linkedFacebookPageName: linkedPage.name ?? null,
            discoverySource: 'facebook_pages',
          },
          grantedScopes,
        };
      }
    } catch {
      // Continuar con descubrimiento vía /me/businesses
    }

    // 5. Buscar vía /me/businesses (tokens de usuario con Business Manager)
    try {
      const bizUrl = new URL(`${META_GRAPH_BASE}/me/businesses`);
      bizUrl.searchParams.set(
        'fields',
        'id,name,owned_instagram_accounts{id,username},client_instagram_accounts{id,username}'
      );

      const bizRes = await fetchJsonWithRetry<MetaBusinessesInstagramResponse>(bizUrl.toString(), {
        platform: this.platform,
        operationName: 'instagram_discover_via_businesses',
        headers: authHeaders,
        maxRetries: 1,
      });

      for (const biz of bizRes.data ?? []) {
        const directIg =
          biz.owned_instagram_accounts?.data?.[0] ?? biz.client_instagram_accounts?.data?.[0];
        if (directIg?.id) {
          const enriched = await this.enrichInstagramNode(directIg.id, accessToken, directIg);
          if (enriched?.id) {
            return {
              igAccount: enriched,
              metadata: {
                businessPortfolioId: biz.id,
                businessPortfolioName: biz.name ?? null,
                discoverySource: 'me_businesses',
              },
              grantedScopes,
            };
          }
        }
      }
    } catch {
      // Sin cuentas encontradas vía portfolio
    }

    logger.warn('instagram_account_discovery_empty', {
      tokenType: debugInfo?.type ?? 'unknown',
      isValid: debugInfo?.is_valid ?? null,
      scopesCount: debugInfo?.scopes?.length ?? 0,
      granularScopesCount: debugInfo?.granular_scopes?.length ?? 0,
    });

    throw new AppError({
      code: 'NOT_FOUND',
      message:
        'No se encontró una cuenta Profesional de Instagram vinculada a tu Página de Facebook ni a tu Portfolio Comercial de Meta.',
    });
  }

  public async fetchAccountAndVideos(accessToken: string): Promise<PlatformSyncPayload> {
    const warnings: string[] = [];
    const authHeaders = {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    };

    const { igAccount, metadata, grantedScopes } =
      await this.discoverInstagramAccount(accessToken);

    const account: ExternalAccountProfile = {
      externalAccountId: igAccount.id,
      accountName: igAccount.name ?? igAccount.username ?? 'Instagram Profesional',
      accountHandle: igAccount.username ? `@${igAccount.username}` : null,
      accountAvatarUrl: igAccount.profile_picture_url ?? null,
      followersCount: igAccount.followers_count ?? 0,
      followingCount: igAccount.follows_count ?? null,
      postsCount: igAccount.media_count ?? 0,
      permissions: grantedScopes.map((scope) => ({
        scope,
        status: 'granted',
      })),
      metadata,
    };

    let mediaRes: InstagramMediaListResponse = { data: [] };
    try {
      const mediaUrl = new URL(`${META_GRAPH_BASE}/${igAccount.id}/media`);
      mediaUrl.searchParams.set(
        'fields',
        'id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count'
      );
      mediaUrl.searchParams.set('limit', '50');

      mediaRes = await fetchJsonWithRetry<InstagramMediaListResponse>(mediaUrl.toString(), {
        platform: this.platform,
        operationName: 'instagram_media_list',
        headers: authHeaders,
      });
    } catch {
      try {
        const basicMediaUrl = new URL(`${META_GRAPH_BASE}/${igAccount.id}/media`);
        basicMediaUrl.searchParams.set(
          'fields',
          'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp'
        );
        basicMediaUrl.searchParams.set('limit', '50');

        mediaRes = await fetchJsonWithRetry<InstagramMediaListResponse>(basicMediaUrl.toString(), {
          platform: this.platform,
          operationName: 'instagram_media_list_basic',
          headers: authHeaders,
          maxRetries: 1,
        });
      } catch {
        warnings.push(
          'No se pudieron obtener las publicaciones de Instagram en esta sincronización. Verifica los permisos de la cuenta.'
        );
      }
    }

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
          'Algunas métricas de Instagram Insights (views, reach, shares) no estuvieron disponibles para ciertas publicaciones.'
        );
      }
      return { views: null, reach: null, shares: null };
    }
  }

  private extractMetaGraphError(rawBody: string): {
    message: string | null;
    code: number | null;
    subcode: number | null;
  } {
    try {
      const parsed = JSON.parse(rawBody) as {
        error?: {
          message?: string;
          error_user_msg?: string;
          error_user_title?: string;
          code?: number;
          error_subcode?: number;
        };
      };
      const err = parsed.error;
      if (!err) {
        return { message: null, code: null, subcode: null };
      }
      const userFriendly = err.error_user_msg || err.message || null;
      return {
        message: userFriendly ? userFriendly.slice(0, 260) : null,
        code: typeof err.code === 'number' ? err.code : null,
        subcode: typeof err.error_subcode === 'number' ? err.error_subcode : null,
      };
    } catch {
      return { message: null, code: null, subcode: null };
    }
  }

  public async publishVideo(
    accessToken: string,
    input: PublishVideoInput
  ): Promise<PublishVideoResult> {
    const caption = [input.title, input.description].filter(Boolean).join('\n\n').slice(0, 2200);

    const createUrl = new URL(`${META_GRAPH_BASE}/${input.externalAccountId}/media`);
    const createBody = new URLSearchParams({
      media_type: 'REELS',
      video_url: input.signedDownloadUrl,
      caption,
      share_to_feed: 'true',
      access_token: accessToken,
    });
    if (input.signedThumbnailUrl) {
      createBody.set('cover_url', input.signedThumbnailUrl);
    }

    const createResponse = await fetch(createUrl.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: createBody.toString(),
    });

    if (!createResponse.ok) {
      const rawErr = await createResponse.text().catch(() => '');
      const metaErr = this.extractMetaGraphError(rawErr);
      logger.warn('instagram_create_reel_container_failed', {
        status: createResponse.status,
        metaCode: metaErr.code,
        metaSubcode: metaErr.subcode,
      });
      throw new AppError({
        code: 'EXTERNAL_API_ERROR',
        message: metaErr.message
          ? `Instagram rechazó el video al crear el contenedor: ${metaErr.message}`
          : `Instagram rechazó el video al crear el contenedor (HTTP ${createResponse.status}).`,
      });
    }

    const containerRes = (await createResponse.json()) as { id?: string };
    const creationId = containerRes.id;
    if (!creationId) {
      throw new AppError({
        code: 'EXTERNAL_API_ERROR',
        message: 'Instagram no devolvió un ID de contenedor para el Reel.',
      });
    }

    // Esperar hasta que Meta descargue y transcodifique el video (hasta ~42 segundos)
    let isContainerReady = false;
    let lastStatusCode = 'IN_PROGRESS';
    let lastStatusDetail = '';

    for (let attempt = 0; attempt < 14; attempt += 1) {
      await new Promise((r) => setTimeout(r, 3000));
      const statusUrl = new URL(`${META_GRAPH_BASE}/${creationId}`);
      statusUrl.searchParams.set('fields', 'status_code,status');
      statusUrl.searchParams.set('access_token', accessToken);

      const statusRes = await fetchJsonWithRetry<{ status_code?: string; status?: string }>(
        statusUrl.toString(),
        {
          platform: this.platform,
          operationName: 'instagram_check_container_status',
          method: 'GET',
          maxRetries: 1,
        }
      );

      lastStatusCode = statusRes.status_code ?? 'IN_PROGRESS';
      lastStatusDetail = statusRes.status ?? '';

      if (lastStatusCode === 'FINISHED' || lastStatusCode === 'PUBLISHED') {
        isContainerReady = true;
        break;
      }
      if (lastStatusCode === 'ERROR' || lastStatusCode === 'EXPIRED') {
        logger.warn('instagram_container_processing_failed', {
          statusCode: lastStatusCode,
          statusDetail: lastStatusDetail.slice(0, 200),
        });
        throw new AppError({
          code: 'EXTERNAL_API_ERROR',
          message: lastStatusDetail
            ? `Instagram no pudo procesar el Reel (${lastStatusCode}): ${lastStatusDetail.slice(0, 200)}`
            : `Instagram no pudo procesar el video (estado: ${lastStatusCode}). Verifica formato MP4 H.264 / AAC y relación 9:16.`,
        });
      }
    }

    if (!isContainerReady) {
      throw new AppError({
        code: 'EXTERNAL_API_ERROR',
        message: `Instagram sigue procesando el video tras 42 segundos (estado: ${lastStatusCode}). Prueba con un archivo más ligero o vuelve a intentarlo en unos segundos.`,
      });
    }

    const publishUrl = new URL(`${META_GRAPH_BASE}/${input.externalAccountId}/media_publish`);
    const publishBody = new URLSearchParams({
      creation_id: creationId,
      access_token: accessToken,
    });

    let publishedId: string | null = null;
    for (let publishAttempt = 0; publishAttempt < 3; publishAttempt += 1) {
      const pubResponse = await fetch(publishUrl.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: publishBody.toString(),
      });

      if (pubResponse.ok) {
        const published = (await pubResponse.json()) as { id?: string };
        publishedId = published.id ?? creationId;
        break;
      }

      const rawErr = await pubResponse.text().catch(() => '');
      const metaErr = this.extractMetaGraphError(rawErr);

      // Subcode 2207027 = "Media ID is not available" (propagación interna tras FINISHED)
      const isNotReadyYet =
        metaErr.subcode === 2207027 ||
        metaErr.code === 9007 ||
        (metaErr.message?.toLowerCase().includes('not ready') ?? false);

      if (isNotReadyYet && publishAttempt < 2) {
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }

      logger.warn('instagram_publish_reel_failed', {
        status: pubResponse.status,
        metaCode: metaErr.code,
        metaSubcode: metaErr.subcode,
      });

      throw new AppError({
        code: 'EXTERNAL_API_ERROR',
        message: metaErr.message
          ? `Instagram no pudo publicar el Reel: ${metaErr.message}`
          : `Instagram no pudo publicar el Reel (HTTP ${pubResponse.status}).`,
      });
    }

    const finalPostId = publishedId ?? creationId;
    let permalink = 'https://www.instagram.com/';

    try {
      const permalinkUrl = new URL(`${META_GRAPH_BASE}/${finalPostId}`);
      permalinkUrl.searchParams.set('fields', 'permalink');
      permalinkUrl.searchParams.set('access_token', accessToken);
      const permalinkRes = await fetchJsonWithRetry<{ permalink?: string }>(
        permalinkUrl.toString(),
        {
          platform: this.platform,
          operationName: 'instagram_fetch_published_permalink',
          method: 'GET',
          maxRetries: 0,
        }
      );
      if (permalinkRes.permalink) {
        permalink = permalinkRes.permalink;
      }
    } catch {
      // Mantener URL base de Instagram si el permalink aún no está disponible
    }

    return {
      externalPostId: finalPostId,
      externalPostUrl: permalink,
      finalStatus: 'published',
    };
  }
}
