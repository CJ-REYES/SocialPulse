-- ==============================================================================
-- MIGRACIÓN INICIAL: SOCIAL ANALYTICS DASHBOARD
-- Esquema PostgreSQL Normalizado, Índices de Claves Foráneas y Políticas RLS
-- ==============================================================================

begin;

-- Extensiones requeridas
create extension if not exists pgcrypto with schema extensions;

-- Esquema privado para funciones internas de sistema
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Función utilitaria para actualizar updated_at automáticamente
create or replace function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ==============================================================================
-- 1. TABLA: profiles
-- ==============================================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  avatar_url text,
  role text not null default 'owner' check (role in ('owner', 'admin', 'viewer')),
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_email_length check (char_length(email) >= 5)
);

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

-- Trigger automático al crear un usuario por invitación o administración en auth.users
create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url, role)
  values (
    new.id,
    coalesce(new.email, 'owner@private.local'),
    coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email, 'Owner'), '@', 1)),
    new.raw_user_meta_data->>'avatar_url',
    'owner'
  )
  on conflict (id) do update
  set email = excluded.email,
      updated_at = now();
  return new;
end;
$$;

revoke execute on function private.handle_new_auth_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_auth_user();

-- ==============================================================================
-- 2. TABLA: social_accounts
-- ==============================================================================
create table public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null check (platform in ('youtube', 'tiktok', 'instagram', 'facebook')),
  external_account_id text not null,
  account_name text not null,
  account_handle text,
  account_avatar_url text,
  followers_count bigint not null default 0 check (followers_count >= 0),
  following_count bigint default 0 check (following_count is null or following_count >= 0),
  posts_count integer not null default 0 check (posts_count >= 0),
  connection_status text not null default 'connected' check (
    connection_status in ('connected', 'expired', 'revoked', 'error', 'pending_review')
  ),
  last_error_code text,
  last_error_message text,
  last_synced_at timestamptz,
  next_allowed_sync_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_accounts_user_platform_external_unique unique (user_id, platform, external_account_id)
);

create index idx_social_accounts_user_id on public.social_accounts (user_id);
create index idx_social_accounts_user_platform on public.social_accounts (user_id, platform);
create index idx_social_accounts_connection_status on public.social_accounts (connection_status);

create trigger trg_social_accounts_updated_at
  before update on public.social_accounts
  for each row execute function private.set_updated_at();

