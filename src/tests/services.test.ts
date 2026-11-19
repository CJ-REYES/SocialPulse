import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { YouTubeService } from '@/services/youtube/youtube.service';
import { TikTokService } from '@/services/tiktok/tiktok.service';
import { InstagramService } from '@/services/instagram/instagram.service';
import { FacebookService } from '@/services/facebook/facebook.service';
import { fetchJsonWithRetry } from '@/services/http-client';

describe('Platform Services & Resilient HTTP Client', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      YOUTUBE_CLIENT_ID: 'yt-client-id.apps.googleusercontent.com',
      YOUTUBE_CLIENT_SECRET: 'yt-client-secret',
      YOUTUBE_REDIRECT_URI: 'http://localhost:3000/api/oauth/youtube/callback',
      TIKTOK_CLIENT_KEY: 'tt-client-key',
      TIKTOK_CLIENT_SECRET: 'tt-client-secret',
      TIKTOK_REDIRECT_URI: 'http://localhost:3000/api/oauth/tiktok/callback',
      INSTAGRAM_APP_ID: 'ig-app-id',
      INSTAGRAM_APP_SECRET: 'ig-app-secret',
      INSTAGRAM_REDIRECT_URI: 'http://localhost:3000/api/oauth/instagram/callback',
      FACEBOOK_APP_ID: 'fb-app-id',
      FACEBOOK_APP_SECRET: 'fb-app-secret',
      FACEBOOK_REDIRECT_URI: 'http://localhost:3000/api/oauth/facebook/callback',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('builds official OAuth authorization URLs with PKCE and scopes for all 4 platforms', () => {
    const yt = new YouTubeService();
    const tt = new TikTokService();
    const ig = new InstagramService();
    const fb = new FacebookService();

    const ytUrl = new URL(
      yt.buildAuthorizationUrl({ state: 'signed-state-1', codeChallenge: 'pkce-challenge-1' })
    );
    expect(ytUrl.hostname).toBe('accounts.google.com');
    expect(ytUrl.searchParams.get('code_challenge')).toBe('pkce-challenge-1');
    expect(ytUrl.searchParams.get('access_type')).toBe('offline');

    const ttUrl = new URL(
      tt.buildAuthorizationUrl({ state: 'signed-state-2', codeChallenge: 'pkce-challenge-2' })
    );
    expect(ttUrl.hostname).toBe('www.tiktok.com');
    expect(ttUrl.searchParams.get('scope')).toContain('video.list');

    const igUrl = new URL(ig.buildAuthorizationUrl({ state: 'signed-state-3' }));
    expect(igUrl.hostname).toBe('www.facebook.com');
    expect(igUrl.searchParams.get('scope')).toContain('instagram_manage_insights');

    const fbUrl = new URL(fb.buildAuthorizationUrl({ state: 'signed-state-4' }));
    expect(fbUrl.hostname).toBe('www.facebook.com');
    expect(fbUrl.searchParams.get('scope')).toContain('read_insights');
  });

  it('parses YouTube Data API v3 & Analytics API v2 responses and documents unavailable metrics', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    // 1. channels?mine=true
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          items: [
            {
              id: 'UC_CHANNEL_123',
              snippet: { title: 'Canal Oficial Tech', customUrl: '@canaltech' },
              statistics: { subscriberCount: '15400', videoCount: '42', viewCount: '890000' },
              contentDetails: { relatedPlaylists: { uploads: 'UU_UPLOADS_123' } },
            },
          ],
        }),
        { status: 200 }
      )
    );

    // 2. playlistItems
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          items: [{ contentDetails: { videoId: 'VID_001' } }],
        }),
        { status: 200 }
      )
    );

    // 3. YouTube Analytics reports
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          rows: [['VID_001', 12500, 45200.5, 215, 340]],
        }),
        { status: 200 }
      )
    );

    // 4. videos.list
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          items: [
            {
              id: 'VID_001',
              snippet: {
                title: 'Arquitectura SaaS en Producción',
                description: 'Análisis técnico',
                publishedAt: '2026-11-10T12:00:00Z',
                thumbnails: { high: { url: 'https://i.ytimg.com/vi/VID_001/hqdefault.jpg' } },
              },
              contentDetails: { duration: 'PT12M30S' },
              statistics: { viewCount: '12500', likeCount: '980', commentCount: '115' },
            },
          ],
        }),
        { status: 200 }
      )
    );

    const yt = new YouTubeService();
    const result = await yt.fetchAccountAndVideos('valid-access-token');

    expect(result.account.externalAccountId).toBe('UC_CHANNEL_123');
    expect(result.account.followersCount).toBe(15400);
    expect(result.videos).toHaveLength(1);
    expect(result.videos[0]?.viewsCount).toBe(12500);
    expect(result.videos[0]?.sharesCount).toBe(340);
    expect(result.videos[0]?.durationSeconds).toBe(750);
    expect(result.videos[0]?.unavailableMetrics).toContain('reach');
  });

  it('retries automatically with exponential backoff on HTTP 429 and detects 401 token expiry', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    fetchMock
      .mockResolvedValueOnce(new Response('Rate limited', { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const res = await fetchJsonWithRetry<{ ok: boolean }>('https://api.example.com/data', {
      platform: 'tiktok',
      operationName: 'test_retry',
      baseDelayMs: 10,
    });
    expect(res.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }));
    await expect(
      fetchJsonWithRetry('https://api.example.com/expired', {
        platform: 'youtube',
        operationName: 'test_401',
      })
    ).rejects.toMatchObject({ code: 'OAUTH_TOKEN_EXPIRED' });
  });
});
