import { describe, expect, it } from 'vitest';
import {
  buildAnalyticsOverviewFromRecords,
  computePeriodComparison,
} from '@/features/analytics/analytics.service';
import {
  parseIso8601DurationToSeconds,
  resolveDateRangeFilter,
} from '@/lib/utils/format';
import type { SocialAccount, VideoMetricSnapshot, VideoRecord } from '@/types/domain';

describe('Analytics & Synchronization Calculations', () => {
  it('computes accurate period-over-period comparisons', () => {
    const growth = computePeriodComparison(1500, 1000);
    expect(growth.absoluteDelta).toBe(500);
    expect(growth.percentageChange).toBe(50);

    const drop = computePeriodComparison(750, 1000);
    expect(drop.absoluteDelta).toBe(-250);
    expect(drop.percentageChange).toBe(-25);

    const zeroBase = computePeriodComparison(0, 0);
    expect(zeroBase.percentageChange).toBeNull();
  });

  it('resolves equivalent previous periods for date range presets', () => {
    const refNow = new Date('2026-11-18T12:00:00.000Z');
    const range7d = resolveDateRangeFilter('7d', undefined, undefined, refNow);

    const currentDurationMs = range7d.endDate.getTime() - range7d.startDate.getTime();
    const prevDurationMs =
      range7d.previousEndDate.getTime() - range7d.previousStartDate.getTime();

    expect(currentDurationMs).toBe(7 * 24 * 3600 * 1000);
    expect(prevDurationMs).toBe(currentDurationMs);
    expect(range7d.previousEndDate.getTime()).toBe(range7d.startDate.getTime());
  });

  it('parses ISO-8601 YouTube durations into seconds', () => {
    expect(parseIso8601DurationToSeconds('PT1H2M15S')).toBe(3735);
    expect(parseIso8601DurationToSeconds('PT45S')).toBe(45);
    expect(parseIso8601DurationToSeconds(null)).toBeNull();
  });

  it('aggregates multi-platform metrics, identifies top platform and fastest growing videos', () => {
    const accounts: SocialAccount[] = [
      {
        id: 'acc-yt',
        userId: 'user-1',
        platform: 'youtube',
        externalAccountId: 'UC1',
        accountName: 'YouTube Channel',
        accountHandle: '@yt',
        accountAvatarUrl: null,
        followersCount: 10000,
        followingCount: null,
        postsCount: 2,
        connectionStatus: 'connected',
        lastErrorCode: null,
        lastErrorMessage: null,
        lastSyncedAt: '2026-11-18T08:00:00Z',
        nextAllowedSyncAt: null,
        metadata: {},
        createdAt: '2026-11-01T00:00:00Z',
        updatedAt: '2026-11-18T08:00:00Z',
      },
      {
        id: 'acc-tt',
        userId: 'user-1',
        platform: 'tiktok',
        externalAccountId: 'TT1',
        accountName: 'TikTok Profile',
        accountHandle: '@tt',
        accountAvatarUrl: null,
        followersCount: 25000,
        followingCount: 120,
        postsCount: 1,
        connectionStatus: 'connected',
        lastErrorCode: null,
        lastErrorMessage: null,
        lastSyncedAt: '2026-11-18T08:00:00Z',
        nextAllowedSyncAt: null,
        metadata: {},
        createdAt: '2026-11-01T00:00:00Z',
        updatedAt: '2026-11-18T08:00:00Z',
      },
    ];

    const videos: VideoRecord[] = [
      {
        id: 'vid-1',
        socialAccountId: 'acc-yt',
        userId: 'user-1',
        platform: 'youtube',
        externalVideoId: 'YT_V1',
        title: 'Curso Completo Supabase RLS',
        description: null,
        thumbnailUrl: null,
        permalink: 'https://youtube.com/watch?v=YT_V1',
        durationSeconds: 600,
        publishedAt: '2026-11-10T10:00:00Z',
        contentType: 'video',
        syncStatus: 'synced',
        viewsCount: 40000,
        likesCount: 3200,
        commentsCount: 400,
        sharesCount: 150,
        reachCount: null,
        impressionsCount: null,
        watchTimeMinutes: 180000,
        avgViewDurationSeconds: 270,
        unavailableMetrics: ['reach', 'impressions'],
        rawMetadata: {},
        lastSyncedAt: '2026-11-18T08:00:00Z',
        createdAt: '2026-11-10T10:00:00Z',
        updatedAt: '2026-11-18T08:00:00Z',
      },
      {
        id: 'vid-2',
        socialAccountId: 'acc-tt',
        userId: 'user-1',
        platform: 'tiktok',
        externalVideoId: 'TT_V1',
        title: 'Tip de Seguridad OAuth en 60s',
        description: null,
        thumbnailUrl: null,
        permalink: 'https://tiktok.com/@tt/video/TT_V1',
        durationSeconds: 58,
        publishedAt: '2026-11-12T15:00:00Z',
        contentType: 'short',
        syncStatus: 'partial',
        viewsCount: 60000,
        likesCount: 8500,
        commentsCount: 620,
        sharesCount: 910,
        reachCount: null,
        impressionsCount: null,
        watchTimeMinutes: null,
        avgViewDurationSeconds: null,
        unavailableMetrics: ['reach', 'impressions'],
        rawMetadata: {},
        lastSyncedAt: '2026-11-18T08:00:00Z',
        createdAt: '2026-11-12T15:00:00Z',
        updatedAt: '2026-11-18T08:00:00Z',
      },
    ];

    const snapshots: VideoMetricSnapshot[] = [
      {
        id: 'snap-1',
        videoId: 'vid-2',
        socialAccountId: 'acc-tt',
        userId: 'user-1',
        platform: 'tiktok',
        snapshotDate: '2026-11-15',
        snapshotHour: '2026-11-15T08:00:00Z',
        capturedAt: '2026-11-15T08:00:00Z',
        viewsCount: 20000,
        likesCount: 2000,
        commentsCount: 150,
        sharesCount: 200,
        reachCount: null,
        impressionsCount: null,
        followersCountSnapshot: 24000,
        watchTimeMinutes: null,
        avgViewDurationSeconds: null,
        viewsDelta: 20000,
        likesDelta: 2000,
        commentsDelta: 150,
        sharesDelta: 200,
        createdAt: '2026-11-15T08:00:00Z',
      },
      {
        id: 'snap-2',
        videoId: 'vid-2',
        socialAccountId: 'acc-tt',
        userId: 'user-1',
        platform: 'tiktok',
        snapshotDate: '2026-11-18',
        snapshotHour: '2026-11-18T08:00:00Z',
        capturedAt: '2026-11-18T08:00:00Z',
        viewsCount: 60000,
        likesCount: 8500,
        commentsCount: 620,
        sharesCount: 910,
        reachCount: null,
        impressionsCount: null,
        followersCountSnapshot: 25000,
        watchTimeMinutes: null,
        avgViewDurationSeconds: null,
        viewsDelta: 40000,
        likesDelta: 6500,
        commentsDelta: 470,
        sharesDelta: 710,
        createdAt: '2026-11-18T08:00:00Z',
      },
    ];

    const overview = buildAnalyticsOverviewFromRecords({
      accounts,
      videos,
      snapshots,
      recentSyncJobs: [],
      preset: '30d',
      platformFilter: 'all',
      startDate: new Date('2026-10-19T00:00:00Z'),
      endDate: new Date('2026-11-18T23:59:59Z'),
      previousStartDate: new Date('2026-09-19T00:00:00Z'),
      previousEndDate: new Date('2026-10-19T00:00:00Z'),
    });

    expect(overview.totals.views.current).toBe(100000);
    expect(overview.totals.followers).toBe(35000);
    expect(overview.topPlatform?.platform).toBe('tiktok');
    expect(overview.topPlatform?.viewsSharePercentage).toBe(60);
    expect(overview.mostPopularVideo?.id).toBe('vid-2');
    expect(overview.fastestGrowingVideos[0]?.video.id).toBe('vid-2');
    expect(overview.fastestGrowingVideos[0]?.viewsGrowthInPeriod).toBe(40000);
  });
});
