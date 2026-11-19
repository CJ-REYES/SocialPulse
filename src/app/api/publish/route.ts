import { type NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/features/auth/session';
import { verifyCsrfOrigin } from '@/lib/security/csrf';
import { assertRateLimit } from '@/lib/security/rate-limit';
import {
  cancelPublishJobSchema,
  createPublishJobSchema,
} from '@/lib/validation/schemas';
import {
  cancelScheduledPublishJob,
  dispatchOrScheduleVideoPublish,
  processDueScheduledPublishJobs,
} from '@/features/publishing/publish.service';
import { normalizeError } from '@/lib/utils/errors';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    verifyCsrfOrigin(request);

    const ctx = await getAuthenticatedContext();
    if (!ctx) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Debes iniciar sesión para publicar.' },
        { status: 401 }
      );
    }

    assertRateLimit({
      key: `api:publish:create:${ctx.userId}`,
      limit: 15,
      windowMs: 15 * 60 * 1000,
    });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const parsed = createPublishJobSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: parsed.error.issues[0]?.message ?? 'Datos de publicación inválidos.',
        },
        { status: 400 }
      );
    }

    const jobs = await dispatchOrScheduleVideoPublish({
      userId: ctx.userId,
      socialAccountIds: parsed.data.socialAccountIds,
      title: parsed.data.title,
      description: parsed.data.description,
      privacyStatus: parsed.data.privacyStatus,
      storagePath: parsed.data.storagePath,
      thumbnailStoragePath: parsed.data.thumbnailStoragePath ?? null,
      thumbnailMimeType: parsed.data.thumbnailMimeType ?? null,
      fileName: parsed.data.fileName,
      fileSizeBytes: parsed.data.fileSizeBytes,
      mimeType: parsed.data.mimeType,
      scheduledAt: parsed.data.scheduledAt ?? null,
    });

    return NextResponse.json({ ok: true, jobs });
  } catch (error) {
    const normalized = normalizeError(error);
    return NextResponse.json(
      { error: normalized.code, message: normalized.publicMessage },
      { status: normalized.statusCode }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    verifyCsrfOrigin(request);

    const ctx = await getAuthenticatedContext();
    if (!ctx) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Debes iniciar sesión.' },
        { status: 401 }
      );
    }

    const processed = await processDueScheduledPublishJobs(ctx.userId);
    return NextResponse.json({
      ok: true,
      processedCount: processed.length,
      jobs: processed,
    });
  } catch (error) {
    const normalized = normalizeError(error);
    return NextResponse.json(
      { error: normalized.code, message: normalized.publicMessage },
      { status: normalized.statusCode }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    verifyCsrfOrigin(request);

    const ctx = await getAuthenticatedContext();
    if (!ctx) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Debes iniciar sesión.' },
        { status: 401 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const parsed = cancelPublishJobSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'Identificador inválido.' },
        { status: 400 }
      );
    }

    await cancelScheduledPublishJob({
      userId: ctx.userId,
      publishJobId: parsed.data.publishJobId,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const normalized = normalizeError(error);
    return NextResponse.json(
      { error: normalized.code, message: normalized.publicMessage },
      { status: normalized.statusCode }
    );
  }
}
