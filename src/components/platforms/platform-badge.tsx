import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { getPlatformDisplayName } from '@/lib/utils/format';
import type { ConnectionStatus, Platform, SyncStatus } from '@/types/domain';

export function PlatformBadge({ platform }: { platform: Platform }) {
  const styles: Record<Platform, string> = {
    youtube: 'bg-red-500/15 text-red-300 border border-red-500/30',
    tiktok: 'bg-electricTeal/15 text-electricTeal border border-electricTeal/30',
    instagram: 'bg-pink-500/15 text-pink-300 border border-pink-500/30',
    facebook: 'bg-blue-500/15 text-blue-300 border border-blue-500/30',
  };

  const dots: Record<Platform, string> = {
    youtube: 'bg-red-400',
    tiktok: 'bg-electricTeal',
    instagram: 'bg-pink-400',
    facebook: 'bg-blue-400',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[platform]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dots[platform]}`} />
      {getPlatformDisplayName(platform)}
    </span>
  );
}

export function ConnectionStatusBadge({
  status,
}: {
  status: ConnectionStatus | 'disconnected';
}) {
  const mapping: Record<
    ConnectionStatus | 'disconnected',
    { label: string; variant: 'success' | 'warning' | 'danger' | 'secondary' }
  > = {
    connected: { label: 'Conectada', variant: 'success' },
    expired: { label: 'Token Expirado', variant: 'warning' },
    pending_review: { label: 'Revisión API Pendiente', variant: 'warning' },
    revoked: { label: 'Desconectada', variant: 'secondary' },
    error: { label: 'Error de API', variant: 'danger' },
    disconnected: { label: 'No Vinculada', variant: 'secondary' },
  };

  const info = mapping[status];
  return <Badge variant={info.variant}>{info.label}</Badge>;
}

export function SyncStatusBadge({ status }: { status: SyncStatus }) {
  const mapping: Record<
    SyncStatus,
    { label: string; variant: 'success' | 'warning' | 'danger' | 'secondary' }
  > = {
    synced: { label: 'Sincronizado', variant: 'success' },
    partial: { label: 'Métricas Parciales', variant: 'warning' },
    pending: { label: 'Pendiente', variant: 'secondary' },
    error: { label: 'Error', variant: 'danger' },
  };

  const info = mapping[status];
  return <Badge variant={info.variant}>{info.label}</Badge>;
}
