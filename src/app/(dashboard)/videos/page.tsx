import * as React from 'react';
import { requireAuthenticatedContext } from '@/features/auth/session';
import { queryVideosLibrary } from '@/features/videos/videos.repository';
import { VideosTable } from '@/components/videos/videos-table';

export default async function VideosLibraryPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireAuthenticatedContext();
  const rawParams = await props.searchParams;

  const platform = typeof rawParams.platform === 'string' ? rawParams.platform : 'all';
  const syncStatus = typeof rawParams.syncStatus === 'string' ? rawParams.syncStatus : 'all';
  const search = typeof rawParams.search === 'string' ? rawParams.search : '';
  const sortBy = typeof rawParams.sortBy === 'string' ? rawParams.sortBy : 'published_at';
  const sortOrder = typeof rawParams.sortOrder === 'string' ? rawParams.sortOrder : 'desc';
  const page = typeof rawParams.page === 'string' ? rawParams.page : '1';

  const result = await queryVideosLibrary(ctx.userId, {
    platform,
    syncStatus,
    search,
    sortBy,
    sortOrder,
    page,
    pageSize: 20,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Biblioteca Centralizada de Videos
        </h1>
        <p className="text-xs text-slateBlue-muted">
          Explora, filtra y ordena todas las publicaciones recuperadas desde YouTube, TikTok, Instagram y Facebook.
        </p>
      </div>

      <React.Suspense fallback={<div className="h-96 rounded-xl bg-slateBlue animate-pulse" />}>
        <VideosTable
          items={result.items}
          totalCount={result.totalCount}
          page={result.page}
          pageSize={result.pageSize}
          totalPages={result.totalPages}
          currentFilters={{
            platform,
            syncStatus,
            search,
            sortBy,
            sortOrder,
          }}
        />
      </React.Suspense>
    </div>
  );
}
