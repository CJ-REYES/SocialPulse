import * as React from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  GitCompareArrows,
  TrendingUp,
} from 'lucide-react';
import { requireAuthenticatedContext } from '@/features/auth/session';
import { getDashboardOverviewData } from '@/features/analytics/analytics.service';
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
import {
  formatCompactNumber,
  formatFullNumber,
  formatPercentage,
} from '@/lib/utils/format';

export default async function ComparePlatformsPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireAuthenticatedContext();
  const rawParams = await props.searchParams;

  const overview = await getDashboardOverviewData(ctx.userId, {
    preset: typeof rawParams.preset === 'string' ? rawParams.preset : '30d',
    platform: 'all',
    from: typeof rawParams.from === 'string' ? rawParams.from : undefined,
    to: typeof rawParams.to === 'string' ? rawParams.to : undefined,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Comparación Multiplataforma
        </h1>
        <p className="text-xs text-slateBlue-muted">
          Benchmarking cruzado de YouTube, TikTok, Instagram y Facebook con desglose metodológico por proveedor.
        </p>
      </div>

      {/* Filtro de Período */}
      <React.Suspense fallback={<div className="h-16 rounded-xl bg-slateBlue animate-pulse" />}>
        <FilterBar
          activePreset={overview.filter.preset}
          showPlatformSelector={false}
          startDate={overview.filter.startDate}
          endDate={overview.filter.endDate}
          has24hData={overview.has24hData}
        />
      </React.Suspense>

      {/* Aviso Metodológico Obligatorio (Requisito 7.4) */}
      <div className="flex items-start gap-3 rounded-xl border border-electricTeal/40 bg-slateBlue p-4 text-xs text-slate-200">
        <AlertCircle className="h-5 w-5 shrink-0 text-electricTeal mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-white">
            Nota sobre diferencias metodológicas entre plataformas
          </p>
          <p className="leading-relaxed text-slateBlue-muted">
            Las plataformas definen una &ldquo;visualización&rdquo; bajo umbrales técnicos distintos (YouTube contabiliza reproducciones legítimas iniciadas; TikTok contabiliza desde el primer fotograma en feed; Instagram Graph API v21 reporta <code className="text-electricTeal">views</code> unificadas; Meta Facebook contabiliza a partir de ≥3 segundos). Analiza las cuotas porcentuales y tendencias de crecimiento considerando estas diferencias metodológicas.
          </p>
        </div>
      </div>

      {/* Tabla Comparativa de las 4 Plataformas */}
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitCompareArrows className="h-4 w-4 text-electricTeal" />
            Matriz Comparativa de Rendimiento
          </CardTitle>
          <CardDescription>
            Distribución porcentual, interacciones, audiencia y tasa de crecimiento por red social
          </CardDescription>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slateBlue-border bg-midnight/90 text-xs uppercase tracking-wider text-slateBlue-muted">
              <tr>
                <th className="px-4 py-3.5">Plataforma</th>
                <th className="px-4 py-3.5">Estado</th>
                <th className="px-4 py-3.5 text-right">Seguidores</th>
                <th className="px-4 py-3.5 text-right">Videos</th>
                <th className="px-4 py-3.5 text-right">Visualizaciones</th>
                <th className="px-4 py-3.5 text-right">Cuota (%)</th>
                <th className="px-4 py-3.5 text-right">Promedio / Video</th>
                <th className="px-4 py-3.5 text-right">Interacciones</th>
                <th className="px-4 py-3.5 text-right">Crecimiento Período</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slateBlue-border/60">
              {overview.platformSummaries.map((plat) => (
                <tr key={plat.platform} className="hover:bg-midnight/40">
                  <td className="px-4 py-3.5">
                    <Link href={`/platforms/${plat.platform}`}>
                      <PlatformBadge platform={plat.platform} />
                    </Link>
                  </td>
                  <td className="px-4 py-3.5">
                    <ConnectionStatusBadge status={plat.connectionStatus} />
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-slate-200">
                    {plat.connectionStatus === 'disconnected'
                      ? '—'
                      : formatFullNumber(plat.followersCount)}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-slate-200">
                    {formatFullNumber(plat.totalVideos)}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono font-bold text-electricTeal">
                    {formatFullNumber(plat.totalViews)}
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="h-2 w-16 overflow-hidden rounded-full bg-midnight">
                        <div
                          className="h-full bg-electricTeal"
                          style={{ width: `${Math.min(100, plat.viewsSharePercentage)}%` }}
                        />
                      </div>
                      <span className="font-mono text-xs text-white">
                        {plat.viewsSharePercentage}%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-slate-200">
                    {formatCompactNumber(plat.averageViewsPerVideo)}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-slate-200">
                    {formatCompactNumber(plat.totalInteractions)}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-xs">
                    <span
                      className={
                        plat.periodGrowthPercentage && plat.periodGrowthPercentage > 0
                          ? 'text-electricTeal font-semibold'
                          : 'text-slateBlue-muted'
                      }
                    >
                      {formatPercentage(plat.periodGrowthPercentage)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Gráficas Comparativas: Visualizaciones vs Interacciones */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Comparativa de Visualizaciones por Plataforma</CardTitle>
            <CardDescription>Volumen bruto acumulado según criterio de cada API</CardDescription>
          </CardHeader>
          <CardContent>
            <PlatformDistributionChart
              summaries={overview.platformSummaries}
              metric="totalViews"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Comparativa de Interacciones Totales</CardTitle>
            <CardDescription>
              Suma de Me gusta, comentarios y compartidos disponibles
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PlatformDistributionChart
              summaries={overview.platformSummaries}
              metric="totalInteractions"
            />
          </CardContent>
        </Card>
      </div>

      {/* Evolución Temporal Multiplataforma */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-electricTeal" />
            Evolución Temporal Comparada
          </CardTitle>
          <CardDescription>
            Superposición de curvas de rendimiento entre las cuatro plataformas
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ViewsEvolutionChart data={overview.timeSeries} />
        </CardContent>
      </Card>

      {/* Desglose Metodológico por Plataforma */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {overview.platformSummaries.map((plat) => (
          <Card key={plat.platform}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <PlatformBadge platform={plat.platform} />
                <span className="font-mono text-xs text-slateBlue-muted">
                  Shares:{' '}
                  {plat.totalShares !== null
                    ? formatCompactNumber(plat.totalShares)
                    : 'No expuesto en endpoint base'}
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-xs leading-relaxed text-slateBlue-muted">
                {plat.methodologyNote}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
