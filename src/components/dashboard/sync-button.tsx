'use client';

import * as React from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { triggerManualSyncAction } from '@/features/synchronization/actions';
import type { Platform } from '@/types/domain';

export interface SyncButtonProps {
  socialAccountId?: string;
  platform?: Platform;
  label?: string;
  variant?: 'default' | 'secondary' | 'outline';
  size?: 'default' | 'sm';
}

export function SyncButton({
  socialAccountId,
  platform,
  label = 'Sincronizar Ahora',
  variant = 'default',
  size = 'default',
}: SyncButtonProps) {
  const [isPending, startTransition] = React.useTransition();
  const [feedback, setFeedback] = React.useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const handleSync = () => {
    setFeedback(null);
    startTransition(async () => {
      const result = await triggerManualSyncAction({
        socialAccountId,
        platform,
      });
      setFeedback({
        ok: result.ok,
        message: result.message,
      });
    });
  };

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button
        type="button"
        variant={variant}
        size={size}
        disabled={isPending}
        onClick={handleSync}
      >
        <RefreshCw className={`h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
        <span>{isPending ? 'Sincronizando...' : label}</span>
      </Button>

      {feedback ? (
        <p
          role="status"
          className={`text-xs font-medium ${
            feedback.ok ? 'text-electricTeal' : 'text-rose-400'
          }`}
        >
          {feedback.message}
        </p>
      ) : null}
    </div>
  );
}
