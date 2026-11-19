'use client';

import * as React from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatCompactNumber } from '@/lib/utils/format';
import type { TimeSeriesPoint } from '@/types/domain';

export interface ViewsEvolutionChartProps {
  data: TimeSeriesPoint[];
}

export function ViewsEvolutionChart({ data }: ViewsEvolutionChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-72 flex-col items-center justify-center rounded-lg border border-dashed border-slateBlue-border bg-midnight/50 p-6 text-center">
        <p className="text-sm font-medium text-slate-300">
          Sin datos de evolución temporal para el período seleccionado
        </p>
        <p className="mt-1 max-w-md text-xs text-slateBlue-muted">
          Conecta tus cuentas oficiales en la sección Conexiones y ejecuta una sincronización para poblar los snapshots históricos.
        </p>
      </div>
    );
  }

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="gradTikTok" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22D3C5" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#22D3C5" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradYouTube" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#FF3B30" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#FF3B30" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradInstagram" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#E1306C" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#E1306C" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradFacebook" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#1877F2" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#1877F2" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#2B3F60" vertical={false} />
          <XAxis
            dataKey="date"
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
            contentStyle={{
              backgroundColor: '#0B1220',
              borderColor: '#22D3C5',
              borderRadius: '0.75rem',
              color: '#F8FAFC',
              fontSize: '12px',
            }}
          />
          <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '12px' }} />
          <Area
            type="monotone"
            dataKey="youtube"
            name="YouTube"
            stroke="#FF3B30"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#gradYouTube)"
          />
          <Area
            type="monotone"
            dataKey="tiktok"
            name="TikTok"
            stroke="#22D3C5"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#gradTikTok)"
          />
          <Area
            type="monotone"
            dataKey="instagram"
            name="Instagram"
            stroke="#E1306C"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#gradInstagram)"
          />
          <Area
            type="monotone"
            dataKey="facebook"
            name="Facebook"
            stroke="#1877F2"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#gradFacebook)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
