import { timingSafeEqual } from 'crypto';
import { AppError } from '@/lib/utils/errors';

export function verifyCsrfOrigin(request: Request): void {
  const originHeader = request.headers.get('origin');
  const hostHeader = request.headers.get('x-forwarded-host') ?? request.headers.get('host');

  if (!originHeader || !hostHeader) {
    throw new AppError({
      code: 'CSRF_INVALID',
      message: 'Solicitud bloqueada por política CSRF: cabeceras Origin o Host ausentes.',
    });
  }

  let originHost: string;
  try {
    originHost = new URL(originHeader).host;
  } catch {
    throw new AppError({
      code: 'CSRF_INVALID',
      message: 'Solicitud bloqueada por política CSRF: cabecera Origin malformada.',
    });
  }

  if (originHost !== hostHeader) {
    throw new AppError({
      code: 'CSRF_INVALID',
      message: 'Solicitud bloqueada por política CSRF: el origen no coincide con el host autorizado.',
    });
  }
}

export function verifyCronSecretHeader(
  authorizationHeader: string | null,
  expectedSecret: string | undefined = process.env.CRON_SECRET
): void {
  if (!expectedSecret || expectedSecret.trim().length < 16) {
    throw new AppError({
      code: 'UNAUTHORIZED',
      message: 'CRON_SECRET no está configurado en el servidor.',
    });
  }

  if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
    throw new AppError({
      code: 'UNAUTHORIZED',
      message: 'Cabecera Authorization Bearer requerida para sincronización programada.',
    });
  }

  const providedToken = authorizationHeader.slice('Bearer '.length).trim();
  const expectedBuffer = Buffer.from(expectedSecret.trim(), 'utf8');
  const providedBuffer = Buffer.from(providedToken, 'utf8');

  if (
    expectedBuffer.length !== providedBuffer.length ||
    !timingSafeEqual(expectedBuffer, providedBuffer)
  ) {
    throw new AppError({
      code: 'UNAUTHORIZED',
      message: 'Credencial de sincronización servidor-a-servidor inválida.',
    });
  }
}
