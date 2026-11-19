import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { AppError } from '@/lib/utils/errors';
import type { Platform } from '@/types/domain';

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutos

export interface OAuthStatePayload {
  userId: string;
  platform: Platform;
  nonce: string;
  issuedAt: number;
}

function getStateSecret(explicitSecret?: string): string {
  const secret =
    explicitSecret ?? process.env.OAUTH_STATE_SECRET ?? process.env.OAUTH_ENCRYPTION_KEY;
  if (!secret || secret.trim().length < 16) {
    throw new AppError({
      code: 'CRYPTO_ERROR',
      message: 'OAUTH_STATE_SECRET no está configurado correctamente.',
    });
  }
  return secret.trim();
}

export function createSignedOAuthState(
  params: { userId: string; platform: Platform },
  explicitSecret?: string
): { state: string; nonce: string } {
  const secret = getStateSecret(explicitSecret);
  const nonce = randomBytes(16).toString('base64url');
  const payload: OAuthStatePayload = {
    userId: params.userId,
    platform: params.platform,
    nonce,
    issuedAt: Date.now(),
  };

  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = createHmac('sha256', secret).update(encodedPayload).digest('base64url');

  return {
    state: `${encodedPayload}.${signature}`,
    nonce,
  };
}

export function verifySignedOAuthState(
  stateToken: string,
  expected: { userId: string; platform: Platform; expectedNonce?: string },
  explicitSecret?: string
): OAuthStatePayload {
  const secret = getStateSecret(explicitSecret);
  const parts = stateToken.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new AppError({
      code: 'OAUTH_STATE_INVALID',
      message: 'El parámetro state de OAuth tiene un formato inválido.',
    });
  }

  const [encodedPayload, providedSignature] = parts;
  const expectedSignature = createHmac('sha256', secret)
    .update(encodedPayload)
    .digest('base64url');

  const sigBufferA = Buffer.from(providedSignature, 'utf8');
  const sigBufferB = Buffer.from(expectedSignature, 'utf8');

  if (sigBufferA.length !== sigBufferB.length || !timingSafeEqual(sigBufferA, sigBufferB)) {
    throw new AppError({
      code: 'OAUTH_STATE_INVALID',
      message: 'Firma criptográfica del estado OAuth inválida (posible intento CSRF).',
    });
  }

  let payload: OAuthStatePayload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as OAuthStatePayload;
  } catch {
    throw new AppError({
      code: 'OAUTH_STATE_INVALID',
      message: 'No fue posible decodificar el estado OAuth.',
    });
  }

  if (Date.now() - payload.issuedAt > STATE_TTL_MS) {
    throw new AppError({
      code: 'OAUTH_STATE_INVALID',
      message: 'La solicitud de autorización OAuth ha expirado. Inicia la conexión nuevamente.',
    });
  }

  if (payload.userId !== expected.userId || payload.platform !== expected.platform) {
    throw new AppError({
      code: 'OAUTH_STATE_INVALID',
      message: 'El estado OAuth no corresponde al usuario o plataforma actual.',
    });
  }

  if (expected.expectedNonce && payload.nonce !== expected.expectedNonce) {
    throw new AppError({
      code: 'OAUTH_STATE_INVALID',
      message: 'El nonce de sesión OAuth no coincide con la cookie de seguridad.',
    });
  }

  return payload;
}

export function generatePkcePair(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = randomBytes(32).toString('base64url');
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}
