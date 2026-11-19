import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { videoLibraryQuerySchema } from '@/lib/validation/schemas';
import { AppError } from '@/lib/utils/errors';
import { mapSocialAccountRow } from '@/features/connections/connections.service';
import type { Database } from '@/types/database';
import type {
  SocialAccount,
  VideoMetricSnapshot,
  VideoRecord,
} from '@/types/domain';

type VideoRow = Database['public']['Tables']['videos']['Row'];
type VideoMetricRow = Database['public']['Tables']['video_metrics']['Row'];
type SocialAccountRow = Database['public']['Tables']['social_accounts']['Row'];

export function mapVideoRow(row: VideoRow): VideoRecord {
  return {
    id: row.id,
    socialAccountId: row.social_account_id,
    userId: row.user_id,
    platform: row.platform,
    externalVideoId: row.external_video_id,
    title: row.title,
    description: row.description,
    thumbnailUrl: row.thumbnail_url,
    permalink: row.permalink,
    durationSeconds: row.duration_seconds,
    publishedAt: row.published_at,
    contentType: row.content_type,
    syncStatus: row.sync_status,
    viewsCount: Number(row.views_count ?? 0),
    likesCount: Number(row.likes_count ?? 0),
    commentsCount: Number(row.comments_count ?? 0),
    sharesCount: row.shares_count !== null ? Number(row.shares_count) : null,
    reachCount: row.reach_count !== null ? Number(row.reach_count) : null,
    impressionsCount: row.impressions_count !== null ? Number(row.impressions_count) : null,
    watchTimeMinutes: row.watch_time_minutes !== null ? Number(row.watch_time_minutes) : null,
    avgViewDurationSeconds:
      row.avg_view_duration_seconds !== null ? Number(row.avg_view_duration_seconds) : null,
    unavailableMetrics: row.unavailable_metrics ?? [],
    rawMetadata: (row.raw_metadata as Record<string, unknown>) ?? {},
    lastSyncedAt: row.last_synced_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapVideoMetricRow(row: VideoMetricRow): VideoMetricSnapshot {
  return {
    id: row.id,
    videoId: row.video_id,
    socialAccountId: row.social_account_id,
    userId: row.user_id,
    platform: row.platform,
    snapshotDate: row.snapshot_date,
    snapshotHour: row.snapshot_hour,
    capturedAt: row.captured_at,
    viewsCount: Number(row.views_count ?? 0),
    likesCount: Number(row.likes_count ?? 0),
    commentsCount: Number(row.comments_count ?? 0),
    sharesCount: row.shares_count !== null ? Number(row.shares_count) : null,
    reachCount: row.reach_count !== null ? Number(row.reach_count) : null,
    impressionsCount: row.impressions_count !== null ? Number(row.impressions_count) : null,
    followersCountSnapshot:
      row.followers_count_snapshot !== null ? Number(row.followers_count_snapshot) : null,
    watchTimeMinutes: row.watch_time_minutes !== null ? Number(row.watch_time_minutes) : null,
    avgViewDurationSeconds:
      row.avg_view_duration_seconds !== null ? Number(row.avg_view_duration_seconds) : null,
    viewsDelta: Number(row.views_delta ?? 0),
    likesDelta: Number(row.likes_delta ?? 0),
    commentsDelta: Number(row.comments_delta ?? 0),
    sharesDelta: row.shares_delta !== null ? Number(row.shares_delta) : null,
    createdAt: row.created_at,
  };
}

export interface PaginatedVideosResult {
  items: VideoRecord[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function queryVideosLibrary(
  userId: string,
  rawQuery: Record<string, unknown>
): Promise<PaginatedVideosResult> {
  const parsed = videoLibraryQuerySchema.safeParse(rawQuery);
  const filters = parsed.success
    ? parsed.data
    : {
        platform: 'all' as const,
        syncStatus: 'all' as const,
        search: '',
        sortBy: 'published_at' as const,
        sortOrder: 'desc' as const,
        page: 1,
        pageSize: 20,
        from: undefined,
        to: undefined,
      };

  if (!isSupabaseConfigured()) {
    return {
      items: [],
      totalCount: 0,
      page: filters.page,
      pageSize: filters.pageSize,
      totalPages: 0,
    };
  }

  const supabase = await createClient();
  let query = supabase
    .from('videos')
    .select('*', { count: 'exact' })
    .eq('user_id', userId);

  if (filters.platform !== 'all') {
    query = query.eq('platform', filters.platform);
  }

  if (filters.syncStatus !== 'all') {
    query = query.eq('sync_status', filters.syncStatus);
  }

  if (filters.search) {
    const escapedSearch = filters.search.replace(/[%_]/g, '');
    if (escapedSearch.length > 0) {
      query = query.ilike('title', `%${escapedSearch}%`);
    }
  }

  if (filters.from) {
    query = query.gte('published_at', `${filters.from}T00:00:00.000Z`);
  }

  if (filters.to) {
    query = query.lte('published_at', `${filters.to}T23:59:59.999Z`);
  }

  const offset = (filters.page - 1) * filters.pageSize;
  query = query
    .order(filters.sortBy, { ascending: filters.sortOrder === 'asc', nullsFirst: false })
    .range(offset, offset + filters.pageSize - 1);

  const { data, count, error } = await query;

  if (error) {
    throw new AppError({
      code: 'DATABASE_ERROR',
      message: `Error al consultar la biblioteca de videos: ${error.message}`,
    });
  }

  const rows = (data ?? []) as VideoRow[];
  const totalCount = count ?? 0;

  return {
    items: rows.map(mapVideoRow),
    totalCount,
    page: filters.page,
    pageSize: filters.pageSize,
    totalPages: Math.ceil(totalCount / filters.pageSize),
  };
}

export interface VideoDetailBundle {
  video: VideoRecord;
  account: SocialAccount | null;
  snapshots: VideoMetricSnapshot[];
}

export async function getVideoDetailWithHistory(
  userId: string,
  videoId: string
): Promise<VideoDetailBundle | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = await createClient();
  const { data: rawVideo, error: videoErr } = await supabase
    .from('videos')
    .select('*')
    .eq('id', videoId)
    .eq('user_id', userId)
    .maybeSingle();

  if (videoErr || !rawVideo) {
    return null;
  }

  const videoRow = rawVideo as VideoRow;

  const [accountRes, metricsRes] = await Promise.all([
    supabase
      .from('social_accounts')
      .select('*')
      .eq('id', videoRow.social_account_id)
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('video_metrics')
      .select('*')
      .eq('video_id', videoRow.id)
      .eq('user_id', userId)
      .order('captured_at', { ascending: true })
      .limit(365),
  ]);

  const accountRow = (accountRes.data ?? null) as SocialAccountRow | null;
  const metricRows = (metricsRes.data ?? []) as VideoMetricRow[];

  return {
    video: mapVideoRow(videoRow),
    account: accountRow ? mapSocialAccountRow(accountRow) : null,
    snapshots: metricRows.map(mapVideoMetricRow),
  };
}
