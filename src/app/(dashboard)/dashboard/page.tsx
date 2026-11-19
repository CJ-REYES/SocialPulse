import * as React from 'react';
import Link from 'next/link';
import {
  Activity,
  Award,
  BarChart2,
  ExternalLink,
  Eye,
  Film,
  Flame,
  HeartHandshake,
  Link2,
  TrendingUp,
  Users,
} from 'lucide-react';
import { requireAuthenticatedContext } from '@/features/auth/session';
import { getDashboardOverviewData } from '@/features/analytics/analytics.service';
import { MetricCard } from '@/components/dashboard/metric-card';
import { FilterBar } from '@/components/dashboard/filter-bar';
import { ViewsEvolutionChart } from '@/components/charts/views-evolution-chart';
import { PlatformDistributionChart } from '@/components/charts/platform-distribution-chart';
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
  formatDateShort,
  formatFullNumber,
  formatPercentage,
  formatRelativeTime,
  getPlatformDisplayName,
} from '@/lib/utils/format';

export default async function DashboardOverviewPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireAuthenticatedContext();
  const rawParams = await props.searchParams;

  const overview = await getDashboardOverviewData(ctx.userId, {
    preset: typeof rawParams.preset === 'string' ? rawParams.preset : undefined,
    platform: typeof rawParams.platform === 'string' ? rawParams.platform : undefined,
    from: typeof rawParams.from === 'string' ? rawParams.from : undefined,
    to: typeof rawParams.to === 'string' ? rawParams.to : undefined,
  });

  const hasConnectedAccounts = overview.accounts.some(
    (a) => a.connectionStatus === 'connected'
  );

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Resumen Ejecutivo Multiplataforma
          </h1>
          <p className="text-xs text-slateBlue-muted">
            Analítica consolidada del {overview.filter.startDate} al {overview.filter.endDate} comparada contra el período equivalente previo.
          </p>
        </div>

        <Link
          href="/connections"
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-slateBlue-border bg-slateBlue px-3.5 text-xs font-medium text-slate-200 hover:border-electricTeal hover:text-electricTeal"
        >
          <Link2 className="h-3.5 w-3.5 text-electricTeal" />
          Administrar Conexiones OAuth
        </Link>
      </div>

      {/* Aviso real si no hay cuentas conectadas (Regla Innegociable: nunca simular que una cuenta está conectada) */}
      {!hasConnectedAccounts ? (
        <AlertBanner
          variant="info"
          title="Ninguna cuenta oficial conectada actualmente"
        >
          Para visualizar estadísticas reales de YouTube, TikTok, Instagram y Facebook, dirígete a{' '}
          <Link href="/connections" className="font-semibold text-electricTeal underline">
            Conexiones OAuth
          </Link>{' '}
          y autoriza tus cuentas oficiales. Esta plataforma no utiliza datos simulados ni falsos.
        </AlertBanner>
      ) : null}

      {/* Barra de Filtros por Período y Plataforma */}
      <React.Suspense fallback={<div className="h-16 rounded-xl bg-slateBlue animate-pulse" />}>
        <FilterBar
          activePreset={overview.filter.preset}
          activePlatform={overview.filter.platform}
          startDate={overview.filter.startDate}
          endDate={overview.filter.endDate}
          has24hData={overview.has24hData}
        />
      </React.Suspense>

      {/* Tarjetas KPI Principales */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Visualizaciones Totales"
          value={formatCompactNumber(overview.totals.views.current)}
          subtitle={`${formatFullNumber(overview.totals.views.current)} reproducciones acumuladas`}
          percentageChange={overview.totals.views.percentageChange}
          icon={<Eye className="h-4 w-4" />}
          highlight
        />

        <MetricCard
          title="Publicaciones Analizadas"
          value={formatFullNumber(overview.totals.videos.current)}
          subtitle="Videos, Shorts y Reels sincronizados"
          percentageChange={overview.totals.videos.percentageChange}
          icon={<Film className="h-4 w-4" />}
        />

        <MetricCard
          title="Interacciones Totales"
          value={formatCompactNumber(overview.totals.interactions.current)}
          subtitle="Me gusta + Comentarios + Compartidos"
          percentageChange={overview.totals.interactions.percentageChange}
          icon={<HeartHandshake className="h-4 w-4" />}
        />

        <MetricCard
          title="Promedio Vistas / Video"
          value={formatCompactNumber(overview.totals.averageViewsPerVideo.current)}
          subtitle={`Audiencia total: ${formatCompactNumber(overview.totals.followers)} seguidores`}
          percentageChange={overview.totals.averageViewsPerVideo.percentageChange}
          icon={<BarChart2 className="h-4 w-4" />}
        />
      </div>

      {/* Destacados: Plataforma Líder + Video Más Popular + Seguidores por Plataforma */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Plataforma con Mejor Rendimiento */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">
                Plataforma con Mejor Rendimiento
              </CardTitle>
              <Award className="h-4 w-4 text-electricTeal" />
            </div>
            <CardDescription>Líder en volumen de visualizaciones</CardDescription>
          </CardHeader>
          <CardContent>
            {overview.topPlatform ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <PlatformBadge platform={overview.topPlatform.platform} />
                  <span className="text-xs font-mono text-electricTeal">
                    {overview.topPlatform.viewsSharePercentage}% del total
                  </span>
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">
                    {formatFullNumber(overview.topPlatform.totalViews)} vistas
                  </p>
                  <p className="mt-1 text-xs text-slateBlue-muted">
                    {overview.topPlatform.totalVideos} videos • Promedio{' '}
                    {formatCompactNumber(overview.topPlatform.averageViewsPerVideo)} vistas/video
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slateBlue-muted py-4">
                Sin datos suficientes para determinar la plataforma líder.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Video Más Popular */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Video Más Popular</CardTitle>
              <TrendingUp className="h-4 w-4 text-electricTeal" />
            </div>
            <CardDescription>Publicación con mayor alcance acumulado</CardDescription>
          </CardHeader>
          <CardContent>
            {overview.mostPopularVideo ? (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <PlatformBadge platform={overview.mostPopularVideo.platform} />
                  <span className="text-xs text-slateBlue-muted">
                    {formatDateShort(overview.mostPopularVideo.publishedAt)}
                  </span>
                </div>
                <Link
                  href={`/videos/${overview.mostPopularVideo.id}`}
                  className="block line-clamp-1 text-sm font-semibold text-white hover:text-electricTeal"
                >
                  {overview.mostPopularVideo.title}
                </Link>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono font-bold text-electricTeal">
                    {formatFullNumber(overview.mostPopularVideo.viewsCount)} vistas
                  </span>
                  <a
                    href={overview.mostPopularVideo.permalink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-slateBlue-muted hover:text-white"
                  >
                    Original <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slateBlue-muted py-4">
                No hay videos sincronizados en el filtro actual.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Seguidores por Plataforma */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">
                Seguidores por Plataforma
              </CardTitle>
              <Users className="h-4 w-4 text-electricTeal" />
            </div>
            <CardDescription>
              Total acumulado: {formatFullNumber(overview.totals.followers)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2.5">
              {overview.platformSummaries.map((plat) => (
                <Link
                  key={plat.platform}
                  href={`/platforms/${plat.platform}`}
                  className="flex items-center justify-between rounded-lg border border-slateBlue-border bg-midnight/70 px-3 py-2 hover:border-electricTeal/50 transition-colors"
                >
                  <span className="text-xs font-medium text-slate-300">
                    {getPlatformDisplayName(plat.platform)}
                  </span>
                  <span className="font-mono text-xs font-bold text-white">
                    {plat.connectionStatus === 'disconnected'
                      ? '—'
                      : formatCompactNumber(plat.followersCount)}
                  </span>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Gráficas Interactivas: Evolución Temporal y Distribución por Plataforma */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Evolución del Rendimiento de Publicaciones</CardTitle>
            <CardDescription>
              Visualizaciones desglosadas por plataforma a lo largo del período seleccionado
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ViewsEvolutionChart data={overview.timeSeries} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Visualizaciones por Plataforma</CardTitle>
            <CardDescription>
              Comparativa de volumen entre YouTube, TikTok, Instagram y Facebook
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PlatformDistributionChart
              summaries={overview.platformSummaries}
              metric="totalViews"
            />
          </CardContent>
        </Card>
      </div>

      {/* Videos con Crecimiento Más Rápido y Estado de Sincronización */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Flame className="h-4 w-4 text-electricTeal" />
                Videos con Crecimiento Más Rápido
              </CardTitle>
              <CardDescription>
                Publicaciones con mayor ganancia de visualizaciones durante el período activo
              </CardDescription>
            </div>
            <Link
              href="/videos"
              className="text-xs font-medium text-electricTeal hover:underline"
            >
              Ver biblioteca completa →
            </Link>
          </CardHeader>
          <CardContent>
            {overview.fastestGrowingVideos.length === 0 ? (
              <p className="text-xs text-slateBlue-muted py-6 text-center">
                Aún no hay publicaciones sincronizadas para calcular velocidad de crecimiento.
              </p>
            ) : (
              <div className="divide-y divide-slateBlue-border/60">
                {overview.fastestGrowingVideos.map((item, idx) => (
                  <div
                    key={item.video.id}
                    className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-midnight border border-slateBlue-border font-mono text-xs font-bold text-electricTeal">
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <Link
                          href={`/videos/${item.video.id}`}
                          className="block truncate text-sm font-medium text-white hover:text-electricTeal"
                        >
                          {item.video.title}
                        </Link>
                        <div className="mt-1 flex items-center gap-2">
                          <PlatformBadge platform={item.video.platform} />
                          <span className="text-xs text-slateBlue-muted">
                            {formatDateShort(item.video.publishedAt)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <p className="font-mono text-sm font-bold text-electricTeal">
                        +{formatCompactNumber(item.viewsGrowthInPeriod)} vistas
                      </p>
                      <p className="text-[11px] text-slateBlue-muted">
                        Total: {formatCompactNumber(item.video.viewsCount)}{' '}
                        {item.growthRatePercentage !== null
                          ? `(${formatPercentage(item.growthRatePercentage)})`
                          : ''}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Estado de Cuentas y Últimas Sincronizaciones */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-electricTeal" />
              Estado de Sincronización
            </CardTitle>
            <CardDescription>
              Salud de conexiones OAuth y actividad reciente
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              {overview.platformSummaries.map((plat) => {
                const account = overview.accounts.find((a) => a.platform === plat.platform);
                return (
                  <div
                    key={plat.platform}
                    className="flex items-center justify-between rounded-lg border border-slateBlue-border bg-midnight/60 p-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white">
                        {getPlatformDisplayName(plat.platform)}
                      </p>
                      <p className="text-[11px] text-slateBlue-muted truncate">
                        {account
                          ? `${account.accountName} • ${formatRelativeTime(account.lastSyncedAt)}`
                          : 'Cuenta no conectada'}
                      </p>
                    </div>
                    <ConnectionStatusBadge status={plat.connectionStatus} />
                  </div>
                );
              })}
            </div>

            {overview.recentSyncJobs.length > 0 ? (
              <div className="border-t border-slateBlue-border pt-3">
                <p className="text-xs font-semibold text-slate-300 mb-2">
                  Últimos trabajos de sincronización
                </p>
                <div className="space-y-1.5">
                  {overview.recentSyncJobs.slice(0, 4).map((job) => (
                    <div
                      key={job.id}
                      className="flex items-center justify-between text-[11px] text-slateBlue-muted"
                    >
                      <span>
                        {job.platform ? getPlatformDisplayName(job.platform) : 'Global'} (
                        {job.triggerSource})
                      </span>
                      <span className="font-mono text-slate-300">
                        {job.status} • {job.videosProcessed} videos
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
