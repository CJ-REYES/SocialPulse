'use client';

import * as React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Link2,
  RefreshCw,
  ShieldAlert,
  Unplug,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ConnectionStatusBadge,
  PlatformBadge,
} from '@/components/platforms/platform-badge';
import { SyncButton } from '@/components/dashboard/sync-button';
import { disconnectSocialAccountAction } from '@/features/connections/actions';
import {
  formatCompactNumber,
  formatDateTime,
  formatRelativeTime,
  getPlatformDisplayName,
} from '@/lib/utils/format';
import type { Platform, PlatformPermission, SocialAccount } from '@/types/domain';

export interface ConnectionCardProps {
  platform: Platform;
  isConfigured: boolean;
  requiredScopes: string[];
  account: SocialAccount | null;
  permissions: PlatformPermission[];
}

function getSafeAccountStatusMessage(account: SocialAccount): string | null {
  if (account.connectionStatus === 'connected' || account.connectionStatus === 'revoked') {
    return null;
  }
  switch (account.connectionStatus) {
    case 'expired':
      return 'Tu sesión con esta plataforma expiró. Pulsa "Renovar Autorización" para reanudar la sincronización.';
    case 'pending_review':
      return 'Algunos permisos de métricas aún requieren autorización en la plataforma.';
    case 'error':
      return 'No fue posible sincronizar los datos en el último intento. Puedes reintentar o renovar la autorización.';
    default:
      return null;
  }
}

export function ConnectionCard({
  platform,
  isConfigured,
  requiredScopes,
  account,
  permissions,
}: ConnectionCardProps) {
  const [isDisconnecting, startDisconnect] = React.useTransition();
  const [actionMessage, setActionMessage] = React.useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  const isConnected = account && account.connectionStatus === 'connected';
  const isExpiredOrError =
    account &&
    (account.connectionStatus === 'expired' ||
      account.connectionStatus === 'error' ||
      account.connectionStatus === 'pending_review');

  const safeStatusMessage = account ? getSafeAccountStatusMessage(account) : null;

  const handleDisconnect = (socialAccountId: string) => {
    setActionMessage(null);
    startDisconnect(async () => {
      const formData = new FormData();
      formData.set('socialAccountId', socialAccountId);
      const res = await disconnectSocialAccountAction(formData);
      setActionMessage({ ok: res.ok, text: res.message });
    });
  };

  return (
    <Card className="flex flex-col justify-between">
      <div>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <PlatformBadge platform={platform} />
              <ConnectionStatusBadge
                status={account ? account.connectionStatus : 'disconnected'}
              />
            </div>
            <CardTitle className="pt-1">
              {account ? account.accountName : `Conectar ${getPlatformDisplayName(platform)}`}
            </CardTitle>
            <CardDescription>
              {account?.accountHandle
                ? account.accountHandle
                : 'Conexión oficial de solo lectura para consultar métricas'}
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Aviso limpio sin exponer variables de entorno */}
          {!isConfigured ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-950/30 p-3 text-xs text-amber-200">
              <p className="font-semibold text-amber-300">
                Integración no disponible temporalmente
              </p>
              <p className="mt-1 leading-relaxed">
                La conexión con {getPlatformDisplayName(platform)} no está habilitada en este entorno todavía.
              </p>
            </div>
          ) : null}

          {/* Datos de la cuenta conectada */}
          {account ? (
            <div className="grid grid-cols-3 gap-2 rounded-lg border border-slateBlue-border bg-midnight/70 p-3 text-center">
              <div>
                <p className="text-[11px] text-slateBlue-muted">Seguidores</p>
                <p className="mt-0.5 text-sm font-bold text-white">
                  {formatCompactNumber(account.followersCount)}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-slateBlue-muted">Videos</p>
                <p className="mt-0.5 text-sm font-bold text-white">
                  {formatCompactNumber(account.postsCount)}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-slateBlue-muted">Última Sync</p>
                <p
                  className="mt-0.5 text-xs font-medium text-electricTeal truncate"
                  title={formatDateTime(account.lastSyncedAt)}
                >
                  {formatRelativeTime(account.lastSyncedAt)}
                </p>
              </div>
            </div>
          ) : null}

          {/* Aviso de estado seguro sin exponer trazas técnicas */}
          {safeStatusMessage ? (
            <div className="rounded-lg border border-rose-500/30 bg-rose-950/40 p-3 text-xs text-rose-200">
              <div className="flex items-center gap-1.5 font-semibold text-rose-300">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span>Acción requerida</span>
              </div>
              <p className="mt-1 leading-relaxed">{safeStatusMessage}</p>
            </div>
          ) : null}

          {/* Permisos Oficiales */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-slate-300">
              Permisos de solo lectura ({requiredScopes.length}):
            </p>
            <div className="flex flex-wrap gap-1.5">
              {requiredScopes.map((scope) => {
                const shortScope = scope.replace('https://www.googleapis.com/auth/', '');
                const grantedPerm = permissions.find((p) => p.scope === scope);
                const isGranted = grantedPerm?.status === 'granted';

                return (
                  <Badge
                    key={scope}
                    variant={isGranted ? 'success' : 'secondary'}
                    className="font-mono text-[11px]"
                  >
                    {isGranted ? (
                      <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                    ) : (
                      <AlertTriangle className="h-3 w-3 text-slateBlue-muted" />
                    )}
                    {shortScope}
                  </Badge>
                );
              })}
            </div>
          </div>

          {actionMessage ? (
            <p
              className={`text-xs font-medium ${
                actionMessage.ok ? 'text-electricTeal' : 'text-rose-400'
              }`}
            >
              {actionMessage.text}
            </p>
          ) : null}
        </CardContent>
      </div>

      {/* Acciones de Conexión / Renovación / Desconexión */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slateBlue-border/60 p-4">
        {!account || account.connectionStatus === 'revoked' ? (
          isConfigured ? (
            <a
              href={`/api/oauth/${platform}/connect`}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-electricTeal px-4 text-sm font-semibold text-midnight shadow-tealGlow transition-all hover:bg-electricTeal-hover"
            >
              <Link2 className="h-4 w-4" />
              <span>Conectar cuenta de {getPlatformDisplayName(platform)}</span>
            </a>
          ) : (
            <Button type="button" variant="secondary" disabled className="w-full">
              <Link2 className="h-4 w-4" />
              <span>No disponible actualmente</span>
            </Button>
          )
        ) : (
          <>
            <div className="flex items-center gap-2">
              {isConnected ? (
                <SyncButton
                  socialAccountId={account.id}
                  platform={platform}
                  size="sm"
                  label="Sincronizar Cuenta"
                />
              ) : null}

              {isExpiredOrError ? (
                <a
                  href={`/api/oauth/${platform}/connect`}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-electricTeal px-3 text-xs font-semibold text-midnight hover:bg-electricTeal-hover"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Renovar Autorización
                </a>
              ) : null}
            </div>

            <Button
              type="button"
              variant="danger"
              size="sm"
              disabled={isDisconnecting}
              onClick={() => handleDisconnect(account.id)}
            >
              <Unplug className="h-3.5 w-3.5" />
              <span>{isDisconnecting ? 'Revocando...' : 'Desconectar'}</span>
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}
