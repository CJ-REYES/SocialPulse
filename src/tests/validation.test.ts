import { describe, expect, it } from 'vitest';
import {
  dashboardFilterSchema,
  loginFormSchema,
  manualSyncRequestSchema,
  resetPasswordSchema,
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
});
