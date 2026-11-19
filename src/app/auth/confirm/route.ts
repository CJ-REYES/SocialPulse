import { type EmailOtpType } from '@supabase/supabase-js';
import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Verifica enlaces de email de Supabase Auth (invitación, recuperación, cambio de email).
 * Soporta ambos formatos:
 *  - PKCE (plantilla por defecto): ?code=...
 *  - Token hash (plantilla personalizada): ?token_hash=...&type=recovery|invite|email
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const nextParam = searchParams.get('next') ?? '/dashboard';
  // Evita open redirects: solo rutas relativas internas
  const safeNext =
    nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/dashboard';

  const redirectTo = request.nextUrl.clone();
  redirectTo.pathname = safeNext;
  redirectTo.search = '';

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(redirectTo);
    }
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      return NextResponse.redirect(redirectTo);
    }
  }

  redirectTo.pathname = '/login';
  redirectTo.searchParams.set('error', 'invalid_or_expired_link');
  return NextResponse.redirect(redirectTo);
}
