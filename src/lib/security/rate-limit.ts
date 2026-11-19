import { AppError } from '@/lib/utils/errors';

interface RateLimitBucket {
  timestamps: number[];
}

const buckets = new Map<string, RateLimitBucket>();

export interface RateLimitConfig {
  key: string;
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAtMs: number;
}

export function checkRateLimit(config: RateLimitConfig, nowMs: number = Date.now()): RateLimitResult {
  const windowStart = nowMs - config.windowMs;
  const existing = buckets.get(config.key) ?? { timestamps: [] };
  const activeTimestamps = existing.timestamps.filter((ts) => ts > windowStart);

  if (activeTimestamps.length >= config.limit) {
    const oldestInWindow = activeTimestamps[0] ?? nowMs;
    const resetAtMs = oldestInWindow + config.windowMs;
    buckets.set(config.key, { timestamps: activeTimestamps });
    return {
      allowed: false,
      remaining: 0,
      resetAtMs,
    };
  }

  activeTimestamps.push(nowMs);
  buckets.set(config.key, { timestamps: activeTimestamps });

  // Prevent unbounded memory growth in long-lived instances
  if (buckets.size > 5000) {
    for (const [k, v] of buckets.entries()) {
      if (v.timestamps.every((ts) => ts <= windowStart)) {
        buckets.delete(k);
      }
    }
  }

  return {
    allowed: true,
    remaining: Math.max(0, config.limit - activeTimestamps.length),
    resetAtMs: nowMs + config.windowMs,
  };
}

export function assertRateLimit(config: RateLimitConfig, nowMs: number = Date.now()): RateLimitResult {
  const result = checkRateLimit(config, nowMs);
  if (!result.allowed) {
    const retryAfterSeconds = Math.max(1, Math.ceil((result.resetAtMs - nowMs) / 1000));
    throw new AppError({
      code: 'RATE_LIMITED',
      message: `Demasiadas solicitudes. Por favor espera ${retryAfterSeconds} segundos antes de reintentar.`,
      details: { retryAfterSeconds },
    });
  }
  return result;
}

export function clearRateLimitBucketsForTesting(): void {
  buckets.clear();
}
