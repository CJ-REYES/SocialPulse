'use client';

import * as React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Eye,
  Film,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
  PlatformBadge,
  SyncStatusBadge,
} from '@/components/platforms/platform-badge';
import {
  formatCompactNumber,
  formatDateShort,
  formatDurationSeconds,
  formatFullNumber,
} from '@/lib/utils/format';
import type { VideoRecord } from '@/types/domain';

export interface VideosTableProps {
  items: VideoRecord[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  currentFilters: {
    platform: string;
    syncStatus: string;
    search: string;
    sortBy: string;
    sortOrder: string;
  };
}

export function VideosTable({
  items,
  totalCount,
  page,
  totalPages,
  currentFilters,
}: VideosTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [searchInput, setSearchInput] = React.useState(currentFilters.search);

  const updateQuery = (updates: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v && v !== 'all') {
        params.set(k, v);
      } else {
        params.delete(k);
      }
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateQuery({ search: searchInput.trim() || undefined, page: '1' });
  };

  const toggleSort = (column: string) => {
    const isSameCol = currentFilters.sortBy === column;
    const nextOrder = isSameCol && currentFilters.sortOrder === 'desc' ? 'asc' : 'desc';
    updateQuery({ sortBy: column, sortOrder: nextOrder, page: '1' });
  };

