import { type NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/features/auth/session';
import { verifyCsrfOrigin } from '@/lib/security/csrf';
import { assertRateLimit } from '@/lib/security/rate-limit';
import { manualSyncRequestSchema } from '@/lib/validation/schemas';
import {
  synchronizeAllUserAccounts,
  synchronizeSocialAccount,
} from '@/features/synchronization/sync.service';
import { normalizeError } from '@/lib/utils/errors';

export async function POST(request: NextRequest) {
  try {
    verifyCsrfOrigin(request);

    const ctx = await getAuthenticatedContext();
    if (!ctx) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Sesión no válida.' },
        { status: 401 }
      );
    }

    assertRateLimit({
      key: `api:sync:manual:${ctx.userId}`,
      limit: 10,
      windowMs: 5 * 60 * 1000,
    });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const parsed = manualSyncRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: parsed.error.issues[0]?.message ?? 'Datos de entrada inválidos.',
        },
        { status: 400 }
      );
    }

    if (parsed.data.socialAccountId) {
      const summary = await synchronizeSocialAccount({
        socialAccountId: parsed.data.socialAccountId,
        userId: ctx.userId,
        triggerSource: 'manual',
      });
      return NextResponse.json({ ok: true, summaries: [summary] });
    }

    const summaries = await synchronizeAllUserAccounts({
      userId: ctx.userId,
      platform: parsed.data.platform,
      triggerSource: 'manual',
    });

    return NextResponse.json({ ok: true, summaries });
  } catch (error) {
    const normalized = normalizeError(error);
    return NextResponse.json(
      { error: normalized.code, message: normalized.publicMessage },
      { status: normalized.statusCode }
    );
  }
}
