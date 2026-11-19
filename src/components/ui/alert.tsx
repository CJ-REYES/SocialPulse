import * as React from 'react';
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export interface AlertBannerProps {
  variant?: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export function AlertBanner({
  variant = 'info',
  title,
  children,
  className,
}: AlertBannerProps) {
  const styles = {
    info: 'bg-slateBlue border-electricTeal/40 text-slate-200',
    success: 'bg-emerald-950/50 border-emerald-500/40 text-emerald-200',
    warning: 'bg-amber-950/50 border-amber-500/40 text-amber-200',
    error: 'bg-rose-950/50 border-rose-500/40 text-rose-200',
  };

  const Icon = {
    info: Info,
    success: CheckCircle2,
    warning: TriangleAlert,
    error: AlertCircle,
  }[variant];

  const iconColors = {
    info: 'text-electricTeal',
    success: 'text-emerald-400',
    warning: 'text-amber-400',
    error: 'text-rose-400',
  };

  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-3 rounded-xl border p-4 text-sm',
        styles[variant],
        className
      )}
    >
      <Icon className={cn('h-5 w-5 shrink-0 mt-0.5', iconColors[variant])} />
      <div className="space-y-1">
        {title ? <p className="font-semibold text-white">{title}</p> : null}
        <div className="text-xs leading-relaxed opacity-90">{children}</div>
      </div>
    </div>
  );
}
