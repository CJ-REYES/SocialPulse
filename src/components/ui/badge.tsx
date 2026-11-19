import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils/cn';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default:
          'bg-electricTeal/15 text-electricTeal border border-electricTeal/30',
        secondary:
          'bg-midnight/70 text-slate-300 border border-slateBlue-border',
        success:
          'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
        warning:
          'bg-amber-500/15 text-amber-300 border border-amber-500/30',
        danger:
          'bg-rose-500/15 text-rose-300 border border-rose-500/30',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
