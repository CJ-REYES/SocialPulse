'use server';

import { revalidatePath } from 'next/cache';
import { requireAuthenticatedContext } from '@/features/auth/session';
import { manualSyncRequestSchema } from '@/lib/validation/schemas';
import { assertRateLimit } from '@/lib/security/rate-limit';
import {
  synchronizeAllUserAccounts,
  synchronizeSocialAccount,
  type AccountSyncSummary,
} from '@/features/synchronization/sync.service';
import { normalizeError } from '@/lib/utils/errors';

export interface SyncActionResult {
  ok: boolean;
  message: string;
  summaries: AccountSyncSummary[];
}

export async function triggerManualSyncAction(input?: {
  socialAccountId?: string;
  platform?: 'youtube' | 'tiktok' | 'instagram' | 'facebook';
}): Promise<SyncActionResult> {
  try {
    const ctx = await requireAuthenticatedContext();

    assertRateLimit({
      key: `sync:manual:${ctx.userId}`,
      limit: 10,
      windowMs: 5 * 60 * 1000, // Máximo 10 sincronizaciones manuales por cada 5 minutos
    });

    const parsed = manualSyncRequestSchema.safeParse(input ?? {});
    if (!parsed.success) {
      return {
        ok: false,
        message: parsed.error.issues[0]?.message ?? 'Parámetros de sincronización inválidos.',
        summaries: [],
      };
    }

    let summaries: AccountSyncSummary[];
    if (parsed.data.socialAccountId) {
      const summary = await synchronizeSocialAccount({
        socialAccountId: parsed.data.socialAccountId,
        userId: ctx.userId,
        triggerSource: 'manual',
      });
      summaries = [summary];
    } else {
      summaries = await synchronizeAllUserAccounts({
        userId: ctx.userId,
        platform: parsed.data.platform,
        triggerSource: 'manual',
      });
    }

    revalidatePath('/dashboard');
    revalidatePath('/connections');
    revalidatePath('/videos');
    revalidatePath('/compare');

    if (summaries.length === 0) {
      return {
        ok: false,
        message:
          'No hay cuentas conectadas activas para sincronizar. Conecta al menos una cuenta oficial en la sección Conexiones.',
        summaries: [],
      };
    }

    const failedCount = summaries.filter((s) => s.status === 'failed').length;
    const totalVideos = summaries.reduce((acc, s) => acc + s.videosProcessed, 0);

    if (failedCount === summaries.length) {
      return {
        ok: false,
        message:
          summaries[0]?.errorMessage ??
          'La sincronización falló en las cuentas seleccionadas.',
        summaries,
      };
    }

    return {
      ok: true,
      message: `Sincronización finalizada: ${totalVideos} publicaciones procesadas en ${summaries.length} cuenta(s).`,
      summaries,
    };
  } catch (error) {
    const normalized = normalizeError(error);
    return {
      ok: false,
      message: normalized.publicMessage,
      summaries: [],
    };
  }
}
