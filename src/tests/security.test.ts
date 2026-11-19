import { describe, expect, it, beforeEach } from 'vitest';
import { decryptOAuthToken, encryptOAuthToken } from '@/lib/security/crypto';
import {
  createSignedOAuthState,
  generatePkcePair,
  verifySignedOAuthState,
} from '@/lib/security/oauth-state';
import { verifyCronSecretHeader, verifyCsrfOrigin } from '@/lib/security/csrf';
import {
  assertRateLimit,
  checkRateLimit,
  clearRateLimitBucketsForTesting,
} from '@/lib/security/rate-limit';
import { sanitizeLogPayload } from '@/lib/utils/logger';

const TEST_HEX_KEY =
  'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';

describe('Security: AES-256-GCM OAuth Credential Encryption', () => {
  it('encrypts and decrypts OAuth tokens accurately with unique IVs per call', () => {
    const rawAccessToken = 'ya29.a0AfB_byC-real-oauth-token-payload-123456789';
    const encryptedA = encryptOAuthToken(rawAccessToken, TEST_HEX_KEY);
    const encryptedB = encryptOAuthToken(rawAccessToken, TEST_HEX_KEY);

    expect(encryptedA).not.toEqual(rawAccessToken);
    expect(encryptedA).not.toEqual(encryptedB); // Non-deterministic IV
    expect(encryptedA.startsWith('v1:')).toBe(true);

    const decrypted = decryptOAuthToken(encryptedA, TEST_HEX_KEY);
    expect(decrypted).toBe(rawAccessToken);
  });

  it('rejects tampered ciphertexts or auth tags (authenticated encryption integrity)', () => {
    const encrypted = encryptOAuthToken('secret-refresh-token', TEST_HEX_KEY);
    const parts = encrypted.split(':');
    const tampered = `${parts[0]}:${parts[1]}:${parts[2]}:AAAA${parts[3]?.slice(4)}`;

    expect(() => decryptOAuthToken(tampered, TEST_HEX_KEY)).toThrow(
      /Fallo de integridad o autenticación/
    );
  });

  it('rejects decryption with a wrong key', () => {
    const encrypted = encryptOAuthToken('secret-token', TEST_HEX_KEY);
    const wrongKey =
      'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

    expect(() => decryptOAuthToken(encrypted, wrongKey)).toThrow();
  });
});

describe('Security: OAuth State HMAC-SHA256 & PKCE Protection', () => {
  it('creates and verifies valid signed OAuth state bound to userId, platform and nonce', () => {
    const userId = '550e8400-e29b-41d4-a716-446655440000';
    const { state, nonce } = createSignedOAuthState(
      { userId, platform: 'youtube' },
      TEST_HEX_KEY
    );

    const verified = verifySignedOAuthState(
      state,
      { userId, platform: 'youtube', expectedNonce: nonce },
      TEST_HEX_KEY
    );

    expect(verified.userId).toBe(userId);
    expect(verified.platform).toBe('youtube');
    expect(verified.nonce).toBe(nonce);
  });

  it('prevents cross-user or cross-platform state replay (CSRF / BOLA)', () => {
    const userA = '550e8400-e29b-41d4-a716-446655440000';
    const userB = '660e8400-e29b-41d4-a716-446655440999';
    const { state, nonce } = createSignedOAuthState(
      { userId: userA, platform: 'tiktok' },
      TEST_HEX_KEY
    );

    expect(() =>
      verifySignedOAuthState(
        state,
        { userId: userB, platform: 'tiktok', expectedNonce: nonce },
        TEST_HEX_KEY
      )
    ).toThrow(/no corresponde al usuario/);

    expect(() =>
      verifySignedOAuthState(
        state,
        { userId: userA, platform: 'instagram', expectedNonce: nonce },
        TEST_HEX_KEY
      )
    ).toThrow(/no corresponde al usuario/);
  });

  it('generates valid S256 PKCE codeVerifier and codeChallenge pairs', () => {
    const { codeVerifier, codeChallenge } = generatePkcePair();
    expect(codeVerifier.length).toBeGreaterThanOrEqual(43);
    expect(codeChallenge.length).toBeGreaterThanOrEqual(43);
    expect(codeVerifier).not.toEqual(codeChallenge);
  });
});

describe('Security: CSRF Origin & Server-to-Server Cron Auth', () => {
  it('allows requests when Origin matches Host', () => {
    const req = new Request('https://analytics.midominio.com/api/sync/manual', {
      method: 'POST',
      headers: {
        origin: 'https://analytics.midominio.com',
        host: 'analytics.midominio.com',
      },
    });
    expect(() => verifyCsrfOrigin(req)).not.toThrow();
  });

  it('blocks requests when Origin does not match Host', () => {
    const req = new Request('https://analytics.midominio.com/api/sync/manual', {
      method: 'POST',
      headers: {
        origin: 'https://evil-attacker.com',
        host: 'analytics.midominio.com',
      },
    });
    expect(() => verifyCsrfOrigin(req)).toThrow(/bloqueada por política CSRF/);
  });

  it('verifies timing-safe Bearer CRON_SECRET for scheduled jobs', () => {
    const cronSecret = 'super_secure_cron_secret_32_bytes_long_12345';
    expect(() =>
      verifyCronSecretHeader(`Bearer ${cronSecret}`, cronSecret)
    ).not.toThrow();

    expect(() =>
      verifyCronSecretHeader('Bearer wrong_token_value', cronSecret)
    ).toThrow(/inválida/);
  });
});

describe('Security: Sliding-Window Rate Limiter & Log Sanitization', () => {
  beforeEach(() => {
    clearRateLimitBucketsForTesting();
  });

  it('enforces rate limits after reaching configured threshold', () => {
    const key = 'test:ip:127.0.0.1';
    expect(checkRateLimit({ key, limit: 2, windowMs: 60000 }, 1000).allowed).toBe(true);
    expect(checkRateLimit({ key, limit: 2, windowMs: 60000 }, 2000).allowed).toBe(true);
    expect(checkRateLimit({ key, limit: 2, windowMs: 60000 }, 3000).allowed).toBe(false);

    expect(() =>
      assertRateLimit({ key, limit: 2, windowMs: 60000 }, 3500)
    ).toThrow(/Demasiadas solicitudes/);
  });

  it('redacts OAuth tokens, passwords, and Bearer headers from log payloads', () => {
    const dirty = {
      userId: 'user-1',
      access_token: 'ya29.secret_token',
      nested: {
        refreshToken: '1//0g_secret_refresh',
        authorization: 'Bearer secret_jwt_value',
      },
      message: 'Failed call with Bearer my_secret_token_123',
    };

    const clean = sanitizeLogPayload(dirty) as Record<string, unknown>;
    expect(clean.access_token).toBe('[REDACTED]');
    expect((clean.nested as Record<string, unknown>).refreshToken).toBe('[REDACTED]');
    expect((clean.nested as Record<string, unknown>).authorization).toBe('[REDACTED]');
    expect(clean.message).toBe('Failed call with Bearer [REDACTED]');
  });
});
