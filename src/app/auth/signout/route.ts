import { revalidatePath } from 'next/cache';
import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { verifyCsrfOrigin } from '@/lib/security/csrf';
import { normalizeError } from '@/lib/utils/errors';

export async function POST(request: NextRequest) {
  try {
    verifyCsrfOrigin(request);

    if (isSupabaseConfigured()) {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        await supabase.auth.signOut();
      }
    }

    revalidatePath('/', 'layout');
    return NextResponse.redirect(new URL('/login', request.url), {
      status: 302,
    });
  } catch (error) {
    const normalized = normalizeError(error);
    return NextResponse.json(
      { error: normalized.code, message: normalized.publicMessage },
      { status: normalized.statusCode }
    );
  }
}
