import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const migrationPath = path.resolve(
  __dirname,
  '../../supabase/migrations/20261118000001_initial_schema.sql'
);
const configPath = path.resolve(__dirname, '../../supabase/config.toml');

describe('Database & RLS Audit: Supabase Best Practices Compliance', () => {
  const sql = readFileSync(migrationPath, 'utf8');
  const configToml = readFileSync(configPath, 'utf8');

  const requiredTables = [
    'profiles',
    'social_accounts',
    'oauth_credentials',
    'platform_permissions',
    'videos',
    'video_metrics',
    'sync_jobs',
    'sync_logs',
  ];

  it('allows user signup while keeping anonymous sign-ins disabled in supabase/config.toml', () => {
    expect(configToml).toContain('enable_signup = true');
    expect(configToml).toContain('enable_anonymous_sign_ins = false');
  });

  it('defines all 8 normalized tables with ENABLE and FORCE ROW LEVEL SECURITY', () => {
    for (const table of requiredTables) {
      expect(sql).toContain(`create table public.${table}`);
      expect(sql).toContain(`alter table public.${table} enable row level security;`);
      expect(sql).toContain(`alter table public.${table} force row level security;`);
    }
  });

  it('strictly isolates oauth_credentials from public, anon, and authenticated roles', () => {
    expect(sql).toContain(
      'revoke all on table public.oauth_credentials from public, anon, authenticated;'
    );
    // Ensure no policy grants access on public.oauth_credentials
    expect(sql).not.toMatch(/create\s+policy\s+[^\n]+\s+on\s+public\.oauth_credentials/i);
  });

  it('uses optimized (select auth.uid()) subqueries and TO authenticated in RLS policies', () => {
    expect(sql).not.toContain('auth.role()');
    expect(sql).toContain('to authenticated');
    expect(sql).toContain('using ((select auth.uid()) = user_id)');
    expect(sql).toContain('with check ((select auth.uid()) = user_id)');
  });

  it('indexes all foreign keys to prevent sequential scans on JOINs and CASCADEs', () => {
    const expectedIndexes = [
      'idx_social_accounts_user_id',
      'idx_oauth_credentials_user_id',
      'idx_platform_permissions_social_account_id',
      'idx_platform_permissions_user_id',
      'idx_videos_social_account_id',
      'idx_videos_user_id',
      'idx_video_metrics_video_id_captured',
      'idx_video_metrics_social_account_id',
      'idx_sync_jobs_user_id_created',
      'idx_sync_jobs_social_account_id',
      'idx_sync_logs_sync_job_id',
      'idx_sync_logs_social_account_id',
    ];

    for (const indexName of expectedIndexes) {
      expect(sql).toContain(`create index ${indexName}`);
    }
  });

  it('preserves historical snapshots in video_metrics via unique (video_id, snapshot_hour)', () => {
    expect(sql).toContain(
      'constraint video_metrics_video_hour_unique unique (video_id, snapshot_hour)'
    );
  });
});
