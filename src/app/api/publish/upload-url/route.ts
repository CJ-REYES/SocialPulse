import { type NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/features/auth/session';
import { verifyCsrfOrigin } from '@/lib/security/csrf';
import { assertRateLimit } from '@/lib/security/rate-limit';
import { uploadUrlRequestSchema } from '@/lib/validation/schemas';
import { createSignedVideoUploadUrl } from '@/features/publishing/publish.service';
import { normalizeError } from '@/lib/utils/errors';

export async function POST(request: NextRequest) {
  try {
    verifyCsrfOrigin(request);

    const ctx = await getAuthenticatedContext();
    if (!ctx) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Debes iniciar sesión para subir videos.' },
        { status: 401 }
      );
    }

    assertRateLimit({
      key: `api:publish:upload-url:${ctx.userId}`,
      limit: 20,
      windowMs: 10 * 60 * 1000,
    });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const parsed = uploadUrlRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: parsed.error.issues[0]?.message ?? 'Archivo de video inválido.',
        },
        { status: 400 }
      );
    }

    const signed = await createSignedVideoUploadUrl({
      userId: ctx.userId,
      fileName: parsed.data.fileName,
      mimeType: parsed.data.mimeType,
    });

    return NextResponse.json({
      ok: true,
      storagePath: signed.storagePath,
      signedUrl: signed.signedUrl,
      token: signed.token,
    });
  } catch (error) {
    const normalized = normalizeError(error);
    return NextResponse.json(
      { error: normalized.code, message: normalized.publicMessage },
      { status: normalized.statusCode }
    );
  }
}
