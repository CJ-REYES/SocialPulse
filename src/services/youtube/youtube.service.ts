import { AppError } from '@/lib/utils/errors';
import { parseIso8601DurationToSeconds } from '@/lib/utils/format';
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

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const YOUTUBE_DATA_API_BASE = 'https://www.googleapis.com/youtube/v3';
const YOUTUBE_ANALYTICS_API_BASE = 'https://youtubeanalytics.googleapis.com/v2';

const YOUTUBE_REQUIRED_SCOPES = [
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
];

interface GoogleTokenApiResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
}

interface YouTubeChannelListResponse {
  items?: Array<{
    id: string;
    snippet?: {
      title?: string;
      customUrl?: string;
      thumbnails?: {
        high?: { url?: string };
        default?: { url?: string };
      };
    };
    statistics?: {
      viewCount?: string;
      subscriberCount?: string;
      hiddenSubscriberCount?: boolean;
      videoCount?: string;
    };
    contentDetails?: {
      relatedPlaylists?: {
        uploads?: string;
      };
    };
  }>;
}

interface YouTubePlaylistItemsResponse {
  nextPageToken?: string;
  items?: Array<{
    contentDetails?: {
      videoId?: string;
      videoPublishedAt?: string;
    };
  }>;
}

interface YouTubeVideosListResponse {
  items?: Array<{
    id: string;
    snippet?: {
      title?: string;
      description?: string;
      publishedAt?: string;
      thumbnails?: {
        maxres?: { url?: string };
        high?: { url?: string };
        medium?: { url?: string };
      };
    };
    contentDetails?: {
      duration?: string;
    };
    statistics?: {
      viewCount?: string;
      likeCount?: string;
      commentCount?: string;
    };
  }>;
}

interface YouTubeAnalyticsReportResponse {
  columnHeaders?: Array<{ name: string }>;
  rows?: Array<Array<string | number>>;
}

export class YouTubeService implements SocialPlatformService {
  public readonly platform = 'youtube' as const;

  private resolveRedirectUri(): string | null {
    if (process.env.YOUTUBE_REDIRECT_URI) return process.env.YOUTUBE_REDIRECT_URI;
    if (process.env.NEXT_PUBLIC_APP_URL) {
      return `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}/api/oauth/youtube/callback`;
    }
    return null;
  }

  public getConfigStatus(): PlatformConfigStatus {
    const missingEnvVars: string[] = [];
    if (!process.env.YOUTUBE_CLIENT_ID) missingEnvVars.push('YOUTUBE_CLIENT_ID');
    if (!process.env.YOUTUBE_CLIENT_SECRET) missingEnvVars.push('YOUTUBE_CLIENT_SECRET');
    if (!this.resolveRedirectUri()) missingEnvVars.push('YOUTUBE_REDIRECT_URI');

    return {
      platform: this.platform,
      isConfigured: missingEnvVars.length === 0,
      missingEnvVars,
      requiresPkce: true,
      requiresAppReviewNote:
        'Requiere proyecto en Google Cloud Console con YouTube Data API v3 y YouTube Analytics API habilitadas. En modo Testing permite hasta 100 usuarios de prueba sin verificación de marca.',
      requiredScopes: YOUTUBE_REQUIRED_SCOPES,
    };
  }

  private assertConfigured(): {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  } {
    const status = this.getConfigStatus();
    if (!status.isConfigured) {
      throw new AppError({
        code: 'OAUTH_CONFIG_MISSING',
        message: `Faltan variables de entorno para YouTube OAuth: ${status.missingEnvVars.join(', ')}`,
      });
    }
    return {
      clientId: process.env.YOUTUBE_CLIENT_ID!,
      clientSecret: process.env.YOUTUBE_CLIENT_SECRET!,
      redirectUri: this.resolveRedirectUri()!,
    };
  }

  public buildAuthorizationUrl(params: OAuthAuthorizationUrlParams): string {
    const { clientId, redirectUri } = this.assertConfigured();
    const url = new URL(GOOGLE_AUTH_URL);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', YOUTUBE_REQUIRED_SCOPES.join(' '));
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('include_granted_scopes', 'true');
    url.searchParams.set('state', params.state);

    if (params.codeChallenge) {
      url.searchParams.set('code_challenge', params.codeChallenge);
      url.searchParams.set('code_challenge_method', 'S256');
    }

    return url.toString();
  }

