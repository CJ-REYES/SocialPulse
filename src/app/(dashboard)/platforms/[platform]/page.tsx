import * as React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  BarChart2,
  Eye,
  Film,
  HeartHandshake,
  Info,
  Link2,
  Users,
} from 'lucide-react';
import { requireAuthenticatedContext } from '@/features/auth/session';
import { getDashboardOverviewData } from '@/features/analytics/analytics.service';
import { queryVideosLibrary } from '@/features/videos/videos.repository';
import { platformSchema } from '@/lib/validation/schemas';
import { MetricCard } from '@/components/dashboard/metric-card';
import { FilterBar } from '@/components/dashboard/filter-bar';
import { SyncButton } from '@/components/dashboard/sync-button';
import { ViewsEvolutionChart } from '@/components/charts/views-evolution-chart';
import { VideosTable } from '@/components/videos/videos-table';
import {
  ConnectionStatusBadge,
  PlatformBadge,
} from '@/components/platforms/platform-badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { AlertBanner } from '@/components/ui/alert';
import {
  formatCompactNumber,
  formatFullNumber,
  formatRelativeTime,
  getPlatformDisplayName,
  getPlatformMethodologyNote,
} from '@/lib/utils/format';

export default async function PlatformPerformancePage(props: {
  params: Promise<{ platform: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireAuthenticatedContext();
  const { platform: rawPlatform } = await props.params;
  const parsedPlatform = platformSchema.safeParse(rawPlatform);

  if (!parsedPlatform.success) {
    notFound();
  }

  const platform = parsedPlatform.data;
  const rawSearch = await props.searchParams;

  const [overview, videosPage] = await Promise.all([
    getDashboardOverviewData(ctx.userId, {
      preset: typeof rawSearch.preset === 'string' ? rawSearch.preset : '30d',
      platform,
      from: typeof rawSearch.from === 'string' ? rawSearch.from : undefined,
      to: typeof rawSearch.to === 'string' ? rawSearch.to : undefined,
    }),
    queryVideosLibrary(ctx.userId, {
      platform,
      syncStatus: typeof rawSearch.syncStatus === 'string' ? rawSearch.syncStatus : 'all',
      search: typeof rawSearch.search === 'string' ? rawSearch.search : '',
      sortBy: typeof rawSearch.sortBy === 'string' ? rawSearch.sortBy : 'published_at',
      sortOrder: typeof rawSearch.sortOrder === 'string' ? rawSearch.sortOrder : 'desc',
      page: typeof rawSearch.page === 'string' ? rawSearch.page : '1',
      pageSize: '15',
    }),
  ]);

  const platformSummary = overview.platformSummaries.find((p) => p.platform === platform)!;
  const account = overview.accounts.find((a) => a.platform === platform) ?? null;

  return (
    <div className="space-y-6">
      {/* Encabezado de Plataforma */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <PlatformBadge platform={platform} />
            <ConnectionStatusBadge status={platformSummary.connectionStatus} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Rendimiento en {getPlatformDisplayName(platform)}
          </h1>
          <p className="text-xs text-slateBlue-muted">
            {account
              ? `Cuenta vinculada: ${account.accountName} (${account.accountHandle ?? account.externalAccountId}) • Última sincronización: ${formatRelativeTime(account.lastSyncedAt)}`
              : `Ninguna cuenta oficial de ${getPlatformDisplayName(platform)} conectada actualmente.`}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {account && account.connectionStatus === 'connected' ? (
            <SyncButton
              socialAccountId={account.id}
              platform={platform}
              size="sm"
              label={`Sincronizar ${getPlatformDisplayName(platform)}`}
            />
          ) : (
            <Link
              href="/connections"
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-electricTeal px-4 text-xs font-semibold text-midnight shadow-tealGlow hover:bg-electricTeal-hover"
            >
              <Link2 className="h-3.5 w-3.5" />
              Conectar {getPlatformDisplayName(platform)}
            </Link>
          )}
        </div>
      </div>

      {account &&
      (account.connectionStatus === 'expired' ||
        account.connectionStatus === 'error' ||
        account.connectionStatus === 'pending_review') ? (
        <AlertBanner
          variant="error"
          title={`Atención requerida en ${getPlatformDisplayName(platform)}`}
        >
          No fue posible sincronizar las métricas más recientes. Ve a{' '}
          <Link href="/connections" className="font-semibold text-electricTeal underline">
            Conexiones Oficiales
          </Link>{' '}
          para renovar la autorización de tu cuenta.
        </AlertBanner>
      ) : null}

      {/* Filtro de Fechas */}
      <React.Suspense fallback={<div className="h-16 rounded-xl bg-slateBlue animate-pulse" />}>
        <FilterBar
          activePreset={overview.filter.preset}
          activePlatform={platform}
          showPlatformSelector={false}
          startDate={overview.filter.startDate}
          endDate={overview.filter.endDate}
          has24hData={overview.has24hData}
        />
      </React.Suspense>

      {/* KPIs de la Plataforma */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Visualizaciones"
          value={formatCompactNumber(platformSummary.totalViews)}
          subtitle={`${platformSummary.viewsSharePercentage}% del volumen multiplataforma`}
          percentageChange={overview.totals.views.percentageChange}
          icon={<Eye className="h-4 w-4" />}
          highlight
        />

        <MetricCard
          title="Seguidores / Suscriptores"
          value={
            platformSummary.connectionStatus === 'disconnected'
              ? 'No conectada'
              : formatFullNumber(platformSummary.followersCount)
          }
          subtitle={`Audiencia oficial en ${getPlatformDisplayName(platform)}`}
          icon={<Users className="h-4 w-4" />}
        />

        <MetricCard
          title="Interacciones"
          value={formatCompactNumber(platformSummary.totalInteractions)}
          subtitle={`Likes: ${formatCompactNumber(platformSummary.totalLikes)} • Comentarios: ${formatCompactNumber(platformSummary.totalComments)}`}
          percentageChange={overview.totals.interactions.percentageChange}
          icon={<HeartHandshake className="h-4 w-4" />}
        />

        <MetricCard
          title="Publicaciones Sincronizadas"
          value={formatFullNumber(platformSummary.totalVideos)}
          subtitle={`Promedio: ${formatCompactNumber(platformSummary.averageViewsPerVideo)} vistas/video`}
          icon={<Film className="h-4 w-4" />}
        />
      </div>

      {/* Nota Metodológica Oficial de la API */}
      <div className="flex items-start gap-3 rounded-xl border border-slateBlue-border bg-slateBlue/70 p-4 text-xs text-slate-300">
        <Info className="h-4 w-4 shrink-0 text-electricTeal mt-0.5" />
        <div>
          <span className="font-semibold text-white">
            Metodología y alcance de la API oficial de {getPlatformDisplayName(platform)}:{' '}
          </span>
          {getPlatformMethodologyNote(platform)}
        </div>
      </div>

      {/* Evolución Histórica de la Plataforma */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart2 className="h-4 w-4 text-electricTeal" />
            Evolución Histórica en {getPlatformDisplayName(platform)}
          </CardTitle>
          <CardDescription>
            Curva temporal de visualizaciones basada en publicaciones y snapshots históricos
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ViewsEvolutionChart data={overview.timeSeries} />
        </CardContent>
      </Card>

      {/* Publicaciones de la Plataforma */}
      <div className="space-y-3">
        <h2 className="text-lg font-bold text-white">
          Publicaciones de {getPlatformDisplayName(platform)}
        </h2>
        <React.Suspense fallback={<div className="h-64 rounded-xl bg-slateBlue animate-pulse" />}>
          <VideosTable
            items={videosPage.items}
            totalCount={videosPage.totalCount}
            page={videosPage.page}
            pageSize={videosPage.pageSize}
            totalPages={videosPage.totalPages}
            currentFilters={{
              platform,
              syncStatus:
                typeof rawSearch.syncStatus === 'string' ? rawSearch.syncStatus : 'all',
              search: typeof rawSearch.search === 'string' ? rawSearch.search : '',
              sortBy:
                typeof rawSearch.sortBy === 'string' ? rawSearch.sortBy : 'published_at',
              sortOrder:
                typeof rawSearch.sortOrder === 'string' ? rawSearch.sortOrder : 'desc',
            }}
          />
        </React.Suspense>
      </div>
    </div>
  );
}
