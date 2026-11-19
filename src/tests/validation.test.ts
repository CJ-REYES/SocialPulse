import { describe, expect, it } from 'vitest';
import {
  createPublishJobSchema,
  dashboardFilterSchema,
  loginFormSchema,
  manualSyncRequestSchema,
  resetPasswordSchema,
  uploadUrlRequestSchema,
  videoLibraryQuerySchema,
} from '@/lib/validation/schemas';

describe('Validation: Zod Schemas', () => {
  it('validates loginFormSchema and rejects malformed emails or short passwords', () => {
    expect(
      loginFormSchema.safeParse({
        email: 'owner@socialpulse.io',
        password: 'ValidPassword123!',
      }).success
    ).toBe(true);

    expect(
      loginFormSchema.safeParse({
        email: 'not-an-email',
        password: 'ValidPassword123!',
      }).success
    ).toBe(false);

    expect(
      loginFormSchema.safeParse({
        email: 'owner@socialpulse.io',
        password: '123',
      }).success
    ).toBe(false);
  });

  it('enforces strong password rules and matching confirmation in resetPasswordSchema', () => {
    expect(
      resetPasswordSchema.safeParse({
        password: 'StrongPassword2026',
        confirmPassword: 'StrongPassword2026',
      }).success
    ).toBe(true);

    // Mismatched confirmation
    expect(
      resetPasswordSchema.safeParse({
        password: 'StrongPassword2026',
        confirmPassword: 'DifferentPassword2026',
      }).success
    ).toBe(false);

    // Missing uppercase or number
    expect(
      resetPasswordSchema.safeParse({
        password: 'weakpasswordonly',
        confirmPassword: 'weakpasswordonly',
      }).success
    ).toBe(false);
  });

  it('validates dashboardFilterSchema date range ordering', () => {
    expect(
      dashboardFilterSchema.safeParse({
        preset: 'custom',
        platform: 'youtube',
        from: '2026-10-01',
        to: '2026-10-31',
      }).success
    ).toBe(true);

    // Inverted date range must fail
    expect(
      dashboardFilterSchema.safeParse({
        preset: 'custom',
        platform: 'youtube',
        from: '2026-11-15',
        to: '2026-10-01',
      }).success
    ).toBe(false);
  });

  it('coerces and bounds pagination in videoLibraryQuerySchema', () => {
    const parsed = videoLibraryQuerySchema.safeParse({
      platform: 'tiktok',
      sortBy: 'views_count',
      sortOrder: 'desc',
      page: '2',
      pageSize: '25',
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.page).toBe(2);
      expect(parsed.data.pageSize).toBe(25);
    }

    // Excessive pageSize > 100 rejected
    expect(
      videoLibraryQuerySchema.safeParse({
        pageSize: '500',
      }).success
    ).toBe(false);
  });

  it('requires valid UUID for socialAccountId in manualSyncRequestSchema', () => {
    expect(
      manualSyncRequestSchema.safeParse({
        socialAccountId: '550e8400-e29b-41d4-a716-446655440000',
      }).success
    ).toBe(true);

    expect(
      manualSyncRequestSchema.safeParse({
        socialAccountId: 'invalid-uuid-string',
      }).success
    ).toBe(false);
  });

  it('validates video upload size limit (50 MB) and MIME types', () => {
    expect(
      uploadUrlRequestSchema.safeParse({
        fileName: 'clip.mp4',
        fileSizeBytes: 12 * 1024 * 1024,
        mimeType: 'video/mp4',
      }).success
    ).toBe(true);

    // Rejects > 50 MB
    expect(
      uploadUrlRequestSchema.safeParse({
        fileName: 'huge.mp4',
        fileSizeBytes: 60 * 1024 * 1024,
        mimeType: 'video/mp4',
      }).success
    ).toBe(false);

    // Rejects executable or image MIME type for video
    expect(
      uploadUrlRequestSchema.safeParse({
        assetKind: 'video',
        fileName: 'script.sh',
        fileSizeBytes: 1024,
        mimeType: 'text/plain',
      }).success
    ).toBe(false);

    // Accepts JPG/PNG thumbnail <= 2 MB and rejects > 2 MB
    expect(
      uploadUrlRequestSchema.safeParse({
        assetKind: 'thumbnail',
        fileName: 'cover.png',
        fileSizeBytes: 512 * 1024,
        mimeType: 'image/png',
      }).success
    ).toBe(true);

    expect(
      uploadUrlRequestSchema.safeParse({
        assetKind: 'thumbnail',
        fileName: 'huge-cover.png',
        fileSizeBytes: 3 * 1024 * 1024,
        mimeType: 'image/png',
      }).success
    ).toBe(false);
  });

  it('validates createPublishJobSchema with optional ISO scheduledAt', () => {
    expect(
      createPublishJobSchema.safeParse({
        socialAccountIds: ['550e8400-e29b-41d4-a716-446655440000'],
        title: 'Lanzamiento de producto',
        description: 'Demo oficial',
        privacyStatus: 'private',
        storagePath: '550e8400-e29b-41d4-a716-446655440000/video.mp4',
        fileName: 'video.mp4',
        fileSizeBytes: 4096,
        mimeType: 'video/mp4',
        scheduledAt: '2026-12-01T15:00:00.000Z',
      }).success
    ).toBe(true);
  });
});
