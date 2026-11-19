export type ErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'VALIDATION_ERROR'
  | 'RATE_LIMITED'
  | 'CSRF_INVALID'
  | 'OAUTH_CONFIG_MISSING'
  | 'OAUTH_STATE_INVALID'
  | 'OAUTH_TOKEN_EXPIRED'
  | 'OAUTH_PERMISSION_DENIED'
  | 'EXTERNAL_API_ERROR'
  | 'EXTERNAL_RATE_LIMIT'
  | 'SYNC_IN_PROGRESS'
  | 'NOT_FOUND'
  | 'DATABASE_ERROR'
  | 'CRYPTO_ERROR'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: Record<string, unknown>;

  constructor(params: {
    code: ErrorCode;
    message: string;
    statusCode?: number;
    isOperational?: boolean;
    details?: Record<string, unknown>;
    cause?: unknown;
  }) {
    super(params.message, { cause: params.cause });
    this.name = 'AppError';
    this.code = params.code;
    this.statusCode = params.statusCode ?? mapErrorCodeToStatus(params.code);
    this.isOperational = params.isOperational ?? true;
    this.details = params.details;
  }
}

function mapErrorCodeToStatus(code: ErrorCode): number {
  switch (code) {
    case 'VALIDATION_ERROR':
    case 'OAUTH_STATE_INVALID':
      return 400;
    case 'UNAUTHORIZED':
    case 'OAUTH_TOKEN_EXPIRED':
      return 401;
    case 'FORBIDDEN':
    case 'CSRF_INVALID':
    case 'OAUTH_PERMISSION_DENIED':
      return 403;
    case 'NOT_FOUND':
      return 404;
    case 'SYNC_IN_PROGRESS':
      return 409;
    case 'RATE_LIMITED':
    case 'EXTERNAL_RATE_LIMIT':
      return 429;
    case 'OAUTH_CONFIG_MISSING':
    case 'EXTERNAL_API_ERROR':
      return 502;
    case 'DATABASE_ERROR':
    case 'CRYPTO_ERROR':
    case 'INTERNAL_ERROR':
      return 500;
  }
}

const INTERNAL_ERROR_CODES = new Set<ErrorCode>([
  'DATABASE_ERROR',
  'CRYPTO_ERROR',
  'OAUTH_CONFIG_MISSING',
  'INTERNAL_ERROR',
]);

export function normalizeError(error: unknown): {
  code: ErrorCode;
  message: string;
  publicMessage: string;
  statusCode: number;
} {
  if (error instanceof AppError) {
    const isInternal = !error.isOperational || INTERNAL_ERROR_CODES.has(error.code);
    return {
      code: error.code,
      message: error.message,
      publicMessage: isInternal
        ? 'No fue posible completar la operación en este momento. Inténtalo nuevamente más tarde.'
        : error.message,
      statusCode: error.statusCode,
    };
  }

  if (error instanceof Error) {
    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'Ha ocurrido un error inesperado en el servidor.',
      publicMessage:
        'No fue posible completar la operación en este momento. Inténtalo nuevamente más tarde.',
      statusCode: 500,
    };
  }

  return {
    code: 'INTERNAL_ERROR',
    message: 'Ha ocurrido un error desconocido.',
    publicMessage:
      'No fue posible completar la operación en este momento. Inténtalo nuevamente más tarde.',
    statusCode: 500,
  };
}
