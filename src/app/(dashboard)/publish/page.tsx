import * as React from 'react';
import { requireAuthenticatedContext } from '@/features/auth/session';
import { listUserConnections } from '@/features/connections/connections.service';
import { listUserPublishJobs } from '@/features/publishing/publish.service';
import { getAllPlatformConfigStatuses } from '@/services/registry';
import { PublishStudio } from '@/components/publish/publish-studio';

export default async function PublishPage() {
  const ctx = await requireAuthenticatedContext();
  const [connections, publishJobs] = await Promise.all([
    listUserConnections(ctx.userId),
    listUserPublishJobs(ctx.userId),
  ]);

  const platformConfigs = getAllPlatformConfigStatuses();

  const publishableAccounts = connections
    .filter((c) => c.account.connectionStatus === 'connected')
    .map((c) => {
      const cfg = platformConfigs[c.account.platform];
      const hasPublishScope = c.permissions.some(
        (p) => p.scope === cfg.publishScope && p.status === 'granted'
      );
      return {
        account: c.account,
        hasPublishScope,
        supportsNativeScheduling: cfg.supportsNativeScheduling,
      };
    });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Publicar y Programar Videos
        </h1>
        <p className="text-xs text-slateBlue-muted">
          Sube tus videos una sola vez y publícalos o prográmalos directamente en tus cuentas conectadas.
        </p>
      </div>

      <PublishStudio accounts={publishableAccounts} initialJobs={publishJobs} />
    </div>
  );
}
