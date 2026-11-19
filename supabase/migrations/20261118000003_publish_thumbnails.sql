-- ==============================================================================
-- MIGRACIÓN 3: SOPORTE DE MINIATURAS PERSONALIZADAS EN PUBLICACIONES
-- ==============================================================================

begin;

update storage.buckets
set allowed_mime_types = array[
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'image/jpeg',
  'image/png'
]
where id = 'video-uploads';

alter table public.publish_jobs
  add column if not exists thumbnail_storage_path text,
  add column if not exists thumbnail_mime_type text;

commit;
