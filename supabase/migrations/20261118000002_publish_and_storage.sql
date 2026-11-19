-- ==============================================================================
-- MIGRACIÓN 2: PUBLICACIÓN Y PROGRAMACIÓN DE VIDEOS + SUPABASE STORAGE PRIVADO
-- ==============================================================================

begin;

-- 1. Bucket privado en Supabase Storage (límite 50 MB por archivo, plan Free compatible)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'video-uploads',
  'video-uploads',
  false,
  52428800,
  array['video/mp4', 'video/quicktime', 'video/webm']
)
on conflict (id) do update
set public = false,
    file_size_limit = 52428800,
    allowed_mime_types = array['video/mp4', 'video/quicktime', 'video/webm'];

-- Políticas RLS de Storage: cada usuario accede únicamente a su carpeta <user_id>/*
drop policy if exists "video_uploads_select_own" on storage.objects;
create policy "video_uploads_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'video-uploads'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "video_uploads_insert_own" on storage.objects;
create policy "video_uploads_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'video-uploads'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "video_uploads_update_own" on storage.objects;
create policy "video_uploads_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'video-uploads'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'video-uploads'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "video_uploads_delete_own" on storage.objects;
create policy "video_uploads_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'video-uploads'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- 2. Tabla normalizada public.publish_jobs
create table if not exists public.publish_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  social_account_id uuid not null references public.social_accounts(id) on delete cascade,
  platform text not null check (platform in ('youtube', 'tiktok', 'instagram', 'facebook')),
  title text not null check (char_length(title) between 1 and 150),
  description text,
  privacy_status text not null default 'private' check (
    privacy_status in ('public', 'unlisted', 'private')
  ),
  storage_path text,
  file_name text not null,
  file_size_bytes bigint not null check (file_size_bytes > 0 and file_size_bytes <= 52428800),
  mime_type text not null default 'video/mp4',
  publish_mode text not null default 'immediate' check (
    publish_mode in ('immediate', 'scheduled_native', 'scheduled_queue')
  ),
  scheduled_at timestamptz,
  status text not null default 'pending' check (
    status in ('pending', 'uploading', 'scheduled', 'published', 'draft_inbox', 'failed', 'cancelled')
  ),
  external_post_id text,
  external_post_url text,
  error_message text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_publish_jobs_user_created
  on public.publish_jobs (user_id, created_at desc);

create index if not exists idx_publish_jobs_social_account_id
  on public.publish_jobs (social_account_id);

create index if not exists idx_publish_jobs_scheduled_due
  on public.publish_jobs (scheduled_at asc)
  where status = 'scheduled' and publish_mode = 'scheduled_queue';

drop trigger if exists trg_publish_jobs_updated_at on public.publish_jobs;
create trigger trg_publish_jobs_updated_at
  before update on public.publish_jobs
  for each row execute function private.set_updated_at();

-- 3. Privilegios mínimos y RLS forzado
revoke all on table public.publish_jobs from public, anon;
grant select, insert, update, delete on table public.publish_jobs to authenticated;

alter table public.publish_jobs enable row level security;
alter table public.publish_jobs force row level security;

drop policy if exists "publish_jobs_select_own" on public.publish_jobs;
create policy "publish_jobs_select_own"
  on public.publish_jobs for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "publish_jobs_insert_own" on public.publish_jobs;
create policy "publish_jobs_insert_own"
  on public.publish_jobs for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "publish_jobs_update_own" on public.publish_jobs;
create policy "publish_jobs_update_own"
  on public.publish_jobs for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "publish_jobs_delete_own" on public.publish_jobs;
create policy "publish_jobs_delete_own"
  on public.publish_jobs for delete
  to authenticated
  using ((select auth.uid()) = user_id);

commit;
