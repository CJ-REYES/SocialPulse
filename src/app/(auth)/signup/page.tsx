'use client';

import * as React from 'react';
import Link from 'next/link';
import { BarChart3, ShieldCheck, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { AlertBanner } from '@/components/ui/alert';
import { signupAction, type AuthActionState } from '@/features/auth/actions';

const INITIAL_STATE: AuthActionState = { status: 'idle' };

export default function SignupPage() {
  const [state, formAction, isPending] = React.useActionState(
    signupAction,
    INITIAL_STATE
  );

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-midnight p-4">
      <Card className="w-full max-w-md border-slateBlue-border bg-slateBlue">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-electricTeal/15 border border-electricTeal/40 text-electricTeal shadow-tealGlow">
            <BarChart3 className="h-6 w-6" />
          </div>
          <div>
            <CardTitle className="text-xl font-bold text-white">
              Crear Cuenta en SOCIAL<span className="text-electricTeal">PULSE</span>
            </CardTitle>
            <CardDescription className="mt-1">
              Analítica multiplataforma para YouTube, TikTok, Instagram y Facebook
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          {state.message ? (
            <AlertBanner
              variant={state.status === 'success' ? 'success' : 'error'}
              title={state.status === 'success' ? 'Registro Exitoso' : 'Error en Registro'}
            >
              {state.message}
            </AlertBanner>
          ) : null}

          <form action={formAction} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="fullName"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-300"
              >
                Nombre Completo
              </label>
              <Input
                id="fullName"
                name="fullName"
                type="text"
                autoComplete="name"
                required
                minLength={2}
                placeholder="Tu nombre"
              />
            </div>

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
                placeholder="tu@correo.com"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-300"
              >
                Contraseña
              </label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={10}
                placeholder="Mínimo 10 caracteres (Mayús, minús, número)"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="confirmPassword"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-300"
              >
                Confirmar Contraseña
              </label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                minLength={10}
                placeholder="Repite tu contraseña"
              />
            </div>

            <Button type="submit" className="w-full" disabled={isPending}>
              <UserPlus className="h-4 w-4" />
              <span>{isPending ? 'Creando cuenta...' : 'Crear Cuenta Gratis'}</span>
            </Button>
          </form>

          <div className="text-center text-xs text-slateBlue-muted">
            ¿Ya tienes una cuenta?{' '}
            <Link
              href="/login"
              className="font-semibold text-electricTeal hover:underline"
            >
              Inicia sesión aquí
            </Link>
          </div>

          <div className="rounded-lg border border-slateBlue-border bg-midnight/80 p-3 text-xs text-slateBlue-muted">
            <div className="flex items-center gap-2 font-semibold text-electricTeal">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              <span>Privacidad Garantizada</span>
            </div>
            <p className="mt-1 leading-relaxed">
              Tus cuentas conectadas y estadísticas permanecen aisladas y protegidas exclusivamente dentro de tu espacio personal.
            </p>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
