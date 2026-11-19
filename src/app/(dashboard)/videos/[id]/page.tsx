import * as React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import {
  ArrowLeft,
  Clock,
  ExternalLink,
  Eye,
  Film,
  Heart,
  Info,
  MessageSquare,
  Share2,
} from 'lucide-react';
import { requireAuthenticatedContext } from '@/features/auth/session';
import { getVideoDetailWithHistory } from '@/features/videos/videos.repository';
import { VideoHistoryChart } from '@/components/charts/video-history-chart';
import {
  PlatformBadge,
  SyncStatusBadge,
} from '@/components/platforms/platform-badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  formatCompactNumber,
  formatDateTime,
  formatDurationSeconds,
  formatFullNumber,
  getPlatformDisplayName,
} from '@/lib/utils/format';

export default async function VideoDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireAuthenticatedContext();
  const { id } = await props.params;

  if (!z.string().uuid().safeParse(id).success) {
    notFound();
  }

  const detail = await getVideoDetailWithHistory(ctx.userId, id);
  if (!detail) {
    notFound();
  }

  const { video, account, snapshots } = detail;

  return (
    <div className="space-y-6">
      {/* Navegación Superior */}
      <div className="flex items-center justify-between">
        <Link
          href="/videos"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-electricTeal hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a la biblioteca de videos
        </Link>

        <a
          href={video.permalink}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-electricTeal px-4 text-xs font-semibold text-midnight shadow-tealGlow hover:bg-electricTeal-hover"
        >
          <span>Abrir Publicación Original</span>
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      {/* Cabecera de Detalle del Video */}
      <Card>
        <CardContent className="flex flex-col gap-6 p-6 md:flex-row">
          <div className="relative h-44 w-full shrink-0 overflow-hidden rounded-xl bg-midnight border border-slateBlue-border md:w-72">
            {video.thumbnailUrl ? (
              <Image
                src={video.thumbnailUrl}
                alt={video.title}
                fill
                sizes="(max-width: 768px) 100vw, 288px"
                className="object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-slateBlue-muted">
                <Film className="h-10 w-10" />
              </div>
            )}
          </div>

          <div className="flex flex-1 flex-col justify-between space-y-4">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <PlatformBadge platform={video.platform} />
                <SyncStatusBadge status={video.syncStatus} />
                <Badge variant="secondary" className="uppercase">
                  {video.contentType}
                </Badge>
              </div>

              <h1 className="text-xl font-bold text-white">{video.title}</h1>

              {video.description ? (
                <p className="line-clamp-3 text-xs leading-relaxed text-slateBlue-muted">
                  {video.description}
                </p>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-3 border-t border-slateBlue-border pt-3 text-xs sm:grid-cols-4">
              <div>
                <p className="text-slateBlue-muted">Cuenta Origen</p>
                <p className="font-semibold text-white">
                  {account?.accountName ?? getPlatformDisplayName(video.platform)}
                </p>
              </div>
              <div>
                <p className="text-slateBlue-muted">Fecha de Publicación</p>
                <p className="font-semibold text-white">
                  {formatDateTime(video.publishedAt)}
                </p>
              </div>
              <div>
                <p className="text-slateBlue-muted">Duración</p>
                <p className="font-mono font-semibold text-white">
                  {formatDurationSeconds(video.durationSeconds)}
                </p>
              </div>
              <div>
                <p className="text-slateBlue-muted">Última Sincronización</p>
                <p className="font-semibold text-electricTeal">
                  {formatDateTime(video.lastSyncedAt)}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tarjetas de Métricas Individuales */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs text-slateBlue-muted">
              <span>Visualizaciones</span>
              <Eye className="h-4 w-4 text-electricTeal" />
            </div>
            <p className="mt-2 font-mono text-2xl font-bold text-white">
              {formatFullNumber(video.viewsCount)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs text-slateBlue-muted">
              <span>Me gusta</span>
              <Heart className="h-4 w-4 text-electricTeal" />
            </div>
            <p className="mt-2 font-mono text-2xl font-bold text-white">
              {formatFullNumber(video.likesCount)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs text-slateBlue-muted">
              <span>Comentarios</span>
              <MessageSquare className="h-4 w-4 text-electricTeal" />
            </div>
            <p className="mt-2 font-mono text-2xl font-bold text-white">
              {formatFullNumber(video.commentsCount)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs text-slateBlue-muted">
              <span>Compartidos</span>
              <Share2 className="h-4 w-4 text-electricTeal" />
            </div>
            <p className="mt-2 font-mono text-2xl font-bold text-white">
              {video.sharesCount !== null
                ? formatFullNumber(video.sharesCount)
                : 'No disponible'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Métricas Extendidas y Transparencia de Disponibilidad de API */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            Métricas Extendidas y Disponibilidad de la API Oficial
          </CardTitle>
          <CardDescription>
            Transparencia sobre las métricas expuestas por {getPlatformDisplayName(video.platform)} para esta publicación
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 text-xs">
            <div className="rounded-lg border border-slateBlue-border bg-midnight/60 p-3">
              <p className="text-slateBlue-muted">Alcance Único (Reach)</p>
              <p className="mt-1 font-mono text-sm font-bold text-white">
                {video.reachCount !== null
                  ? formatFullNumber(video.reachCount)
                  : 'No expuesto por API'}
              </p>
            </div>
            <div className="rounded-lg border border-slateBlue-border bg-midnight/60 p-3">
              <p className="text-slateBlue-muted">Impresiones</p>
              <p className="mt-1 font-mono text-sm font-bold text-white">
                {video.impressionsCount !== null
                  ? formatFullNumber(video.impressionsCount)
                  : 'No expuesto por API'}
              </p>
            </div>
            <div className="rounded-lg border border-slateBlue-border bg-midnight/60 p-3">
              <p className="text-slateBlue-muted">Tiempo de Visualización (min)</p>
              <p className="mt-1 font-mono text-sm font-bold text-white">
                {video.watchTimeMinutes !== null
                  ? `${formatFullNumber(video.watchTimeMinutes)} min`
                  : 'No expuesto por API'}
              </p>
            </div>
            <div className="rounded-lg border border-slateBlue-border bg-midnight/60 p-3">
              <p className="text-slateBlue-muted">Retención Promedio</p>
              <p className="mt-1 font-mono text-sm font-bold text-white">
                {video.avgViewDurationSeconds !== null
                  ? formatDurationSeconds(video.avgViewDurationSeconds)
                  : 'No expuesto por API'}
              </p>
            </div>
          </div>

          {video.unavailableMetrics.length > 0 ? (
            <div className="flex items-start gap-2.5 rounded-lg border border-slateBlue-border bg-midnight/80 p-3 text-xs text-slateBlue-muted">
              <Info className="h-4 w-4 shrink-0 text-electricTeal mt-0.5" />
              <p>
                Métricas no disponibles en el endpoint oficial de{' '}
                {getPlatformDisplayName(video.platform)} para este elemento:{' '}
                <span className="font-mono text-slate-200">
                  {video.unavailableMetrics.join(', ')}
                </span>
                .
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Gráfica de Evolución Histórica del Video */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-electricTeal" />
            Evolución Histórica de Snapshots
          </CardTitle>
          <CardDescription>
            Historial inmutable de métricas capturadas en cada sincronización ({snapshots.length}{' '}
            snapshots registrados)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <VideoHistoryChart snapshots={snapshots} />
        </CardContent>
      </Card>

      {/* Tabla de Snapshots Históricos */}
      {snapshots.length > 0 ? (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="text-sm">Registro de Snapshots Históricos</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slateBlue-border bg-midnight/90 uppercase text-slateBlue-muted">
                <tr>
                  <th className="px-4 py-3">Fecha y Hora de Captura</th>
                  <th className="px-4 py-3 text-right">Visualizaciones</th>
                  <th className="px-4 py-3 text-right">Delta Vistas</th>
                  <th className="px-4 py-3 text-right">Me gusta</th>
                  <th className="px-4 py-3 text-right">Comentarios</th>
                  <th className="px-4 py-3 text-right">Compartidos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slateBlue-border/60">
                {[...snapshots].reverse().map((snap) => (
                  <tr key={snap.id} className="hover:bg-midnight/40">
                    <td className="px-4 py-2.5 font-mono text-slate-300">
                      {formatDateTime(snap.capturedAt)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold text-white">
                      {formatFullNumber(snap.viewsCount)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-electricTeal">
                      +{formatCompactNumber(snap.viewsDelta)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-300">
                      {formatFullNumber(snap.likesCount)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-300">
                      {formatFullNumber(snap.commentsCount)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-300">
                      {snap.sharesCount !== null ? formatFullNumber(snap.sharesCount) : 'N/D'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