-- ==============================================================================
-- 3. TABLA: oauth_credentials (ESTRICTAMENTE ACCESIBLE SOLO DESDE BACKEND)
-- ==============================================================================
create table public.oauth_credentials (
  id uuid primary key default gen_random_uuid(),
  social_account_id uuid not null unique references public.social_accounts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null check (platform in ('youtube', 'tiktok', 'instagram', 'facebook')),
  access_token_encrypted text not null,
  refresh_token_encrypted text,
  token_type text not null default 'Bearer',
  expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  encryption_key_version smallint not null default 1 check (encryption_key_version >= 1),
  last_refreshed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_oauth_credentials_user_id on public.oauth_credentials (user_id);
create index idx_oauth_credentials_expires_at on public.oauth_credentials (expires_at) where revoked_at is null;

create trigger trg_oauth_credentials_updated_at
  before update on public.oauth_credentials
  for each row execute function private.set_updated_at();

-- ==============================================================================
-- 4. TABLA: platform_permissions
-- ==============================================================================
create table public.platform_permissions (
  id uuid primary key default gen_random_uuid(),
  social_account_id uuid not null references public.social_accounts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null check (platform in ('youtube', 'tiktok', 'instagram', 'facebook')),
  scope text not null,
  status text not null default 'granted' check (
    status in ('granted', 'denied', 'expired', 'pending_app_review')
  ),
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_permissions_account_scope_unique unique (social_account_id, scope)
);

create index idx_platform_permissions_social_account_id on public.platform_permissions (social_account_id);
create index idx_platform_permissions_user_id on public.platform_permissions (user_id);

create trigger trg_platform_permissions_updated_at
  before update on public.platform_permissions
  for each row execute function private.set_updated_at();

-- ==============================================================================
-- 5. TABLA: videos
-- ==============================================================================
create table public.videos (
  id uuid primary key default gen_random_uuid(),
  social_account_id uuid not null references public.social_accounts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null check (platform in ('youtube', 'tiktok', 'instagram', 'facebook')),
  external_video_id text not null,
  title text not null,
  description text,
  thumbnail_url text,
  permalink text not null,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  published_at timestamptz not null,
  content_type text not null default 'video' check (content_type in ('video', 'short', 'reel', 'live')),
  sync_status text not null default 'synced' check (sync_status in ('synced', 'pending', 'partial', 'error')),
  views_count bigint not null default 0 check (views_count >= 0),
  likes_count bigint not null default 0 check (likes_count >= 0),
  comments_count bigint not null default 0 check (comments_count >= 0),
  shares_count bigint check (shares_count is null or shares_count >= 0),
  reach_count bigint check (reach_count is null or reach_count >= 0),
  impressions_count bigint check (impressions_count is null or impressions_count >= 0),
  watch_time_minutes numeric(14, 2) check (watch_time_minutes is null or watch_time_minutes >= 0),
  avg_view_duration_seconds numeric(10, 2) check (avg_view_duration_seconds is null or avg_view_duration_seconds >= 0),
  unavailable_metrics text[] not null default '{}',
  raw_metadata jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint videos_account_external_unique unique (social_account_id, external_video_id)
);

create index idx_videos_social_account_id on public.videos (social_account_id);
create index idx_videos_user_id on public.videos (user_id);
create index idx_videos_user_platform_published on public.videos (user_id, platform, published_at desc);
create index idx_videos_user_views_desc on public.videos (user_id, views_count desc);
create index idx_videos_user_published_desc on public.videos (user_id, published_at desc);

create trigger trg_videos_updated_at
  before update on public.videos
  for each row execute function private.set_updated_at();

-- ==============================================================================
-- 6. TABLA: video_metrics (SNAPSHOTS HISTÓRICOS INMUTABLES POR BUCKET HORARIO/DIARIO)
-- ==============================================================================
create table public.video_metrics (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  social_account_id uuid not null references public.social_accounts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null check (platform in ('youtube', 'tiktok', 'instagram', 'facebook')),
  snapshot_date date not null default current_date,
  snapshot_hour timestamptz not null default date_trunc('hour', now()),
  captured_at timestamptz not null default now(),
  views_count bigint not null default 0 check (views_count >= 0),
  likes_count bigint not null default 0 check (likes_count >= 0),
  comments_count bigint not null default 0 check (comments_count >= 0),
  shares_count bigint check (shares_count is null or shares_count >= 0),
  reach_count bigint check (reach_count is null or reach_count >= 0),
  impressions_count bigint check (impressions_count is null or impressions_count >= 0),
  followers_count_snapshot bigint check (followers_count_snapshot is null or followers_count_snapshot >= 0),
  watch_time_minutes numeric(14, 2) check (watch_time_minutes is null or watch_time_minutes >= 0),
  avg_view_duration_seconds numeric(10, 2) check (avg_view_duration_seconds is null or avg_view_duration_seconds >= 0),
  views_delta bigint not null default 0,
  likes_delta bigint not null default 0,
  comments_delta bigint not null default 0,
  shares_delta bigint,
  created_at timestamptz not null default now(),
  constraint video_metrics_video_hour_unique unique (video_id, snapshot_hour)
);

create index idx_video_metrics_video_id_captured on public.video_metrics (video_id, captured_at desc);
create index idx_video_metrics_social_account_id on public.video_metrics (social_account_id);
create index idx_video_metrics_user_platform_date on public.video_metrics (user_id, platform, snapshot_date desc);
create index idx_video_metrics_user_captured on public.video_metrics (user_id, captured_at desc);

-- ==============================================================================
-- 7. TABLA: sync_jobs
-- ==============================================================================
create table public.sync_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  social_account_id uuid references public.social_accounts(id) on delete set null,
  platform text check (platform is null or platform in ('youtube', 'tiktok', 'instagram', 'facebook')),
  trigger_source text not null check (trigger_source in ('manual', 'cron', 'oauth_callback', 'retry')),
  status text not null default 'pending' check (
    status in ('pending', 'running', 'completed', 'partial_failure', 'failed', 'skipped_rate_limit')
  ),
  idempotency_key text not null unique,
  videos_processed integer not null default 0 check (videos_processed >= 0),
  metrics_captured integer not null default 0 check (metrics_captured >= 0),
  attempt_count smallint not null default 1 check (attempt_count >= 1),
  max_attempts smallint not null default 3 check (max_attempts >= 1),
  next_retry_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_sync_jobs_user_id_created on public.sync_jobs (user_id, created_at desc);
create index idx_sync_jobs_social_account_id on public.sync_jobs (social_account_id);
create index idx_sync_jobs_status on public.sync_jobs (status) where status in ('pending', 'running');

create trigger trg_sync_jobs_updated_at
  before update on public.sync_jobs
  for each row execute function private.set_updated_at();

-- ==============================================================================
-- 8. TABLA: sync_logs
-- ==============================================================================
create table public.sync_logs (
  id uuid primary key default gen_random_uuid(),
  sync_job_id uuid not null references public.sync_jobs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  social_account_id uuid references public.social_accounts(id) on delete set null,
  platform text check (platform is null or platform in ('youtube', 'tiktok', 'instagram', 'facebook')),
  level text not null check (level in ('info', 'warn', 'error')),
  event_type text not null,
  message text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_sync_logs_sync_job_id on public.sync_logs (sync_job_id, created_at asc);
create index idx_sync_logs_user_id_created on public.sync_logs (user_id, created_at desc);
create index idx_sync_logs_social_account_id on public.sync_logs (social_account_id);

-- ==============================================================================
-- 9. PRIVILEGIOS Y SEGURIDAD DE MÍNIMO PRIVILEGIO
-- ==============================================================================
-- Revocar permisos por defecto a roles anónimos y públicos
revoke all on all tables in schema public from public, anon;
revoke all on all sequences in schema public from public, anon;

-- oauth_credentials NUNCA debe ser accesible por anon ni authenticated (solo backend service_role)
revoke all on table public.oauth_credentials from public, anon, authenticated;

-- Otorgar permisos mínimos necesarios al rol authenticated (sujetos siempre a RLS)
grant usage on schema public to authenticated;
grant select, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.social_accounts to authenticated;
grant select, insert, update, delete on table public.platform_permissions to authenticated;
grant select, insert, update, delete on table public.videos to authenticated;
grant select, insert on table public.video_metrics to authenticated;
grant select, insert, update on table public.sync_jobs to authenticated;
grant select, insert on table public.sync_logs to authenticated;

-- ==============================================================================
-- 10. ROW LEVEL SECURITY (RLS) - HABILITACIÓN Y POLÍTICAS OPTIMIZADAS
-- ==============================================================================
alter table public.profiles enable row level security;
alter table public.profiles force row level security;

alter table public.social_accounts enable row level security;
alter table public.social_accounts force row level security;

alter table public.oauth_credentials enable row level security;
alter table public.oauth_credentials force row level security;

alter table public.platform_permissions enable row level security;
alter table public.platform_permissions force row level security;

alter table public.videos enable row level security;
alter table public.videos force row level security;

alter table public.video_metrics enable row level security;
alter table public.video_metrics force row level security;

alter table public.sync_jobs enable row level security;
alter table public.sync_jobs force row level security;

alter table public.sync_logs enable row level security;
alter table public.sync_logs force row level security;

-- Políticas para profiles (usando (select auth.uid()) para caching de plan)
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Políticas para social_accounts
create policy "social_accounts_select_own"
  on public.social_accounts for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "social_accounts_insert_own"
  on public.social_accounts for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "social_accounts_update_own"
  on public.social_accounts for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "social_accounts_delete_own"
  on public.social_accounts for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- NOTA: oauth_credentials no tiene políticas para 'anon' ni 'authenticated'.
-- Cualquier consulta desde el cliente devuelve 0 filas / permiso denegado.
-- Solo el backend con service_role puede acceder a oauth_credentials.

-- Políticas para platform_permissions
create policy "platform_permissions_select_own"
  on public.platform_permissions for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "platform_permissions_insert_own"
  on public.platform_permissions for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "platform_permissions_update_own"
  on public.platform_permissions for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "platform_permissions_delete_own"
  on public.platform_permissions for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- Políticas para videos
create policy "videos_select_own"
  on public.videos for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "videos_insert_own"
  on public.videos for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "videos_update_own"
  on public.videos for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "videos_delete_own"
  on public.videos for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- Políticas para video_metrics (snapshots históricos: solo lectura e inserción para el propietario)
create policy "video_metrics_select_own"
  on public.video_metrics for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "video_metrics_insert_own"
  on public.video_metrics for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- Políticas para sync_jobs
create policy "sync_jobs_select_own"
  on public.sync_jobs for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "sync_jobs_insert_own"
  on public.sync_jobs for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "sync_jobs_update_own"
  on public.sync_jobs for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Políticas para sync_logs
create policy "sync_logs_select_own"
  on public.sync_logs for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "sync_logs_insert_own"
  on public.sync_logs for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

commit;
