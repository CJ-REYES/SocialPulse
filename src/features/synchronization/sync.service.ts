import { createAdminClient } from '@/lib/supabase/admin';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { decryptOAuthToken, encryptOAuthToken } from '@/lib/security/crypto';
import { AppError, normalizeError } from '@/lib/utils/errors';
import { logger, sanitizeLogPayload } from '@/lib/utils/logger';
import { getPlatformService } from '@/services/registry';
import type { ExternalVideoItem } from '@/services/types';
import type { Database } from '@/types/database';
import type {
  Platform,
  SyncJobRecord,
  SyncLogRecord,
  TriggerSource,
} from '@/types/domain';

type SocialAccountRow = Database['public']['Tables']['social_accounts']['Row'];
type OAuthCredentialRow = Database['public']['Tables']['oauth_credentials']['Row'];
type VideoRow = Database['public']['Tables']['videos']['Row'];
type VideoMetricRow = Database['public']['Tables']['video_metrics']['Row'];
type SyncJobRow = Database['public']['Tables']['sync_jobs']['Row'];
type SyncLogRow = Database['public']['Tables']['sync_logs']['Row'];

const STALE_JOB_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutos para recuperación ante interrupciones serverless
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // Renovar 5 minutos antes de expirar

const PLATFORM_COOLDOWN_SECONDS: Record<Platform, { manual: number; cron: number }> = {
  youtube: { manual: 120, cron: 3600 },
  tiktok: { manual: 180, cron: 3600 },
  instagram: { manual: 180, cron: 3600 },
  facebook: { manual: 180, cron: 3600 },
};

export interface AccountSyncSummary {
  socialAccountId: string;
  platform: Platform;
  accountName: string;
  jobId: string;
  status: 'completed' | 'partial_failure' | 'failed' | 'skipped_rate_limit';
  videosProcessed: number;
  metricsCaptured: number;
  warnings: string[];
  errorMessage?: string;
}

