import * as React from 'react';
import { ShieldCheck } from 'lucide-react';
import { requireAuthenticatedContext } from '@/features/auth/session';
import { listUserConnections } from '@/features/connections/connections.service';
import { getAllPlatformConfigStatuses } from '@/services/registry';
import { ConnectionCard } from '@/components/platforms/connection-card';
import { SyncButton } from '@/components/dashboard/sync-button';
import { AlertBanner } from '@/components/ui/alert';
import { getPlatformDisplayName } from '@/lib/utils/format';
import { platformSchema } from '@/lib/validation/schemas';
import { PLATFORMS, type Platform } from '@/types/domain';

function resolveSafeOAuthErrorMessage(
  errorCode: string,
  platform: Platform | null
): string {
  switch (errorCode) {
    case 'NOT_FOUND':
      if (platform === 'facebook') {
        return 'No se encontró ninguna Página de Facebook autorizada en tu cuenta. Asegúrate de administrar una Página y seleccionarla al conceder permisos.';
      }
      if (platform === 'instagram') {
        return 'No se encontró una cuenta Profesional de Instagram (Creador o Empresa) vinculada a tu Página de Facebook autorizada.';
      }
      if (platform === 'youtube') {
        return 'La cuenta de Google seleccionada no tiene un canal de YouTube activo.';
      }
      return 'No se encontró una cuenta compatible para vincular en esta plataforma.';
    case 'provider_denied':
    case 'OAUTH_PERMISSION_DENIED':
      return 'La autorización fue cancelada o faltan permisos requeridos para consultar tus estadísticas.';
    case 'OAUTH_STATE_INVALID':
      return 'La sesión de autorización expiró por seguridad. Intenta conectar la cuenta nuevamente.';
    case 'OAUTH_TOKEN_EXPIRED':
      return 'La autorización expiró. Vuelve a conectar la cuenta para renovar el acceso.';
    case 'RATE_LIMITED':
    case 'EXTERNAL_RATE_LIMIT':
      return 'Se alcanzó temporalmente el límite de solicitudes. Espera unos minutos e inténtalo de nuevo.';
    case 'oauth_config_missing':
    case 'OAUTH_CONFIG_MISSING':
      return 'Esta integración no está disponible temporalmente. Inténtalo más tarde.';
    default:
      return 'No fue posible completar la vinculación en este momento. Inténtalo nuevamente.';
  }
}

export default async function ConnectionsPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireAuthenticatedContext();
  const rawParams = await props.searchParams;

  const parsedConnected = platformSchema.safeParse(rawParams.connected);
  const connectedPlatform: Platform | null = parsedConnected.success
    ? parsedConnected.data
    : null;

  const parsedErrorPlatform = platformSchema.safeParse(rawParams.platform);
  const errorPlatform: Platform | null = parsedErrorPlatform.success
    ? parsedErrorPlatform.data
    : null;

  const errorCode = typeof rawParams.error === 'string' ? rawParams.error : null;

  const [connections, configStatuses] = await Promise.all([
    listUserConnections(ctx.userId),
    Promise.resolve(getAllPlatformConfigStatuses()),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Conexiones Oficiales
          </h1>
          <p className="text-xs text-slateBlue-muted">
            Administra tus cuentas vinculadas, permisos de solo lectura y sincronización de estadísticas.
          </p>
        </div>

        <SyncButton label="Sincronizar Todas las Cuentas" />
      </div>

      {/* Notificaciones seguras basadas en códigos controlados */}
      {connectedPlatform ? (
        <AlertBanner
          variant="success"
          title={`Cuenta de ${getPlatformDisplayName(connectedPlatform)} conectada y sincronizada`}
        >
          Tu cuenta fue vinculada de forma segura y se ejecutó la sincronización inicial de tus publicaciones y métricas.
        </AlertBanner>
      ) : null}

      {errorCode ? (
        <AlertBanner
          variant="error"
          title={`No fue posible conectar${
            errorPlatform ? ` ${getPlatformDisplayName(errorPlatform)}` : ' la cuenta'
          }`}
        >
          {resolveSafeOAuthErrorMessage(errorCode, errorPlatform)}
        </AlertBanner>
      ) : null}

      {/* Tarjetas de Conexión de las 4 Plataformas */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {PLATFORMS.map((platform) => {
          const match = connections.find((c) => c.account.platform === platform);
          return (
            <ConnectionCard
              key={platform}
              platform={platform}
              isConfigured={configStatuses[platform].isConfigured}
              requiredScopes={configStatuses[platform].requiredScopes}
              account={match?.account ?? null}
              permissions={match?.permissions ?? []}
            />
          );
        })}
      </div>

      {/* Nota de Privacidad para el Usuario */}
      <div className="rounded-xl border border-slateBlue-border bg-slateBlue/80 p-5 text-xs text-slate-300">
        <div className="flex items-center gap-2 font-semibold text-electricTeal">
          <ShieldCheck className="h-4 w-4" />
          <span>Protección de tus Cuentas y Credenciales</span>
        </div>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-slateBlue-muted">
          <li>
            Solicitamos exclusivamente permisos de lectura analítica; nunca publicamos contenido en tu nombre.
          </li>
          <li>
            Tus credenciales de acceso se gestionan únicamente en servidores protegidos mediante cifrado y nunca se almacenan en tu navegador.
          </li>
          <li>
            Puedes revocar y desconectar cualquier cuenta en cualquier momento desde este panel.
          </li>
        </ul>
      </div>
    </div>
  );
}
