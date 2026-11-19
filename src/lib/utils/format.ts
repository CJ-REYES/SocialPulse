import { format, formatDistanceToNow, parseISO, subDays, subHours, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import type { DateRangeFilter, DateRangePreset, Platform } from '@/types/domain';

export function formatCompactNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'N/D';
  }
  return new Intl.NumberFormat('es-ES', {
    notation: Math.abs(value) >= 10000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatFullNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'No disponible';
  }
  return new Intl.NumberFormat('es-ES').format(value);
}

export function formatPercentage(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'Sin base previa';
  }
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

export function formatDurationSeconds(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || seconds < 0) {
    return 'N/D';
  }
  const totalSeconds = Math.round(seconds);
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function formatDateShort(isoString: string | null | undefined): string {
  if (!isoString) return 'Nunca';
  try {
    return format(parseISO(isoString), 'dd MMM yyyy', { locale: es });
  } catch {
    return 'Fecha inválida';
  }
}

export function formatDateTime(isoString: string | null | undefined): string {
  if (!isoString) return 'Nunca';
  try {
    return format(parseISO(isoString), 'dd MMM yyyy, HH:mm', { locale: es });
  } catch {
    return 'Fecha inválida';
  }
}

export function formatRelativeTime(isoString: string | null | undefined): string {
  if (!isoString) return 'Sin sincronizar';
  try {
    return formatDistanceToNow(parseISO(isoString), { addSuffix: true, locale: es });
  } catch {
    return 'Desconocido';
  }
}

export function getPlatformDisplayName(platform: Platform): string {
  const names: Record<Platform, string> = {
    youtube: 'YouTube',
    tiktok: 'TikTok',
    instagram: 'Instagram',
    facebook: 'Facebook',
  };
  return names[platform];
}

export function getPlatformMethodologyNote(platform: Platform): string {
  const notes: Record<Platform, string> = {
    youtube:
      'YouTube contabiliza una visualización tras una reproducción legítima iniciada por el usuario (incluyendo Shorts). No expone Alcance único en Data API v3.',
    tiktok:
      'TikTok contabiliza una visualización desde el primer fotograma reproducido en el feed o perfil (Display API v2). Tiempo de visualización no expuesto públicamente.',
    instagram:
      'Instagram Graph API v21 contabiliza visualizaciones (views) en Reels/Videos e incluye alcance (reach) de cuentas únicas en cuentas Profesionales.',
    facebook:
      'Meta Graph API contabiliza visualizaciones de video a partir de ≥3 segundos de reproducción continua (total_video_views).',
  };
  return notes[platform];
}

export function resolveDateRangeFilter(
  preset: DateRangePreset,
  customStart?: string,
  customEnd?: string,
  referenceNow: Date = new Date()
): DateRangeFilter {
  const endDate =
    preset === 'custom' && customEnd ? new Date(customEnd) : new Date(referenceNow);

  let startDate: Date;
  switch (preset) {
    case '24h':
      startDate = subHours(endDate, 24);
      break;
    case '7d':
      startDate = subDays(endDate, 7);
      break;
    case '30d':
      startDate = subDays(endDate, 30);
      break;
    case '90d':
      startDate = subDays(endDate, 90);
      break;
    case '12m':
      startDate = subMonths(endDate, 12);
      break;
    case 'custom':
      startDate = customStart ? new Date(customStart) : subDays(endDate, 30);
      break;
  }

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || startDate > endDate) {
    const safeEnd = new Date(referenceNow);
    const safeStart = subDays(safeEnd, 30);
    const durationMs = safeEnd.getTime() - safeStart.getTime();
    return {
      preset: '30d',
      startDate: safeStart,
      endDate: safeEnd,
      previousStartDate: new Date(safeStart.getTime() - durationMs),
      previousEndDate: new Date(safeStart.getTime()),
    };
  }

  const durationMs = Math.max(endDate.getTime() - startDate.getTime(), 3600 * 1000);
  const previousEndDate = new Date(startDate.getTime());
  const previousStartDate = new Date(startDate.getTime() - durationMs);

  return {
    preset,
    startDate,
    endDate,
    previousStartDate,
    previousEndDate,
  };
}

export function parseIso8601DurationToSeconds(isoDuration: string | null | undefined): number | null {
  if (!isoDuration) return null;
  const regex = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/;
  const matches = regex.exec(isoDuration);
  if (!matches) return null;
  const hours = Number.parseInt(matches[1] ?? '0', 10);
  const minutes = Number.parseInt(matches[2] ?? '0', 10);
  const seconds = Number.parseInt(matches[3] ?? '0', 10);
  return hours * 3600 + minutes * 60 + seconds;
}
