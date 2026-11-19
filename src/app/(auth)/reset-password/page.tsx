'use client';

import * as React from 'react';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertBanner } from '@/components/ui/alert';
import { resetPasswordAction, type AuthActionState } from '@/features/auth/actions';

const INITIAL_STATE: AuthActionState = { status: 'idle' };

export default function ResetPasswordPage() {
  const [state, formAction, isPending] = React.useActionState(
    resetPasswordAction,
    INITIAL_STATE
  );

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-midnight p-4">
      <Card className="w-full max-w-md border-slateBlue-border bg-slateBlue">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-electricTeal/15 border border-electricTeal/40 text-electricTeal">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <CardTitle className="text-xl font-bold text-white">
              Establecer Nueva Contraseña
            </CardTitle>
            <CardDescription className="mt-1">
              Mínimo 10 caracteres incluyendo mayúsculas, minúsculas y números.
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {state.message ? (
            <AlertBanner
              variant={state.status === 'success' ? 'success' : 'error'}
              title="Validación"
            >
              {state.message}
            </AlertBanner>
          ) : null}

          <form action={formAction} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-300"
              >
                Nueva Contraseña
              </label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                minLength={10}
                placeholder="••••••••••••"
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
                required
                minLength={10}
                placeholder="••••••••••••"
              />
            </div>

            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? 'Actualizando...' : 'Guardar Nueva Contraseña'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
