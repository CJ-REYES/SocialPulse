import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import {
  getPlatformMethodologyNote,
  resolveDateRangeFilter,
} from '@/lib/utils/format';
import { dashboardFilterSchema } from '@/lib/validation/schemas';
import { mapSocialAccountRow } from '@/features/connections/connections.service';
import { mapSyncJobRow } from '@/features/synchronization/sync.service';
import { mapVideoMetricRow, mapVideoRow } from '@/features/videos/videos.repository';
import {
  PLATFORMS,
  type DashboardOverviewData,
  type PeriodComparisonMetric,
  type Platform,
  type PlatformSummaryStats,
  type SocialAccount,
  type TimeSeriesPoint,
  type VideoMetricSnapshot,
  type VideoRecord,
} from '@/types/domain';
import type { Database } from '@/types/database';

type SocialAccountRow = Database['public']['Tables']['social_accounts']['Row'];
type VideoRow = Database['public']['Tables']['videos']['Row'];
type VideoMetricRow = Database['public']['Tables']['video_metrics']['Row'];
type SyncJobRow = Database['public']['Tables']['sync_jobs']['Row'];

export function computePeriodComparison(
  current: number,
  previous: number
): PeriodComparisonMetric {
  const safeCurrent = Number.isFinite(current) ? current : 0;
  const safePrevious = Number.isFinite(previous) ? previous : 0;
  const absoluteDelta = safeCurrent - safePrevious;

  let percentageChange: number | null = null;
  if (safePrevious > 0) {
    percentageChange = Number(((absoluteDelta / safePrevious) * 100).toFixed(2));
  } else if (safePrevious === 0 && safeCurrent > 0) {
    percentageChange = 100;
  }

  return {
    current: safeCurrent,
    previous: safePrevious,
    absoluteDelta,
    percentageChange,
  };
}

export function calculateInteractions(video: {
  likesCount: number;
  commentsCount: number;
  sharesCount: number | null;
}): number {
  return video.likesCount + video.commentsCount + (video.sharesCount ?? 0);
}

