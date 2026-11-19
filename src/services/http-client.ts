import { AppError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import type { Platform } from '@/types/domain';

export interface RetryFetchOptions extends RequestInit {
  platform: Platform;
  operationName: string;
  maxRetries?: number;
  baseDelayMs?: number;
  timeoutMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchJsonWithRetry<T>(
  url: string,
  options: RetryFetchOptions
): Promise<T> {
  const {
    platform,
    operationName,
    maxRetries = 3,
    baseDelayMs = 400,
    timeoutMs = 15000,
    ...fetchInit
  } = options;

  let attempt = 0;

  while (true) {
    attempt += 1;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...fetchInit,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const text = await response.text();
        if (!text) {
          return {} as T;
        }
        return JSON.parse(text) as T;
      }

      const errorText = await response.text().catch(() => '');

      // Detectar expiración o revocación de token OAuth (401)
      if (response.status === 401) {
        throw new AppError({
          code: 'OAUTH_TOKEN_EXPIRED',
          message: `[${platform.toUpperCase()}] El token de acceso OAuth ha expirado o fue revocado (${operationName}).`,
          details: { platform, operationName, status: 401 },
        });
      }

      // Detectar error de permisos o cuota/rate limit en 403/429
      if (response.status === 403) {
        const lowerErr = errorText.toLowerCase();
        if (lowerErr.includes('quotaexceeded') || lowerErr.includes('ratelimitexceeded')) {
          throw new AppError({
            code: 'EXTERNAL_RATE_LIMIT',
            message: `[${platform.toUpperCase()}] Cuota de la API oficial alcanzada durante ${operationName}.`,
            details: { platform, operationName, status: 403 },
          });
        }

        throw new AppError({
          code: 'OAUTH_PERMISSION_DENIED',
          message: `[${platform.toUpperCase()}] Permiso denegado por la API oficial en ${operationName}. Verifica los scopes aprobados.`,
          details: { platform, operationName, status: 403 },
        });
      }

      const isRetryableStatus = response.status === 429 || response.status >= 500;
      if (isRetryableStatus && attempt <= maxRetries) {
        const retryAfterHeader = response.headers.get('retry-after');
        const retryAfterMs = retryAfterHeader
          ? Number.parseInt(retryAfterHeader, 10) * 1000
          : null;
        const backoffMs =
          retryAfterMs && !Number.isNaN(retryAfterMs)
            ? Math.min(retryAfterMs, 10000)
            : baseDelayMs * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 150);

        logger.warn('external_api_retry', {
          platform,
          operationName,
          attempt,
          status: response.status,
          backoffMs,
        });

        await sleep(backoffMs);
        continue;
      }

      if (response.status === 429) {
        throw new AppError({
          code: 'EXTERNAL_RATE_LIMIT',
          message: `[${platform.toUpperCase()}] Límite de velocidad (HTTP 429) excedido tras ${attempt} intentos en ${operationName}.`,
          details: { platform, operationName, status: 429 },
        });
      }

      throw new AppError({
        code: 'EXTERNAL_API_ERROR',
        message: `[${platform.toUpperCase()}] Error HTTP ${response.status} en ${operationName}.`,
        details: {
          platform,
          operationName,
          status: response.status,
        },
      });
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof AppError) {
        throw error;
      }

      if (attempt <= maxRetries) {
        const backoffMs = baseDelayMs * Math.pow(2, attempt - 1);
        logger.warn('external_api_network_retry', {
          platform,
          operationName,
          attempt,
          backoffMs,
          errorMessage: error instanceof Error ? error.message : 'Network error',
        });
        await sleep(backoffMs);
        continue;
      }

      throw new AppError({
        code: 'EXTERNAL_API_ERROR',
        message: `[${platform.toUpperCase()}] Fallo de red o timeout al conectar con la API oficial (${operationName}).`,
        cause: error,
      });
    }
  }
}
