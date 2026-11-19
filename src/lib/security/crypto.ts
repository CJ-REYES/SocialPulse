import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { AppError } from '@/lib/utils/errors';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12;
const AUTH_TAG_LENGTH_BYTES = 16;
const CURRENT_VERSION_PREFIX = 'v1';

function resolveEncryptionKey(explicitSecret?: string): Buffer {
  const rawSecret = explicitSecret ?? process.env.OAUTH_ENCRYPTION_KEY;
  if (!rawSecret || rawSecret.trim().length < 32) {
    throw new AppError({
      code: 'CRYPTO_ERROR',
      message:
        'OAUTH_ENCRYPTION_KEY no está configurada o no cumple con la longitud mínima de seguridad (32 bytes / 64 hex chars).',
      isOperational: false,
    });
  }

  const trimmed = rawSecret.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, 'hex');
  }

  return createHash('sha256').update(trimmed, 'utf8').digest();
}

export function encryptOAuthToken(plaintext: string, explicitSecret?: string): string {
  if (!plaintext) {
    throw new AppError({
      code: 'CRYPTO_ERROR',
      message: 'No se puede cifrar un token OAuth vacío.',
    });
  }

  const key = resolveEncryptionKey(explicitSecret);
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH_BYTES,
  });

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    CURRENT_VERSION_PREFIX,
    iv.toString('base64url'),
    authTag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join(':');
}

export function decryptOAuthToken(encryptedPayload: string, explicitSecret?: string): string {
  if (!encryptedPayload) {
    throw new AppError({
      code: 'CRYPTO_ERROR',
      message: 'El payload cifrado del token OAuth está vacío.',
    });
  }

  const parts = encryptedPayload.split(':');
  if (parts.length !== 4 || parts[0] !== CURRENT_VERSION_PREFIX) {
    throw new AppError({
      code: 'CRYPTO_ERROR',
      message: 'Formato de token OAuth cifrado inválido o versión no soportada.',
    });
  }

  const [, ivB64, authTagB64, ciphertextB64] = parts;
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new AppError({
      code: 'CRYPTO_ERROR',
      message: 'Componentes criptográficos incompletos en el token almacenado.',
    });
  }

  try {
    const key = resolveEncryptionKey(explicitSecret);
    const iv = Buffer.from(ivB64, 'base64url');
    const authTag = Buffer.from(authTagB64, 'base64url');
    const ciphertext = Buffer.from(ciphertextB64, 'base64url');

    if (iv.length !== IV_LENGTH_BYTES || authTag.length !== AUTH_TAG_LENGTH_BYTES) {
      throw new Error('Invalid IV or AuthTag byte length');
    }

    const decipher = createDecipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH_BYTES,
    });
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (error) {
    throw new AppError({
      code: 'CRYPTO_ERROR',
      message: 'Fallo de integridad o autenticación al descifrar las credenciales OAuth.',
      cause: error,
    });
  }
}
