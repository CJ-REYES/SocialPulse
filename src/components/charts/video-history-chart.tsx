'use client';

import * as React from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatCompactNumber, formatDateTime } from '@/lib/utils/format';
import type { VideoMetricSnapshot } from '@/types/domain';

export interface VideoHistoryChartProps {
  snapshots: VideoMetricSnapshot[];
}

export function VideoHistoryChart({ snapshots }: VideoHistoryChartProps) {
  if (snapshots.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center rounded-lg border border-dashed border-slateBlue-border bg-midnight/50 p-6 text-center">
        <p className="text-sm font-medium text-slate-300">
          Sin snapshots históricos adicionales
        </p>
        <p className="mt-1 text-xs text-slateBlue-muted">
          Cada ejecución del sistema de sincronización agrega un nuevo punto histórico para trazar la curva de crecimiento de este video.
        </p>
      </div>
    );
  }

  const data = snapshots.map((snap) => ({
    label: formatDateTime(snap.capturedAt),
    views: snap.viewsCount,
    likes: snap.likesCount,
    comments: snap.commentsCount,
    viewsDelta: snap.viewsDelta,
  }));

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2B3F60" vertical={false} />
          <XAxis
            dataKey="label"
            stroke="#8FA3BF"
            fontSize={11}
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
          <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
          <Line
            type="monotone"
            dataKey="views"
            name="Visualizaciones Acumuladas"
            stroke="#22D3C5"
            strokeWidth={2.5}
            dot={{ r: 3, fill: '#22D3C5' }}
          />
          <Line
            type="monotone"
            dataKey="likes"
            name="Me gusta"
            stroke="#38BDF8"
            strokeWidth={2}
            dot={{ r: 2.5 }}
          />
          <Line
            type="monotone"
            dataKey="comments"
            name="Comentarios"
            stroke="#A855F7"
            strokeWidth={2}
            dot={{ r: 2.5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
