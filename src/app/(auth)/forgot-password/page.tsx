'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertBanner } from '@/components/ui/alert';
import { forgotPasswordAction, type AuthActionState } from '@/features/auth/actions';

const INITIAL_STATE: AuthActionState = { status: 'idle' };

export default function ForgotPasswordPage() {
  const [state, formAction, isPending] = React.useActionState(
    forgotPasswordAction,
    INITIAL_STATE
  );

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-midnight p-4">
      <Card className="w-full max-w-md border-slateBlue-border bg-slateBlue">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-electricTeal/15 border border-electricTeal/40 text-electricTeal">
            <KeyRound className="h-6 w-6" />
          </div>
          <div>
            <CardTitle className="text-xl font-bold text-white">
              Recuperación de Contraseña
            </CardTitle>
            <CardDescription className="mt-1">
              Introduce tu correo electrónico registrado para recibir un enlace seguro de restablecimiento.
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {state.message ? (
            <AlertBanner
              variant={state.status === 'success' ? 'success' : 'error'}
              title={state.status === 'success' ? 'Solicitud Procesada' : 'Error'}
            >
              {state.message}
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
                required
                placeholder="propietario@tudominio.com"
              />
            </div>

            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? 'Enviando enlace...' : 'Enviar Enlace de Recuperación'}
            </Button>
          </form>

          <div className="pt-2 text-center">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-electricTeal hover:underline"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Volver al inicio de sesión
            </Link>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
