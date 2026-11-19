'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { BarChart3, Lock, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertBanner } from '@/components/ui/alert';
import { loginAction, type AuthActionState } from '@/features/auth/actions';

const INITIAL_STATE: AuthActionState = { status: 'idle' };

function LoginFormContent() {
  const searchParams = useSearchParams();
  const urlError = searchParams.get('error');
  const [state, formAction, isPending] = React.useActionState(loginAction, INITIAL_STATE);

  const getUrlErrorMessage = (code: string | null): string | null => {
    switch (code) {
      case 'invalid_or_expired_link':
        return 'El enlace de verificación ha expirado o ya fue utilizado.';
      case 'service_unavailable':
        return 'El servicio de autenticación no está disponible en este momento. Inténtalo nuevamente más tarde.';
      default:
        return null;
    }
  };

  const bannerMessage = state.message ?? getUrlErrorMessage(urlError);

  return (
    <Card className="w-full max-w-md border-slateBlue-border bg-slateBlue">
      <CardHeader className="space-y-3 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-electricTeal/15 border border-electricTeal/40 text-electricTeal shadow-tealGlow">
          <BarChart3 className="h-6 w-6" />
        </div>
        <div>
          <CardTitle className="text-xl font-bold text-white">
            SOCIAL<span className="text-electricTeal">PULSE</span> ANALYTICS
          </CardTitle>
          <CardDescription className="mt-1">
            Plataforma de inteligencia multiplataforma (YouTube, TikTok, Instagram, Facebook)
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {bannerMessage ? (
          <AlertBanner
            variant={state.status === 'success' ? 'success' : 'error'}
            title="Aviso de Seguridad"
          >
            {bannerMessage}
          </AlertBanner>
        ) : null}

        <form action={formAction} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="email"
              className="block text-xs font-semibold uppercase tracking-wider text-slate-300"
            >
              Correo Electrónico
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="propietario@tudominio.com"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="password"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-300"
              >
                Contraseña
              </label>
              <Link
                href="/forgot-password"
                className="text-xs font-medium text-electricTeal hover:underline"
              >
                ¿Olvidaste tu contraseña?
              </Link>
            </div>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              placeholder="••••••••••••"
            />
          </div>

          <Button type="submit" className="w-full" disabled={isPending}>
            <Lock className="h-4 w-4" />
            <span>{isPending ? 'Verificando credenciales...' : 'Iniciar Sesión Segura'}</span>
          </Button>
        </form>

        <div className="text-center text-xs text-slateBlue-muted">
          ¿Aún no tienes cuenta?{' '}
          <Link
            href="/signup"
            className="font-semibold text-electricTeal hover:underline"
          >
            Crear cuenta gratis
          </Link>
        </div>

        <div className="rounded-lg border border-slateBlue-border bg-midnight/80 p-3 text-xs text-slateBlue-muted">
          <div className="flex items-center gap-2 font-semibold text-electricTeal">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            <span>Privacidad y Seguridad</span>
          </div>
          <p className="mt-1 leading-relaxed">
            Tus cuentas conectadas y estadísticas permanecen protegidas con cifrado y acceso exclusivo para tu perfil.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-midnight p-4">
      <React.Suspense
        fallback={
          <div className="h-96 w-full max-w-md animate-pulse rounded-xl bg-slateBlue" />
        }
      >
        <LoginFormContent />
      </React.Suspense>
    </main>
  );
}
