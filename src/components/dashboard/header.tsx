import * as React from 'react';
import { LogOut, Shield, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SyncButton } from '@/components/dashboard/sync-button';
import { signOutAction } from '@/features/auth/actions';
import type { UserProfile } from '@/types/domain';

export interface DashboardHeaderProps {
  profile: UserProfile;
  connectedAccountsCount: number;
}

export function DashboardHeader({
  profile,
  connectedAccountsCount,
}: DashboardHeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-slateBlue-border bg-slateBlue/95 px-6 backdrop-blur">
      <div className="flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-2 rounded-full bg-midnight px-3 py-1 text-xs text-slate-300 border border-slateBlue-border">
          <span
            className={`h-2 w-2 rounded-full ${
              connectedAccountsCount > 0 ? 'bg-electricTeal' : 'bg-amber-400'
            }`}
          />
          <span>
            {connectedAccountsCount}{' '}
            {connectedAccountsCount === 1 ? 'cuenta oficial activa' : 'cuentas oficiales activas'}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <SyncButton size="sm" label="Sincronizar" />

        <div className="h-6 w-px bg-slateBlue-border" />

        <div className="flex items-center gap-3">
          <div className="hidden md:block text-right">
            <p className="text-xs font-semibold text-white">
              {profile.fullName ?? profile.email}
            </p>
            <p className="flex items-center justify-end gap-1 text-[11px] text-electricTeal">
              <Shield className="h-3 w-3" />
              <span className="uppercase">{profile.role}</span>
            </p>
          </div>

          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-midnight border border-electricTeal/40 text-electricTeal">
            <UserCheck className="h-4 w-4" />
          </div>

          <form action={signOutAction}>
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              title="Cerrar sesión segura"
              aria-label="Cerrar sesión"
            >
              <LogOut className="h-4 w-4 text-slateBlue-muted hover:text-rose-400" />
              <span className="hidden sm:inline text-xs">Salir</span>
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
