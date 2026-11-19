'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Calendar, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { DateRangePreset, Platform } from '@/types/domain';

const PRESET_OPTIONS: Array<{ value: DateRangePreset; label: string }> = [
  { value: '24h', label: 'Últimas 24h' },
  { value: '7d', label: '7 días' },
  { value: '30d', label: '30 días' },
  { value: '90d', label: '90 días' },
  { value: '12m', label: '12 meses' },
  { value: 'custom', label: 'Personalizado' },
];

const PLATFORM_OPTIONS: Array<{ value: Platform | 'all'; label: string }> = [
  { value: 'all', label: 'Todas las Plataformas' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook' },
];

export interface FilterBarProps {
  activePreset: DateRangePreset;
  activePlatform?: Platform | 'all';
  showPlatformSelector?: boolean;
  startDate: string;
  endDate: string;
  has24hData?: boolean;
}

export function FilterBar({
  activePreset,
  activePlatform = 'all',
  showPlatformSelector = true,
  startDate,
  endDate,
  has24hData = true,
}: FilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [customFrom, setCustomFrom] = React.useState(startDate);
  const [customTo, setCustomTo] = React.useState(endDate);

  const updateFilterParams = (updates: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v) {
        params.set(k, v);
      } else {
        params.delete(k);
      }
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slateBlue-border bg-slateBlue p-4 shadow-card lg:flex-row lg:items-center lg:justify-between">
      {/* Selector de Período */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-2 flex items-center gap-1.5 text-xs font-medium text-slateBlue-muted">
          <Calendar className="h-4 w-4 text-electricTeal" />
          Período:
        </span>
        {PRESET_OPTIONS.map((opt) => {
          const isSelected = activePreset === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() =>
                updateFilterParams({
                  preset: opt.value,
                  from: opt.value === 'custom' ? customFrom : undefined,
                  to: opt.value === 'custom' ? customTo : undefined,
                })
              }
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                isSelected
                  ? 'bg-electricTeal text-midnight font-semibold shadow-sm'
                  : 'bg-midnight/60 text-slate-300 hover:bg-midnight hover:text-white border border-slateBlue-border'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Rango personalizado y filtro de plataforma */}
      <div className="flex flex-wrap items-center gap-3">
        {activePreset === 'custom' ? (
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="h-8 w-36 text-xs"
              aria-label="Fecha inicial"
            />
            <span className="text-xs text-slateBlue-muted">a</span>
            <Input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="h-8 w-36 text-xs"
              aria-label="Fecha final"
            />
            <Button
              type="button"
              size="sm"
              onClick={() =>
                updateFilterParams({
                  preset: 'custom',
                  from: customFrom,
                  to: customTo,
                })
              }
            >
              Aplicar
            </Button>
          </div>
        ) : null}

        {showPlatformSelector ? (
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-electricTeal" />
            <select
              aria-label="Filtrar por plataforma"
              value={activePlatform}
              onChange={(e) =>
                updateFilterParams({
                  platform: e.target.value,
                })
              }
              className="h-9 rounded-lg border border-slateBlue-border bg-midnight px-3 text-xs font-medium text-slate-100 focus:outline-none focus:ring-2 focus:ring-electricTeal"
            >
              {PLATFORM_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      {activePreset === '24h' && !has24hData ? (
        <p className="text-xs text-amber-300 lg:w-full">
          Nota: No se han registrado snapshots en las últimas 24 horas. Ejecuta una sincronización manual para capturar datos intradía.
        </p>
      ) : null}
    </div>
  );
}
