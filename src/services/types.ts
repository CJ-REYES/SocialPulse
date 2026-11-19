import type { ContentType, PermissionStatus, Platform } from '@/types/domain';

export interface OAuthAuthorizationUrlParams {
  state: string;
  codeChallenge?: string;
}

export interface OAuthExchangeCodeParams {
  code: string;
  codeVerifier?: string;
}

export interface OAuthTokenBundle {
  accessToken: string;
  refreshToken: string | null;
  tokenType: string;
  expiresAt: string | null;
  refreshTokenExpiresAt: string | null;
  grantedScopes: string[];
  rawMetadata?: Record<string, unknown>;
}

export interface ExternalAccountProfile {
  externalAccountId: string;
  accountName: string;
  accountHandle: string | null;
  accountAvatarUrl: string | null;
  followersCount: number;
  followingCount: number | null;
  postsCount: number;
  permissions: Array<{
    scope: string;
    status: PermissionStatus;
  }>;
  metadata: Record<string, unknown>;
  /**
   * Para Facebook Pages, el Page Access Token derivado del User Access Token
   * se almacena cifrado en oauth_credentials para llamadas subsecuentes a la página.
   */
  pageAccessToken?: string;
}

export interface ExternalVideoItem {
  externalVideoId: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  permalink: string;
  durationSeconds: number | null;
  publishedAt: string;
  contentType: ContentType;
  viewsCount: number;
  likesCount: number;
  commentsCount: number;
  sharesCount: number | null;
  reachCount: number | null;
  impressionsCount: number | null;
  watchTimeMinutes: number | null;
  avgViewDurationSeconds: number | null;
  unavailableMetrics: string[];
  rawMetadata: Record<string, unknown>;
}

export interface PlatformSyncPayload {
  account: ExternalAccountProfile;
  videos: ExternalVideoItem[];
  warnings: string[];
}

export interface PlatformConfigStatus {
  platform: Platform;
  isConfigured: boolean;
  missingEnvVars: string[];
  requiresPkce: boolean;
  requiresAppReviewNote: string;
  requiredScopes: string[];
}

export interface SocialPlatformService {
  readonly platform: Platform;
  getConfigStatus(): PlatformConfigStatus;
  buildAuthorizationUrl(params: OAuthAuthorizationUrlParams): string;
  exchangeCodeForTokens(params: OAuthExchangeCodeParams): Promise<OAuthTokenBundle>;
  refreshAccessToken(refreshTokenOrCurrentToken: string): Promise<OAuthTokenBundle>;
  revokeToken(accessToken: string): Promise<void>;
  fetchAccountAndVideos(accessToken: string): Promise<PlatformSyncPayload>;
}
