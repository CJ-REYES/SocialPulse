import * as React from 'react';
import { cn } from '@/lib/utils/cn';

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-lg bg-midnight/70 border border-slateBlue-border/40',
        className
      )}
      {...props}
    />
  );
}
