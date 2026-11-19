'use server';

import { revalidatePath } from 'next/cache';
import { requireAuthenticatedContext } from '@/features/auth/session';
import { disconnectAccountSchema } from '@/lib/validation/schemas';
import { disconnectAndRevokeAccount } from '@/features/connections/connections.service';
import { normalizeError } from '@/lib/utils/errors';

export interface ConnectionActionResult {
  ok: boolean;
  message: string;
}

export async function disconnectSocialAccountAction(
  formData: FormData
): Promise<ConnectionActionResult> {
  try {
    const ctx = await requireAuthenticatedContext();
    const rawId = String(formData.get('socialAccountId') ?? '');
    const parsed = disconnectAccountSchema.safeParse({ socialAccountId: rawId });

    if (!parsed.success) {
      return {
        ok: false,
        message: parsed.error.issues[0]?.message ?? 'Identificador de cuenta inválido.',
      };
    }

    await disconnectAndRevokeAccount({
      userId: ctx.userId,
      socialAccountId: parsed.data.socialAccountId,
    });

    revalidatePath('/connections');
    revalidatePath('/dashboard');
    return {
      ok: true,
      message: 'Cuenta desconectada y credenciales OAuth revocadas de forma segura.',
    };
  } catch (error) {
    const normalized = normalizeError(error);
    return {
      ok: false,
      message: normalized.publicMessage,
    };
  }
}