export function mapSyncJobRow(row: SyncJobRow): SyncJobRecord {
  return {
    id: row.id,
    userId: row.user_id,
    socialAccountId: row.social_account_id,
    platform: row.platform,
    triggerSource: row.trigger_source,
    status: row.status,
    idempotencyKey: row.idempotency_key,
    videosProcessed: row.videos_processed,
    metricsCaptured: row.metrics_captured,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    nextRetryAt: row.next_retry_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapSyncLogRow(row: SyncLogRow): SyncLogRecord {
  return {
    id: row.id,
    syncJobId: row.sync_job_id,
    userId: row.user_id,
    socialAccountId: row.social_account_id,
    platform: row.platform,
    level: row.level,
    eventType: row.event_type,
    message: row.message,
    details: (row.details as Record<string, unknown>) ?? {},
    createdAt: row.created_at,
  };
}

async function appendSyncLog(params: {
  syncJobId: string;
  userId: string;
  socialAccountId: string | null;
  platform: Platform | null;
  level: 'info' | 'warn' | 'error';
  eventType: string;
  message: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  const admin = createAdminClient();
  const safeDetails = (sanitizeLogPayload(params.details ?? {}) as Record<string, unknown>) ?? {};

  await admin.from('sync_logs').insert({
    sync_job_id: params.syncJobId,
    user_id: params.userId,
    social_account_id: params.socialAccountId,
    platform: params.platform,
    level: params.level,
    event_type: params.eventType,
    message: params.message,
    details: safeDetails,
  } as never);
}

/**
 * Sincroniza una cuenta social individual garantizando:
 * - Recuperación ante jobs huérfanos/interrumpidos (>10 min)
 * - Prevención de ejecuciones concurrentes duplicadas
 * - Control de frecuencia por plataforma
 * - Detección y renovación automática de tokens expirados
 * - Persistencia de snapshots históricos sin sobrescribir horas/días previos
 */
export async function synchronizeSocialAccount(params: {
  socialAccountId: string;
  userId: string;
  triggerSource: TriggerSource;
  forceBypassCooldown?: boolean;
}): Promise<AccountSyncSummary> {
  if (!isSupabaseConfigured()) {
    throw new AppError({
      code: 'INTERNAL_ERROR',
      message: 'Supabase no está configurado para ejecutar la sincronización.',
    });
  }

  const admin = createAdminClient();
  const { socialAccountId, userId, triggerSource, forceBypassCooldown = false } = params;

  const { data: rawAccount, error: accErr } = await admin
    .from('social_accounts')
    .select('*')
    .eq('id', socialAccountId)
    .eq('user_id', userId)
    .maybeSingle();

  if (accErr || !rawAccount) {
    throw new AppError({
      code: 'NOT_FOUND',
      message: 'No se encontró la cuenta social solicitada para sincronizar.',
    });
  }

  const account = rawAccount as SocialAccountRow;
  const now = new Date();

  // 1. Recuperar jobs interrumpidos por timeout serverless (> 10 min en estado 'running')
  const staleCutoffIso = new Date(now.getTime() - STALE_JOB_TIMEOUT_MS).toISOString();
  await admin
    .from('sync_jobs')
    .update({
      status: 'failed',
      completed_at: now.toISOString(),
      error_code: 'INTERRUPTED_RECOVERY',
      error_message:
        'Job recuperado automáticamente tras detectar una interrupción previa del entorno serverless.',
    } as never)
    .eq('social_account_id', account.id)
    .eq('status', 'running')
    .lt('started_at', staleCutoffIso);

  // 2. Prevenir ejecuciones duplicadas en curso
  const { data: activeRunningJob } = await admin
    .from('sync_jobs')
    .select('id')
    .eq('social_account_id', account.id)
    .eq('status', 'running')
    .maybeSingle();

  if (activeRunningJob) {
    throw new AppError({
      code: 'SYNC_IN_PROGRESS',
      message: `Ya existe una sincronización en curso para ${account.account_name} (${account.platform}).`,
    });
  }

  // 3. Control de frecuencia por plataforma
  if (
    !forceBypassCooldown &&
    account.next_allowed_sync_at &&
    new Date(account.next_allowed_sync_at) > now
  ) {
    const waitSeconds = Math.ceil(
      (new Date(account.next_allowed_sync_at).getTime() - now.getTime()) / 1000
    );
    const skippedKey = `skip:${account.id}:${now.toISOString().slice(0, 16)}`;
    const { data: rawSkippedJob } = await admin
      .from('sync_jobs')
      .upsert(
        {
          user_id: userId,
          social_account_id: account.id,
          platform: account.platform,
          trigger_source: triggerSource,
          status: 'skipped_rate_limit',
          idempotency_key: skippedKey,
          started_at: now.toISOString(),
          completed_at: now.toISOString(),
          error_code: 'COOLDOWN_ACTIVE',
          error_message: `Frecuencia controlada: próxima ventana permitida en ${waitSeconds}s.`,
        } as never,
        { onConflict: 'idempotency_key' }
      )
      .select('*')
      .single();

    const skippedJob = rawSkippedJob as SyncJobRow | null;
    return {
      socialAccountId: account.id,
      platform: account.platform,
      accountName: account.account_name,
      jobId: skippedJob?.id ?? 'skipped',
      status: 'skipped_rate_limit',
      videosProcessed: 0,
      metricsCaptured: 0,
      warnings: [`Frecuencia controlada por plataforma: espera ${waitSeconds} segundos.`],
    };
  }

  // 4. Crear o reutilizar registro de SyncJob idempotente
  const timeBucket =
    triggerSource === 'cron'
      ? now.toISOString().slice(0, 13) // Idempotencia horaria para cron
      : now.toISOString().slice(0, 16); // Idempotencia por minuto para manual

  const idempotencyKey = `sync:${account.id}:${triggerSource}:${timeBucket}`;

  const { data: rawJob, error: jobErr } = await admin
    .from('sync_jobs')
    .upsert(
      {
        user_id: userId,
        social_account_id: account.id,
        platform: account.platform,
        trigger_source: triggerSource,
        status: 'running',
        idempotency_key: idempotencyKey,
        started_at: now.toISOString(),
        completed_at: null,
        error_code: null,
        error_message: null,
      } as never,
      { onConflict: 'idempotency_key' }
    )
    .select('*')
    .single();

  if (jobErr || !rawJob) {
    throw new AppError({
      code: 'DATABASE_ERROR',
      message: `No fue posible registrar el trabajo de sincronización: ${jobErr?.message ?? 'Error desconocido'}`,
    });
  }

  const job = rawJob as SyncJobRow;

  await appendSyncLog({
    syncJobId: job.id,
    userId,
    socialAccountId: account.id,
    platform: account.platform,
    level: 'info',
    eventType: 'SYNC_STARTED',
    message: `Iniciando sincronización (${triggerSource}) para ${account.account_name}.`,
  });

  try {
    // 5. Obtener y validar credenciales OAuth cifradas
    const { data: rawCred, error: credErr } = await admin
      .from('oauth_credentials')
      .select('*')
      .eq('social_account_id', account.id)
      .eq('user_id', userId)
      .maybeSingle();

    const cred = rawCred as OAuthCredentialRow | null;
    if (credErr || !cred || cred.revoked_at) {
      throw new AppError({
        code: 'OAUTH_TOKEN_EXPIRED',
        message: 'La cuenta no posee credenciales OAuth activas. Reconecta la cuenta.',
      });
    }

    let activeAccessToken = decryptOAuthToken(cred.access_token_encrypted);
    const service = getPlatformService(account.platform);

    const isExpiringSoon =
      cred.expires_at &&
      new Date(cred.expires_at).getTime() - now.getTime() <= TOKEN_REFRESH_BUFFER_MS;

    if (isExpiringSoon) {
      activeAccessToken = await refreshAndPersistAccountToken({
        account,
        cred,
        syncJobId: job.id,
      });
    }

    // 6. Consultar datos de la plataforma oficial (con reintento automático si el token expiró prematuramente)
    let syncPayload;
    try {
      syncPayload = await service.fetchAccountAndVideos(activeAccessToken);
    } catch (apiError) {
      if (apiError instanceof AppError && apiError.code === 'OAUTH_TOKEN_EXPIRED') {
        activeAccessToken = await refreshAndPersistAccountToken({
          account,
          cred,
          syncJobId: job.id,
        });
        syncPayload = await service.fetchAccountAndVideos(activeAccessToken);
      } else {
        throw apiError;
      }
    }

    // 7. Persistir videos y snapshots históricos en `video_metrics`
    const snapshotHourDate = new Date(now);
    snapshotHourDate.setMinutes(0, 0, 0);
    const snapshotHourIso = snapshotHourDate.toISOString();
    const snapshotDateIso = now.toISOString().slice(0, 10);

    let videosProcessed = 0;
    let metricsCaptured = 0;

    for (const item of syncPayload.videos) {
      const persistedVideo = await upsertVideoAndCaptureSnapshot({
        userId,
        account,
        item,
        followersCountSnapshot: syncPayload.account.followersCount,
        snapshotDateIso,
        snapshotHourIso,
        capturedAtIso: now.toISOString(),
      });
      if (persistedVideo) {
        videosProcessed += 1;
        metricsCaptured += 1;
      }
    }

    // 8. Actualizar cuenta social y ventana de cooldown
    const cooldownSeconds =
      PLATFORM_COOLDOWN_SECONDS[account.platform][
        triggerSource === 'cron' ? 'cron' : 'manual'
      ];
    const nextAllowedSyncAt = new Date(now.getTime() + cooldownSeconds * 1000).toISOString();

    await admin
      .from('social_accounts')
      .update({
        account_name: syncPayload.account.accountName,
        account_handle: syncPayload.account.accountHandle,
        account_avatar_url: syncPayload.account.accountAvatarUrl,
        followers_count: syncPayload.account.followersCount,
        following_count: syncPayload.account.followingCount,
        posts_count: Math.max(syncPayload.account.postsCount, videosProcessed),
        connection_status: 'connected',
        last_error_code: null,
        last_error_message: null,
        last_synced_at: now.toISOString(),
        next_allowed_sync_at: nextAllowedSyncAt,
        metadata: syncPayload.account.metadata,
      } as never)
      .eq('id', account.id);

    for (const warning of syncPayload.warnings) {
      await appendSyncLog({
        syncJobId: job.id,
        userId,
        socialAccountId: account.id,
        platform: account.platform,
        level: 'warn',
        eventType: 'PLATFORM_METRIC_NOTICE',
        message: warning,
      });
    }

    const finalStatus = syncPayload.warnings.length > 0 ? 'partial_failure' : 'completed';

    await admin
      .from('sync_jobs')
      .update({
        status: finalStatus,
        videos_processed: videosProcessed,
        metrics_captured: metricsCaptured,
        completed_at: new Date().toISOString(),
      } as never)
      .eq('id', job.id);

    await appendSyncLog({
      syncJobId: job.id,
      userId,
      socialAccountId: account.id,
      platform: account.platform,
      level: 'info',
      eventType: 'SYNC_COMPLETED',
      message: `Sincronización completada: ${videosProcessed} videos procesados y ${metricsCaptured} snapshots registrados.`,
      details: { videosProcessed, metricsCaptured },
    });

    return {
      socialAccountId: account.id,
      platform: account.platform,
      accountName: account.account_name,
      jobId: job.id,
      status: finalStatus,
      videosProcessed,
      metricsCaptured,
      warnings: syncPayload.warnings,
    };
  } catch (error) {
    const normalized = normalizeError(error);
    const isTokenExpired = normalized.code === 'OAUTH_TOKEN_EXPIRED';
    const isPermissionError = normalized.code === 'OAUTH_PERMISSION_DENIED';

    await admin
      .from('social_accounts')
      .update({
        connection_status: isTokenExpired
          ? 'expired'
          : isPermissionError
            ? 'pending_review'
            : 'error',
        last_error_code: normalized.code,
        last_error_message: normalized.message,
      } as never)
      .eq('id', account.id);

    await admin
      .from('sync_jobs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_code: normalized.code,
        error_message: normalized.message,
      } as never)
      .eq('id', job.id);

    await appendSyncLog({
      syncJobId: job.id,
      userId,
      socialAccountId: account.id,
      platform: account.platform,
      level: 'error',
      eventType: 'SYNC_FAILED',
      message: normalized.message,
      details: { errorCode: normalized.code },
    });

    logger.error('social_account_sync_failed', {
      socialAccountId: account.id,
      platform: account.platform,
      errorCode: normalized.code,
      message: normalized.message,
    });

    return {
      socialAccountId: account.id,
      platform: account.platform,
      accountName: account.account_name,
      jobId: job.id,
      status: 'failed',
      videosProcessed: 0,
      metricsCaptured: 0,
      warnings: [],
      errorMessage: normalized.message,
    };
  }
}

async function refreshAndPersistAccountToken(params: {
  account: SocialAccountRow;
  cred: OAuthCredentialRow;
  syncJobId: string;
}): Promise<string> {
  const { account, cred, syncJobId } = params;
  const admin = createAdminClient();
  const service = getPlatformService(account.platform);

  const tokenToRefresh = cred.refresh_token_encrypted
    ? decryptOAuthToken(cred.refresh_token_encrypted)
    : decryptOAuthToken(cred.access_token_encrypted);

  const refreshed = await service.refreshAccessToken(tokenToRefresh);
  const newEncryptedAccess = encryptOAuthToken(refreshed.accessToken);
  const newEncryptedRefresh = refreshed.refreshToken
    ? encryptOAuthToken(refreshed.refreshToken)
    : cred.refresh_token_encrypted;

  await admin
    .from('oauth_credentials')
    .update({
      access_token_encrypted: newEncryptedAccess,
      refresh_token_encrypted: newEncryptedRefresh,
      expires_at: refreshed.expiresAt,
      refresh_token_expires_at: refreshed.refreshTokenExpiresAt,
      last_refreshed_at: new Date().toISOString(),
    } as never)
    .eq('id', cred.id);

  await appendSyncLog({
    syncJobId,
    userId: account.user_id,
    socialAccountId: account.id,
    platform: account.platform,
    level: 'info',
    eventType: 'OAUTH_TOKEN_REFRESHED',
    message: `Token OAuth renovado automáticamente para ${account.account_name}.`,
  });

  return refreshed.accessToken;
}

async function upsertVideoAndCaptureSnapshot(params: {
  userId: string;
  account: SocialAccountRow;
  item: ExternalVideoItem;
  followersCountSnapshot: number;
  snapshotDateIso: string;
  snapshotHourIso: string;
  capturedAtIso: string;
}): Promise<VideoRow | null> {
  const admin = createAdminClient();
  const {
    userId,
    account,
    item,
    followersCountSnapshot,
    snapshotDateIso,
    snapshotHourIso,
    capturedAtIso,
  } = params;

  const { data: rawVideo, error: videoErr } = await admin
    .from('videos')
    .upsert(
      {
        social_account_id: account.id,
        user_id: userId,
        platform: account.platform,
        external_video_id: item.externalVideoId,
        title: item.title,
        description: item.description,
        thumbnail_url: item.thumbnailUrl,
        permalink: item.permalink,
        duration_seconds: item.durationSeconds,
        published_at: item.publishedAt,
        content_type: item.contentType,
        sync_status: item.unavailableMetrics.length > 0 ? 'partial' : 'synced',
        views_count: item.viewsCount,
        likes_count: item.likesCount,
        comments_count: item.commentsCount,
        shares_count: item.sharesCount,
        reach_count: item.reachCount,
        impressions_count: item.impressionsCount,
        watch_time_minutes: item.watchTimeMinutes,
        avg_view_duration_seconds: item.avgViewDurationSeconds,
        unavailable_metrics: item.unavailableMetrics,
        raw_metadata: item.rawMetadata,
        last_synced_at: capturedAtIso,
      } as never,
      { onConflict: 'social_account_id,external_video_id' }
    )
    .select('*')
    .single();

  if (videoErr || !rawVideo) {
    logger.warn('video_upsert_failed', {
      socialAccountId: account.id,
      externalVideoId: item.externalVideoId,
      reason: videoErr?.message ?? 'Unknown error',
    });
    return null;
  }

  const videoRow = rawVideo as VideoRow;

  // Consultar el snapshot inmediatamente anterior (anterior al bucket horario actual) para calcular deltas reales
  const { data: rawPrevMetric } = await admin
    .from('video_metrics')
    .select('*')
    .eq('video_id', videoRow.id)
    .lt('snapshot_hour', snapshotHourIso)
    .order('snapshot_hour', { ascending: false })
    .limit(1)
    .maybeSingle();

  const prevMetric = rawPrevMetric as VideoMetricRow | null;

  const viewsDelta = prevMetric
    ? Math.max(0, item.viewsCount - Number(prevMetric.views_count ?? 0))
    : 0;
  const likesDelta = prevMetric
    ? Math.max(0, item.likesCount - Number(prevMetric.likes_count ?? 0))
    : 0;
  const commentsDelta = prevMetric
    ? Math.max(0, item.commentsCount - Number(prevMetric.comments_count ?? 0))
    : 0;
  const sharesDelta =
    item.sharesCount !== null && prevMetric && prevMetric.shares_count !== null
      ? Math.max(0, item.sharesCount - Number(prevMetric.shares_count))
      : null;

  await admin.from('video_metrics').upsert(
    {
      video_id: videoRow.id,
      social_account_id: account.id,
      user_id: userId,
      platform: account.platform,
      snapshot_date: snapshotDateIso,
      snapshot_hour: snapshotHourIso,
      captured_at: capturedAtIso,
      views_count: item.viewsCount,
      likes_count: item.likesCount,
      comments_count: item.commentsCount,
      shares_count: item.sharesCount,
      reach_count: item.reachCount,
      impressions_count: item.impressionsCount,
      followers_count_snapshot: followersCountSnapshot,
      watch_time_minutes: item.watchTimeMinutes,
      avg_view_duration_seconds: item.avgViewDurationSeconds,
      views_delta: viewsDelta,
      likes_delta: likesDelta,
      comments_delta: commentsDelta,
      shares_delta: sharesDelta,
    } as never,
    { onConflict: 'video_id,snapshot_hour' }
  );

  return videoRow;
}

export async function synchronizeAllUserAccounts(params: {
  userId: string;
  platform?: Platform;
  triggerSource: TriggerSource;
}): Promise<AccountSyncSummary[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  const admin = createAdminClient();
  let query = admin
    .from('social_accounts')
    .select('*')
    .eq('user_id', params.userId)
    .neq('connection_status', 'revoked');

  if (params.platform) {
    query = query.eq('platform', params.platform);
  }

  const { data: rawAccounts, error } = await query;
  if (error || !rawAccounts) {
    return [];
  }

  const accounts = rawAccounts as SocialAccountRow[];
  const summaries: AccountSyncSummary[] = [];

  for (const account of accounts) {
    const summary = await synchronizeSocialAccount({
      socialAccountId: account.id,
      userId: params.userId,
      triggerSource: params.triggerSource,
    });
    summaries.push(summary);
  }

  return summaries;
}

export async function synchronizeAllActiveAccountsForCron(): Promise<AccountSyncSummary[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  const admin = createAdminClient();
  const { data: rawAccounts, error } = await admin
    .from('social_accounts')
    .select('*')
    .in('connection_status', ['connected', 'expired']);

  if (error || !rawAccounts) {
    return [];
  }

  const accounts = rawAccounts as SocialAccountRow[];
  const summaries: AccountSyncSummary[] = [];

  for (const account of accounts) {
    const summary = await synchronizeSocialAccount({
      socialAccountId: account.id,
      userId: account.user_id,
      triggerSource: 'cron',
    });
    summaries.push(summary);
  }

  return summaries;
}