  return (
    <div className="space-y-4">
      {/* Barra de Búsqueda, Filtros y Ordenamiento */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
          <form onSubmit={handleSearchSubmit} className="flex flex-1 items-center gap-2">
            <div className="relative flex-1 max-w-md">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slateBlue-muted" />
              <Input
                type="search"
                placeholder="Buscar por título o descripción..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button type="submit" variant="secondary" size="default">
              Buscar
            </Button>
          </form>

          <div className="flex flex-wrap items-center gap-2.5">
            <select
              aria-label="Filtrar por plataforma"
              value={currentFilters.platform}
              onChange={(e) => updateQuery({ platform: e.target.value, page: '1' })}
              className="h-10 rounded-lg border border-slateBlue-border bg-midnight px-3 text-xs font-medium text-slate-100 focus:outline-none focus:ring-2 focus:ring-electricTeal"
            >
              <option value="all">Todas las plataformas</option>
              <option value="youtube">YouTube</option>
              <option value="tiktok">TikTok</option>
              <option value="instagram">Instagram</option>
              <option value="facebook">Facebook</option>
            </select>

            <select
              aria-label="Filtrar por estado de sincronización"
              value={currentFilters.syncStatus}
              onChange={(e) => updateQuery({ syncStatus: e.target.value, page: '1' })}
              className="h-10 rounded-lg border border-slateBlue-border bg-midnight px-3 text-xs font-medium text-slate-100 focus:outline-none focus:ring-2 focus:ring-electricTeal"
            >
              <option value="all">Todos los estados</option>
              <option value="synced">Sincronizado completo</option>
              <option value="partial">Métricas parciales</option>
              <option value="error">Con error</option>
            </select>

            <select
              aria-label="Ordenar por"
              value={`${currentFilters.sortBy}:${currentFilters.sortOrder}`}
              onChange={(e) => {
                const [col, ord] = e.target.value.split(':');
                updateQuery({ sortBy: col, sortOrder: ord, page: '1' });
              }}
              className="h-10 rounded-lg border border-slateBlue-border bg-midnight px-3 text-xs font-medium text-slate-100 focus:outline-none focus:ring-2 focus:ring-electricTeal"
            >
              <option value="published_at:desc">Más recientes primero</option>
              <option value="published_at:asc">Más antiguos primero</option>
              <option value="views_count:desc">Mayor número de visualizaciones</option>
              <option value="likes_count:desc">Mayor número de Me gusta</option>
              <option value="comments_count:desc">Mayor número de comentarios</option>
              <option value="shares_count:desc">Mayor número de compartidos</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Tabla de Videos */}
      <Card className="overflow-hidden">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-midnight border border-slateBlue-border text-electricTeal">
              <Film className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-base font-semibold text-white">
              No se encontraron publicaciones
            </h3>
            <p className="mt-1 max-w-md text-xs text-slateBlue-muted">
              Asegúrate de haber conectado tus cuentas oficiales en Conexiones OAuth y ejecutado una sincronización, o ajusta los filtros de búsqueda.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slateBlue-border bg-midnight/90 text-xs uppercase tracking-wider text-slateBlue-muted">
                <tr>
                  <th className="px-4 py-3.5 font-semibold">Publicación</th>
                  <th className="px-4 py-3.5 font-semibold">Plataforma</th>
                  <th className="px-4 py-3.5 font-semibold">
                    <button
                      type="button"
                      onClick={() => toggleSort('published_at')}
                      className="inline-flex items-center gap-1 hover:text-electricTeal"
                    >
                      Fecha
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="px-4 py-3.5 text-right font-semibold">
                    <button
                      type="button"
                      onClick={() => toggleSort('views_count')}
                      className="inline-flex items-center justify-end gap-1 hover:text-electricTeal"
                    >
                      Vistas
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="px-4 py-3.5 text-right font-semibold">
                    <button
                      type="button"
                      onClick={() => toggleSort('likes_count')}
                      className="inline-flex items-center justify-end gap-1 hover:text-electricTeal"
                    >
                      Me gusta
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="px-4 py-3.5 text-right font-semibold">
                    <button
                      type="button"
                      onClick={() => toggleSort('comments_count')}
                      className="inline-flex items-center justify-end gap-1 hover:text-electricTeal"
                    >
                      Comentarios
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="px-4 py-3.5 text-right font-semibold">Compartidos</th>
                  <th className="px-4 py-3.5 font-semibold">Estado</th>
                  <th className="px-4 py-3.5 text-right font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slateBlue-border/60">
                {items.map((video) => (
                  <tr
                    key={video.id}
                    className="hover:bg-midnight/40 transition-colors"
                  >
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3 max-w-md">
                        <div className="relative h-12 w-20 shrink-0 overflow-hidden rounded-md bg-midnight border border-slateBlue-border">
                          {video.thumbnailUrl ? (
                            <Image
                              src={video.thumbnailUrl}
                              alt={video.title}
                              fill
                              sizes="80px"
                              className="object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-slateBlue-muted">
                              <Film className="h-4 w-4" />
                            </div>
                          )}
                          {video.durationSeconds !== null ? (
                            <span className="absolute bottom-1 right-1 rounded bg-midnight/90 px-1 py-0.2 text-[10px] font-mono text-slate-200">
                              {formatDurationSeconds(video.durationSeconds)}
                            </span>
                          ) : null}
                        </div>
                        <div className="min-w-0">
                          <Link
                            href={`/videos/${video.id}`}
                            className="line-clamp-1 font-medium text-white hover:text-electricTeal transition-colors"
                          >
                            {video.title}
                          </Link>
                          {video.description ? (
                            <p className="line-clamp-1 text-xs text-slateBlue-muted mt-0.5">
                              {video.description}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <PlatformBadge platform={video.platform} />
                    </td>

                    <td className="px-4 py-3.5 whitespace-nowrap text-xs text-slate-300">
                      {formatDateShort(video.publishedAt)}
                    </td>

                    <td
                      className="px-4 py-3.5 whitespace-nowrap text-right font-mono font-semibold text-electricTeal"
                      title={formatFullNumber(video.viewsCount)}
                    >
                      {formatCompactNumber(video.viewsCount)}
                    </td>

                    <td
                      className="px-4 py-3.5 whitespace-nowrap text-right font-mono text-slate-200"
                      title={formatFullNumber(video.likesCount)}
                    >
                      {formatCompactNumber(video.likesCount)}
                    </td>

                    <td
                      className="px-4 py-3.5 whitespace-nowrap text-right font-mono text-slate-200"
                      title={formatFullNumber(video.commentsCount)}
                    >
                      {formatCompactNumber(video.commentsCount)}
                    </td>

                    <td className="px-4 py-3.5 whitespace-nowrap text-right font-mono text-slate-300">
                      {video.sharesCount !== null ? (
                        formatCompactNumber(video.sharesCount)
                      ) : (
                        <span
                          className="text-[11px] text-slateBlue-muted"
                          title="Esta métrica no es expuesta públicamente por el endpoint de la API oficial"
                        >
                          No disp.
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <SyncStatusBadge status={video.syncStatus} />
                    </td>

                    <td className="px-4 py-3.5 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link
                          href={`/videos/${video.id}`}
                          className="inline-flex h-8 items-center gap-1 rounded-md border border-slateBlue-border bg-midnight px-2.5 text-xs font-medium text-slate-200 hover:border-electricTeal hover:text-electricTeal"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Detalle
                        </Link>
                        <a
                          href={video.permalink}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Abrir publicación original"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slateBlue-border bg-midnight text-slateBlue-muted hover:border-electricTeal hover:text-electricTeal"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginación */}
        {totalPages > 1 ? (
          <div className="flex items-center justify-between border-t border-slateBlue-border bg-midnight/60 px-5 py-3">
            <p className="text-xs text-slateBlue-muted">
              Mostrando página <span className="font-semibold text-white">{page}</span> de{' '}
              <span className="font-semibold text-white">{totalPages}</span> ({totalCount}{' '}
              publicaciones totales)
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => updateQuery({ page: String(page - 1) })}
              >
                <ChevronLeft className="h-4 w-4" />
                Anterior
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => updateQuery({ page: String(page + 1) })}
              >
                Siguiente
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