  public async exchangeCodeForTokens(params: OAuthExchangeCodeParams): Promise<OAuthTokenBundle> {
    const { clientId, clientSecret, redirectUri } = this.assertConfigured();
    const body = new URLSearchParams({
      code: params.code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });

    if (params.codeVerifier) {
      body.set('code_verifier', params.codeVerifier);
    }

    const tokenRes = await fetchJsonWithRetry<GoogleTokenApiResponse>(GOOGLE_TOKEN_URL, {
      platform: this.platform,
      operationName: 'youtube_oauth_token_exchange',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    const expiresAt = tokenRes.expires_in
      ? new Date(Date.now() + tokenRes.expires_in * 1000).toISOString()
      : null;

    const grantedScopes = tokenRes.scope
      ? tokenRes.scope.split(' ').filter(Boolean)
      : YOUTUBE_REQUIRED_SCOPES;

    return {
      accessToken: tokenRes.access_token,
      refreshToken: tokenRes.refresh_token ?? null,
      tokenType: tokenRes.token_type ?? 'Bearer',
      expiresAt,
      refreshTokenExpiresAt: null,
      grantedScopes,
    };
  }

  public async refreshAccessToken(refreshToken: string): Promise<OAuthTokenBundle> {
    const { clientId, clientSecret } = this.assertConfigured();
    const body = new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    });

    const tokenRes = await fetchJsonWithRetry<GoogleTokenApiResponse>(GOOGLE_TOKEN_URL, {
      platform: this.platform,
      operationName: 'youtube_oauth_token_refresh',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    const expiresAt = tokenRes.expires_in
      ? new Date(Date.now() + tokenRes.expires_in * 1000).toISOString()
      : null;

    return {
      accessToken: tokenRes.access_token,
      refreshToken: tokenRes.refresh_token ?? refreshToken,
      tokenType: tokenRes.token_type ?? 'Bearer',
      expiresAt,
      refreshTokenExpiresAt: null,
      grantedScopes: tokenRes.scope
        ? tokenRes.scope.split(' ').filter(Boolean)
        : YOUTUBE_REQUIRED_SCOPES,
    };
  }

  public async revokeToken(accessToken: string): Promise<void> {
    const url = `${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(accessToken)}`;
    await fetchJsonWithRetry<Record<string, unknown>>(url, {
      platform: this.platform,
      operationName: 'youtube_oauth_revoke',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
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

    const channelUrl = `${YOUTUBE_DATA_API_BASE}/channels?part=snippet,statistics,contentDetails&mine=true`;
    const channelRes = await fetchJsonWithRetry<YouTubeChannelListResponse>(channelUrl, {
      platform: this.platform,
      operationName: 'youtube_channels_mine',
      headers: authHeaders,
    });

    const channel = channelRes.items?.[0];
    if (!channel) {
      throw new AppError({
        code: 'NOT_FOUND',
        message: 'La cuenta de Google autenticada no tiene ningún canal de YouTube activo.',
      });
    }

    const subscribersHidden = Boolean(channel.statistics?.hiddenSubscriberCount);
    if (subscribersHidden) {
      warnings.push(
        'El canal de YouTube tiene oculto el contador público de suscriptores; la API reporta 0.'
      );
    }

    const account: ExternalAccountProfile = {
      externalAccountId: channel.id,
      accountName: channel.snippet?.title ?? 'Canal de YouTube',
      accountHandle: channel.snippet?.customUrl ?? null,
      accountAvatarUrl:
        channel.snippet?.thumbnails?.high?.url ??
        channel.snippet?.thumbnails?.default?.url ??
        null,
      followersCount: subscribersHidden
        ? 0
        : Number.parseInt(channel.statistics?.subscriberCount ?? '0', 10),
      followingCount: null,
      postsCount: Number.parseInt(channel.statistics?.videoCount ?? '0', 10),
      permissions: YOUTUBE_REQUIRED_SCOPES.map((scope) => ({
        scope,
        status: 'granted',
      })),
      metadata: {
        totalChannelViews: Number.parseInt(channel.statistics?.viewCount ?? '0', 10),
        hiddenSubscriberCount: subscribersHidden,
      },
    };

    const uploadsPlaylistId = channel.contentDetails?.relatedPlaylists?.uploads;
    if (!uploadsPlaylistId) {
      return { account, videos: [], warnings };
    }

    // Recuperar IDs de videos del playlist de subidas (hasta 100 videos por sincronización)
    const videoIds: string[] = [];
    let pageToken: string | undefined;

    for (let page = 0; page < 2; page += 1) {
      const playlistUrl = new URL(`${YOUTUBE_DATA_API_BASE}/playlistItems`);
      playlistUrl.searchParams.set('part', 'contentDetails');
      playlistUrl.searchParams.set('playlistId', uploadsPlaylistId);
      playlistUrl.searchParams.set('maxResults', '50');
      if (pageToken) {
        playlistUrl.searchParams.set('pageToken', pageToken);
      }

      const playlistRes = await fetchJsonWithRetry<YouTubePlaylistItemsResponse>(
        playlistUrl.toString(),
        {
          platform: this.platform,
          operationName: 'youtube_playlist_items',
          headers: authHeaders,
        }
      );

      for (const item of playlistRes.items ?? []) {
        if (item.contentDetails?.videoId) {
          videoIds.push(item.contentDetails.videoId);
        }
      }

      pageToken = playlistRes.nextPageToken;
      if (!pageToken) break;
    }

    if (videoIds.length === 0) {
      return { account, videos: [], warnings };
    }

    // Consultar YouTube Analytics API v2 para obtener shares, estimatedMinutesWatched y averageViewDuration
    const analyticsMap = await this.fetchAnalyticsForVideos(accessToken, videoIds, warnings);

    const videos: ExternalVideoItem[] = [];
    for (let i = 0; i < videoIds.length; i += 50) {
      const batchIds = videoIds.slice(i, i + 50);
      const videosUrl = new URL(`${YOUTUBE_DATA_API_BASE}/videos`);
      videosUrl.searchParams.set('part', 'snippet,contentDetails,statistics');
      videosUrl.searchParams.set('id', batchIds.join(','));

      const videosRes = await fetchJsonWithRetry<YouTubeVideosListResponse>(
        videosUrl.toString(),
        {
          platform: this.platform,
          operationName: 'youtube_videos_list',
          headers: authHeaders,
        }
      );

      for (const item of videosRes.items ?? []) {
        const durationSeconds = parseIso8601DurationToSeconds(item.contentDetails?.duration);
        const isShort = durationSeconds !== null && durationSeconds > 0 && durationSeconds <= 60;
        const analytics = analyticsMap.get(item.id);

        const unavailableMetrics = ['reach', 'impressions'];
        if (item.statistics?.likeCount === undefined) unavailableMetrics.push('likes');
        if (item.statistics?.commentCount === undefined) unavailableMetrics.push('comments');
        if (!analytics) {
          unavailableMetrics.push('shares', 'watch_time_minutes', 'avg_view_duration_seconds');
        }

        videos.push({
          externalVideoId: item.id,
          title: item.snippet?.title ?? 'Sin título',
          description: item.snippet?.description ?? null,
          thumbnailUrl:
            item.snippet?.thumbnails?.maxres?.url ??
            item.snippet?.thumbnails?.high?.url ??
            item.snippet?.thumbnails?.medium?.url ??
            null,
          permalink: isShort
            ? `https://www.youtube.com/shorts/${item.id}`
            : `https://www.youtube.com/watch?v=${item.id}`,
          durationSeconds,
          publishedAt: item.snippet?.publishedAt ?? new Date().toISOString(),
          contentType: isShort ? 'short' : 'video',
          viewsCount: Number.parseInt(item.statistics?.viewCount ?? '0', 10),
          likesCount: Number.parseInt(item.statistics?.likeCount ?? '0', 10),
          commentsCount: Number.parseInt(item.statistics?.commentCount ?? '0', 10),
          sharesCount: analytics?.shares ?? null,
          reachCount: null, // No disponible en YouTube Data API v3
          impressionsCount: null, // No expuesto en YouTube Analytics REST API estándar
          watchTimeMinutes: analytics?.estimatedMinutesWatched ?? null,
          avgViewDurationSeconds: analytics?.averageViewDuration ?? null,
          unavailableMetrics,
          rawMetadata: {
            isoDuration: item.contentDetails?.duration ?? null,
          },
        });
      }
    }

    return { account, videos, warnings };
  }

  private async fetchAnalyticsForVideos(
    accessToken: string,
    videoIds: string[],
    warnings: string[]
  ): Promise<
    Map<
      string,
      {
        shares: number;
        estimatedMinutesWatched: number;
        averageViewDuration: number;
      }
    >
  > {
    const result = new Map<
      string,
      {
        shares: number;
        estimatedMinutesWatched: number;
        averageViewDuration: number;
      }
    >();

    try {
      const endDate = new Date().toISOString().slice(0, 10);
      const startDate = '2015-01-01';
      const batchIds = videoIds.slice(0, 200).join(',');

      const reportUrl = new URL(`${YOUTUBE_ANALYTICS_API_BASE}/reports`);
      reportUrl.searchParams.set('ids', 'channel==MINE');
      reportUrl.searchParams.set('startDate', startDate);
      reportUrl.searchParams.set('endDate', endDate);
      reportUrl.searchParams.set(
        'metrics',
        'views,estimatedMinutesWatched,averageViewDuration,shares'
      );
      reportUrl.searchParams.set('dimensions', 'video');
      reportUrl.searchParams.set('filters', `video==${batchIds}`);
      reportUrl.searchParams.set('maxResults', '200');

      const reportRes = await fetchJsonWithRetry<YouTubeAnalyticsReportResponse>(
        reportUrl.toString(),
        {
          platform: this.platform,
          operationName: 'youtube_analytics_reports',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
          },
          maxRetries: 1,
        }
      );

      for (const row of reportRes.rows ?? []) {
        const videoId = String(row[0] ?? '');
        const estimatedMinutesWatched = Number(row[2] ?? 0);
        const averageViewDuration = Number(row[3] ?? 0);
        const shares = Number(row[4] ?? 0);

        if (videoId) {
          result.set(videoId, {
            shares,
            estimatedMinutesWatched,
            averageViewDuration,
          });
        }
      }
    } catch {
      warnings.push(
        'YouTube Analytics API v2 no devolvió métricas extendidas (compartidos / tiempo de visualización). Se mantienen las métricas base de YouTube Data API v3.'
      );
    }

    return result;
  }
}
