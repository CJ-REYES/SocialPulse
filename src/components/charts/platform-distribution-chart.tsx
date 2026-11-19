'use client';

import * as React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatCompactNumber, getPlatformDisplayName } from '@/lib/utils/format';
import type { Platform, PlatformSummaryStats } from '@/types/domain';

const PLATFORM_COLORS: Record<Platform, string> = {
  youtube: '#FF3B30',
  tiktok: '#22D3C5',
  instagram: '#E1306C',
  facebook: '#1877F2',
};

export interface PlatformDistributionChartProps {
  summaries: PlatformSummaryStats[];
  metric?: 'totalViews' | 'totalInteractions' | 'followersCount';
}

export function PlatformDistributionChart({
  summaries,
  metric = 'totalViews',
}: PlatformDistributionChartProps) {
  const chartData = summaries.map((s) => ({
    platform: s.platform,
    name: getPlatformDisplayName(s.platform),
    value: s[metric],
    share: s.viewsSharePercentage,
  }));

  const hasAnyValue = chartData.some((d) => d.value > 0);

  if (!hasAnyValue) {
    return (
      <div className="flex h-64 flex-col items-center justify-center rounded-lg border border-dashed border-slateBlue-border bg-midnight/50 p-6 text-center">
        <p className="text-sm font-medium text-slate-300">
          Sin métricas registradas para comparar plataformas
        </p>
        <p className="mt-1 text-xs text-slateBlue-muted">
          Las gráficas comparativas utilizarán exclusivamente datos reales recuperados de tus cuentas conectadas.
        </p>
      </div>
    );
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2B3F60" vertical={false} />
          <XAxis
            dataKey="name"
            stroke="#8FA3BF"
            fontSize={12}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            stroke="#8FA3BF"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            tickFormatter={(val: number) => formatCompactNumber(val)}
          />
          <Tooltip
            cursor={{ fill: 'rgba(34, 211, 197, 0.08)' }}
            contentStyle={{
              backgroundColor: '#0B1220',
              borderColor: '#22D3C5',
              borderRadius: '0.75rem',
              color: '#F8FAFC',
              fontSize: '12px',
            }}
          />
          <Bar dataKey="value" name="Total" radius={[6, 6, 0, 0]}>
            {chartData.map((entry) => (
              <Cell
                key={entry.platform}
                fill={PLATFORM_COLORS[entry.platform]}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
