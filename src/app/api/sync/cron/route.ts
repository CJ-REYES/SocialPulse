import { type NextRequest, NextResponse } from 'next/server';
import { verifyCronSecretHeader } from '@/lib/security/csrf';
import { synchronizeAllActiveAccountsForCron } from '@/features/synchronization/sync.service';
import { normalizeError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';

export async function GET(request: NextRequest) {
  try {
    verifyCronSecretHeader(request.headers.get('authorization'));

    const summaries = await synchronizeAllActiveAccountsForCron();
    logger.info('cron_sync_executed', {
      accountsProcessed: summaries.length,
    });

    return NextResponse.json({
      ok: true,
      executedAt: new Date().toISOString(),
      accountsProcessed: summaries.length,
      summaries,
    });
  } catch (error) {
    const normalized = normalizeError(error);
    return NextResponse.json(
      { error: normalized.code, message: normalized.publicMessage },
      { status: normalized.statusCode }
    );
  }
}
