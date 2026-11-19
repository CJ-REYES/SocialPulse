export const PLATFORMS = ['youtube', 'tiktok', 'instagram', 'facebook'] as const;
export type Platform = (typeof PLATFORMS)[number];

export const CONNECTION_STATUSES = [
  'connected',
  'expired',
  'revoked',
  'error',
  'pending_review',
] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

export const CONTENT_TYPES = ['video', 'short', 'reel', 'live'] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const SYNC_STATUSES = ['synced', 'pending', 'partial', 'error'] as const;
export type SyncStatus = (typeof SYNC_STATUSES)[number];

export const SYNC_JOB_STATUSES = [
  'pending',
  'running',
  'completed',
  'partial_failure',
  'failed',
  'skipped_rate_limit',
] as const;
export type SyncJobStatus = (typeof SYNC_JOB_STATUSES)[number];

export const TRIGGER_SOURCES = ['manual', 'cron', 'oauth_callback', 'retry'] as const;
export type TriggerSource = (typeof TRIGGER_SOURCES)[number];

export const DATE_RANGE_PRESETS = ['24h', '7d', '30d', '90d', '12m', 'custom'] as const;
export type DateRangePreset = (typeof DATE_RANGE_PRESETS)[number];

export const PERMISSION_STATUSES = [
  'granted',
  'denied',
  'expired',
  'pending_app_review',
] as const;
export type PermissionStatus = (typeof PERMISSION_STATUSES)[number];

export interface UserProfile {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  role: 'owner' | 'admin' | 'viewer';
  timezone: string;
  createdAt: string;
  updatedAt: string;
}

export interface SocialAccount {
  id: string;
  userId: string;
  platform: Platform;
  externalAccountId: string;
  accountName: string;
  accountHandle: string | null;
  accountAvatarUrl: string | null;
  followersCount: number;
  followingCount: number | null;
  postsCount: number;
  connectionStatus: ConnectionStatus;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  lastSyncedAt: string | null;
  nextAllowedSyncAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformPermission {
  id: string;
  socialAccountId: string;
  userId: string;
  platform: Platform;
  scope: string;
  status: PermissionStatus;
  grantedAt: string;
  expiresAt: string | null;
}

export interface VideoRecord {
  id: string;
  socialAccountId: string;
  userId: string;
  platform: Platform;
  externalVideoId: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  permalink: string;
  durationSeconds: number | null;
  publishedAt: string;
  contentType: ContentType;
  syncStatus: SyncStatus;
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
  lastSyncedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface VideoMetricSnapshot {
  id: string;
  videoId: string;
  socialAccountId: string;
  userId: string;
  platform: Platform;
  snapshotDate: string;
  snapshotHour: string;
  capturedAt: string;
  viewsCount: number;
  likesCount: number;
  commentsCount: number;
  sharesCount: number | null;
  reachCount: number | null;
  impressionsCount: number | null;
  followersCountSnapshot: number | null;
  watchTimeMinutes: number | null;
  avgViewDurationSeconds: number | null;
  viewsDelta: number;
  likesDelta: number;
  commentsDelta: number;
  sharesDelta: number | null;
  createdAt: string;
}

export interface SyncJobRecord {
  id: string;
  userId: string;
  socialAccountId: string | null;
  platform: Platform | null;
  triggerSource: TriggerSource;
  status: SyncJobStatus;
  idempotencyKey: string;
  videosProcessed: number;
  metricsCaptured: number;
  attemptCount: number;
  maxAttempts: number;
  nextRetryAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SyncLogRecord {
  id: string;
  syncJobId: string;
  userId: string;
  socialAccountId: string | null;
  platform: Platform | null;
  level: 'info' | 'warn' | 'error';
  eventType: string;
  message: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface DateRangeFilter {
  preset: DateRangePreset;
  startDate: Date;
  endDate: Date;
  previousStartDate: Date;
  previousEndDate: Date;
}

export interface PeriodComparisonMetric {
  current: number;
  previous: number;
  absoluteDelta: number;
  percentageChange: number | null;
}

export interface PlatformSummaryStats {
  platform: Platform;
  connectedAccounts: number;
  connectionStatus: ConnectionStatus | 'disconnected';
  followersCount: number;
  totalVideos: number;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number | null;
  totalInteractions: number;
  averageViewsPerVideo: number;
  viewsSharePercentage: number;
  periodGrowthPercentage: number | null;
  methodologyNote: string;
}

export interface TimeSeriesPoint {
  date: string;
  youtube: number;
  tiktok: number;
  instagram: number;
  facebook: number;
  total: number;
}

export interface DashboardOverviewData {
  filter: {
    preset: DateRangePreset;
    startDate: string;
    endDate: string;
    platform: Platform | 'all';
  };
  totals: {
    views: PeriodComparisonMetric;
    videos: PeriodComparisonMetric;
    followers: number;
    interactions: PeriodComparisonMetric;
    averageViewsPerVideo: PeriodComparisonMetric;
  };
  topPlatform: PlatformSummaryStats | null;
  mostPopularVideo: VideoRecord | null;
  fastestGrowingVideos: Array<{
    video: VideoRecord;
    viewsGrowthInPeriod: number;
    growthRatePercentage: number | null;
  }>;
  platformSummaries: PlatformSummaryStats[];
  timeSeries: TimeSeriesPoint[];
  accounts: SocialAccount[];
  recentSyncJobs: SyncJobRecord[];
  has24hData: boolean;
}