export function buildAnalyticsOverviewFromRecords(params: {
  accounts: SocialAccount[];
  videos: VideoRecord[];
  snapshots: VideoMetricSnapshot[];
  recentSyncJobs: DashboardOverviewData['recentSyncJobs'];
  preset: DashboardOverviewData['filter']['preset'];
  platformFilter: Platform | 'all';
  startDate: Date;
  endDate: Date;
  previousStartDate: Date;
  previousEndDate: Date;
}): DashboardOverviewData {
  const {
    accounts,
    videos,
    snapshots,
    recentSyncJobs,
    preset,
    platformFilter,
    startDate,
    endDate,
    previousStartDate,
    previousEndDate,
  } = params;

  const filteredVideos =
    platformFilter === 'all'
      ? videos
      : videos.filter((v) => v.platform === platformFilter);

  const filteredAccounts =
    platformFilter === 'all'
      ? accounts
      : accounts.filter((a) => a.platform === platformFilter);

  // Videos publicados o con actividad en el período actual vs período anterior equivalente
  const currentPeriodVideos = filteredVideos.filter((v) => {
    const pubDate = new Date(v.publishedAt);
    return pubDate >= startDate && pubDate <= endDate;
  });

  const previousPeriodVideos = filteredVideos.filter((v) => {
    const pubDate = new Date(v.publishedAt);
    return pubDate >= previousStartDate && pubDate < previousEndDate;
  });

  // Si hay snapshots históricos dentro del período, también medimos los deltas capturados
  const currentSnapshots = snapshots.filter((s) => {
    if (platformFilter !== 'all' && s.platform !== platformFilter) return false;
    const capDate = new Date(s.capturedAt);
    return capDate >= startDate && capDate <= endDate;
  });

  const previousSnapshots = snapshots.filter((s) => {
    if (platformFilter !== 'all' && s.platform !== platformFilter) return false;
    const capDate = new Date(s.capturedAt);
    return capDate >= previousStartDate && capDate < previousEndDate;
  });

  const last24hCutoff = new Date(endDate.getTime() - 24 * 3600 * 1000);
  const has24hData = snapshots.some((s) => new Date(s.capturedAt) >= last24hCutoff);

  // Visualizaciones e interacciones totales de la biblioteca filtrada
  const totalViewsAll = filteredVideos.reduce((acc, v) => acc + v.viewsCount, 0);
  const totalInteractionsAll = filteredVideos.reduce(
    (acc, v) => acc + calculateInteractions(v),
    0
  );
  const totalVideosAll = filteredVideos.length;
  const avgViewsAll = totalVideosAll > 0 ? Math.round(totalViewsAll / totalVideosAll) : 0;

  // Para comparación de períodos equivalentes:
  const currentPeriodViews =
    currentPeriodVideos.reduce((acc, v) => acc + v.viewsCount, 0) ||
    currentSnapshots.reduce((acc, s) => acc + s.viewsDelta, 0) ||
    totalViewsAll;

  const previousPeriodViews =
    previousPeriodVideos.reduce((acc, v) => acc + v.viewsCount, 0) ||
    previousSnapshots.reduce((acc, s) => acc + s.viewsDelta, 0);

  const currentPeriodInteractions =
    currentPeriodVideos.reduce((acc, v) => acc + calculateInteractions(v), 0) ||
    currentSnapshots.reduce(
      (acc, s) => acc + s.likesDelta + s.commentsDelta + (s.sharesDelta ?? 0),
      0
    ) ||
    totalInteractionsAll;

  const previousPeriodInteractions =
    previousPeriodVideos.reduce((acc, v) => acc + calculateInteractions(v), 0) ||
    previousSnapshots.reduce(
      (acc, s) => acc + s.likesDelta + s.commentsDelta + (s.sharesDelta ?? 0),
      0
    );

  const currentVideosCount =
    currentPeriodVideos.length > 0 ? currentPeriodVideos.length : totalVideosAll;
  const previousVideosCount = previousPeriodVideos.length;

  const currentAvgViews =
    currentVideosCount > 0 ? Math.round(currentPeriodViews / currentVideosCount) : avgViewsAll;
  const previousAvgViews =
    previousVideosCount > 0 ? Math.round(previousPeriodViews / previousVideosCount) : 0;

  const totalFollowers = filteredAccounts.reduce((acc, a) => acc + a.followersCount, 0);

  // Resumen por plataforma (siempre incluye las 4 plataformas para comparativa multiplataforma)
  const grandTotalViewsAcrossPlatforms = videos.reduce((acc, v) => acc + v.viewsCount, 0);

  const platformSummaries: PlatformSummaryStats[] = PLATFORMS.map((platform) => {
    const platAccounts = accounts.filter((a) => a.platform === platform);
    const platVideos = videos.filter((v) => v.platform === platform);
    const platViews = platVideos.reduce((acc, v) => acc + v.viewsCount, 0);
    const platLikes = platVideos.reduce((acc, v) => acc + v.likesCount, 0);
    const platComments = platVideos.reduce((acc, v) => acc + v.commentsCount, 0);

    const videosWithShares = platVideos.filter((v) => v.sharesCount !== null);
    const platShares =
      videosWithShares.length > 0
        ? videosWithShares.reduce((acc, v) => acc + (v.sharesCount ?? 0), 0)
        : null;

    const platInteractions = platLikes + platComments + (platShares ?? 0);
    const avgViews = platVideos.length > 0 ? Math.round(platViews / platVideos.length) : 0;
    const viewsSharePercentage =
      grandTotalViewsAcrossPlatforms > 0
        ? Number(((platViews / grandTotalViewsAcrossPlatforms) * 100).toFixed(1))
        : 0;

    const platCurrentViews = platVideos
      .filter((v) => {
        const d = new Date(v.publishedAt);
        return d >= startDate && d <= endDate;
      })
      .reduce((acc, v) => acc + v.viewsCount, 0);

    const platPrevViews = platVideos
      .filter((v) => {
        const d = new Date(v.publishedAt);
        return d >= previousStartDate && d < previousEndDate;
      })
      .reduce((acc, v) => acc + v.viewsCount, 0);

    const periodGrowth = computePeriodComparison(platCurrentViews, platPrevViews).percentageChange;

    const primaryAccount = platAccounts[0];

    return {
      platform,
      connectedAccounts: platAccounts.filter((a) => a.connectionStatus === 'connected').length,
      connectionStatus: primaryAccount ? primaryAccount.connectionStatus : 'disconnected',
      followersCount: platAccounts.reduce((acc, a) => acc + a.followersCount, 0),
      totalVideos: platVideos.length,
      totalViews: platViews,
      totalLikes: platLikes,
      totalComments: platComments,
      totalShares: platShares,
      totalInteractions: platInteractions,
      averageViewsPerVideo: avgViews,
      viewsSharePercentage,
      periodGrowthPercentage: periodGrowth,
      methodologyNote: getPlatformMethodologyNote(platform),
    };
  });

  const activePlatformSummaries = platformSummaries.filter((p) => p.totalViews > 0);
  const topPlatform =
    activePlatformSummaries.sort((a, b) => b.totalViews - a.totalViews)[0] ?? null;

  const sortedByViews = [...filteredVideos].sort((a, b) => b.viewsCount - a.viewsCount);
  const mostPopularVideo = sortedByViews[0] ?? null;

  // Videos con crecimiento más rápido (basado en deltas de snapshots en el período o velocidad diaria)
  const snapshotsByVideo = new Map<string, VideoMetricSnapshot[]>();
  for (const snap of currentSnapshots) {
    const list = snapshotsByVideo.get(snap.videoId) ?? [];
    list.push(snap);
    snapshotsByVideo.set(snap.videoId, list);
  }

  const fastestGrowingVideos = filteredVideos
    .map((video) => {
      const vidSnaps = snapshotsByVideo.get(video.id) ?? [];
      let viewsGrowthInPeriod = 0;
      let growthRatePercentage: number | null = null;

      if (vidSnaps.length >= 2) {
        const sortedSnaps = [...vidSnaps].sort(
          (a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime()
        );
        const firstSnap = sortedSnaps[0]!;
        const lastSnap = sortedSnaps[sortedSnaps.length - 1]!;
        viewsGrowthInPeriod = Math.max(0, lastSnap.viewsCount - firstSnap.viewsCount);
        if (firstSnap.viewsCount > 0) {
          growthRatePercentage = Number(
            ((viewsGrowthInPeriod / firstSnap.viewsCount) * 100).toFixed(1)
          );
        }
      } else if (vidSnaps.length === 1) {
        viewsGrowthInPeriod = Math.max(0, vidSnaps[0]!.viewsDelta);
      } else {
        // Si el video fue publicado dentro del período seleccionado, su crecimiento en el período es su total de vistas
        const pubDate = new Date(video.publishedAt);
        if (pubDate >= startDate && pubDate <= endDate) {
          viewsGrowthInPeriod = video.viewsCount;
        }
      }

      return {
        video,
        viewsGrowthInPeriod,
        growthRatePercentage,
      };
    })
    .sort((a, b) => b.viewsGrowthInPeriod - a.viewsGrowthInPeriod || b.video.viewsCount - a.video.viewsCount)
    .slice(0, 6);

  // Serie temporal agrupada por fecha (de snapshots históricos y fechas de publicación)
  const seriesByDate = new Map<string, TimeSeriesPoint>();

  for (const snap of currentSnapshots) {
    const dateKey = snap.snapshotDate;
    const existing = seriesByDate.get(dateKey) ?? {
      date: dateKey,
      youtube: 0,
      tiktok: 0,
      instagram: 0,
      facebook: 0,
      total: 0,
    };
    const metricVal = snap.viewsDelta > 0 ? snap.viewsDelta : snap.viewsCount;
    existing[snap.platform] += metricVal;
    existing.total += metricVal;
    seriesByDate.set(dateKey, existing);
  }

  // Si aún no hay snapshots multi-día pero sí videos publicados, agrupar por fecha de publicación
  if (seriesByDate.size === 0) {
    for (const video of filteredVideos) {
      const dateKey = video.publishedAt.slice(0, 10);
      const existing = seriesByDate.get(dateKey) ?? {
        date: dateKey,
        youtube: 0,
        tiktok: 0,
        instagram: 0,
        facebook: 0,
        total: 0,
      };
      existing[video.platform] += video.viewsCount;
      existing.total += video.viewsCount;
      seriesByDate.set(dateKey, existing);
    }
  }

  const timeSeries = [...seriesByDate.values()].sort((a, b) => a.date.localeCompare(b.date));

  return {
    filter: {
      preset,
      startDate: startDate.toISOString().slice(0, 10),
      endDate: endDate.toISOString().slice(0, 10),
      platform: platformFilter,
    },
    totals: {
      views: computePeriodComparison(totalViewsAll, previousPeriodViews),
      videos: computePeriodComparison(totalVideosAll, previousVideosCount),
      followers: totalFollowers,
      interactions: computePeriodComparison(
        currentPeriodInteractions,
        previousPeriodInteractions
      ),
      averageViewsPerVideo: computePeriodComparison(currentAvgViews, previousAvgViews),
    },
    topPlatform,
    mostPopularVideo,
    fastestGrowingVideos,
    platformSummaries,
    timeSeries,
    accounts,
    recentSyncJobs,
    has24hData,
  };
}

export async function getDashboardOverviewData(
  userId: string,
  rawFilter?: Record<string, unknown>
): Promise<DashboardOverviewData> {
  const parsedFilter = dashboardFilterSchema.safeParse(rawFilter ?? {});
  const filterParams = parsedFilter.success
    ? parsedFilter.data
    : { preset: '30d' as const, platform: 'all' as const, from: undefined, to: undefined };

  const dateRange = resolveDateRangeFilter(
    filterParams.preset,
    filterParams.from,
    filterParams.to
  );

  if (!isSupabaseConfigured()) {
    return buildAnalyticsOverviewFromRecords({
      accounts: [],
      videos: [],
      snapshots: [],
      recentSyncJobs: [],
      preset: dateRange.preset,
      platformFilter: filterParams.platform,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      previousStartDate: dateRange.previousStartDate,
      previousEndDate: dateRange.previousEndDate,
    });
  }

  const supabase = await createClient();

  // Consultas paralelas con índices para evitar problemas N+1
  const [accountsRes, videosRes, snapshotsRes, jobsRes] = await Promise.all([
    supabase
      .from('social_accounts')
      .select('*')
      .eq('user_id', userId)
      .order('platform', { ascending: true }),
    supabase
      .from('videos')
      .select('*')
      .eq('user_id', userId)
      .order('published_at', { ascending: false })
      .limit(500),
    supabase
      .from('video_metrics')
      .select('*')
      .eq('user_id', userId)
      .gte('captured_at', dateRange.previousStartDate.toISOString())
      .order('captured_at', { ascending: true })
      .limit(2000),
    supabase
      .from('sync_jobs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  const accounts = ((accountsRes.data ?? []) as SocialAccountRow[]).map(mapSocialAccountRow);
  const videos = ((videosRes.data ?? []) as VideoRow[]).map(mapVideoRow);
  const snapshots = ((snapshotsRes.data ?? []) as VideoMetricRow[]).map(mapVideoMetricRow);
  const recentSyncJobs = ((jobsRes.data ?? []) as SyncJobRow[]).map(mapSyncJobRow);

  return buildAnalyticsOverviewFromRecords({
    accounts,
    videos,
    snapshots,
    recentSyncJobs,
    preset: dateRange.preset,
    platformFilter: filterParams.platform,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    previousStartDate: dateRange.previousStartDate,
    previousEndDate: dateRange.previousEndDate,
  });
}
