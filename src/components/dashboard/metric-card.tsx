import * as React from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { formatPercentage } from '@/lib/utils/format';

export interface MetricCardProps {
  title: string;
  value: string;
  subtitle?: string;
  percentageChange?: number | null;
  icon: React.ReactNode;
  highlight?: boolean;
}

export function MetricCard({
  title,
  value,
  subtitle,
  percentageChange,
  icon,
  highlight = false,
}: MetricCardProps) {
  const hasChange = percentageChange !== undefined && percentageChange !== null;
  const isPositive = hasChange && percentageChange > 0;
  const isNegative = hasChange && percentageChange < 0;

  return (
    <Card
      className={
        highlight
          ? 'border-electricTeal/50 bg-gradient-to-br from-slateBlue to-midnight shadow-tealGlow'
          : 'hover:border-slateBlue-border/90 transition-colors'
      }
    >
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wider text-slateBlue-muted">
            {title}
          </p>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-midnight border border-slateBlue-border text-electricTeal">
            {icon}
          </div>
        </div>

        <div className="mt-3 flex items-baseline justify-between gap-2">
          <p className="text-2xl font-bold tracking-tight text-white">{value}</p>

          {hasChange ? (
            <span
              className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold ${
                isPositive
                  ? 'bg-electricTeal/15 text-electricTeal border border-electricTeal/30'
                  : isNegative
                    ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                    : 'bg-midnight text-slateBlue-muted border border-slateBlue-border'
              }`}
            >
              {isPositive ? (
                <ArrowUpRight className="h-3.5 w-3.5" />
              ) : isNegative ? (
                <ArrowDownRight className="h-3.5 w-3.5" />
              ) : (
                <Minus className="h-3.5 w-3.5" />
              )}
              {formatPercentage(percentageChange)}
            </span>
          ) : null}
        </div>

        {subtitle ? (
          <p className="mt-2 text-xs text-slateBlue-muted truncate">{subtitle}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
