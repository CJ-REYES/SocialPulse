const SENSITIVE_KEYS = [
  'access_token',
  'refresh_token',
  'accessToken',
  'refreshToken',
  'access_token_encrypted',
  'refresh_token_encrypted',
  'client_secret',
  'clientSecret',
  'password',
  'secret',
  'authorization',
  'cookie',
  'token',
  'code_verifier',
];

export function sanitizeLogPayload(input: unknown): unknown {
  if (input === null || input === undefined) {
    return input;
  }

  if (typeof input === 'string') {
    // Redact Bearer tokens or long hex/base64 secrets in strings
    return input
      .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]')
      .replace(/(access_token|refresh_token|client_secret)=([^&\s]+)/gi, '$1=[REDACTED]');
  }

  if (Array.isArray(input)) {
    return input.map((item) => sanitizeLogPayload(item));
  }

  if (typeof input === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      if (SENSITIVE_KEYS.some((sensitive) => lowerKey.includes(sensitive.toLowerCase()))) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = sanitizeLogPayload(value);
      }
    }
    return sanitized;
  }

  return input;
}

export const logger = {
  info(event: string, meta?: Record<string, unknown>): void {
    const payload = {
      level: 'info',
      timestamp: new Date().toISOString(),
      event,
      ...(meta ? { meta: sanitizeLogPayload(meta) } : {}),
    };
    console.info(JSON.stringify(payload));
  },
  warn(event: string, meta?: Record<string, unknown>): void {
    const payload = {
      level: 'warn',
      timestamp: new Date().toISOString(),
      event,
      ...(meta ? { meta: sanitizeLogPayload(meta) } : {}),
    };
    console.warn(JSON.stringify(payload));
  },
  error(event: string, meta?: Record<string, unknown>): void {
    const payload = {
      level: 'error',
      timestamp: new Date().toISOString(),
      event,
      ...(meta ? { meta: sanitizeLogPayload(meta) } : {}),
    };
    console.error(JSON.stringify(payload));
  },
};
