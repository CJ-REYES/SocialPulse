import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MetricCard } from '@/components/dashboard/metric-card';
import {
  ConnectionStatusBadge,
  PlatformBadge,
} from '@/components/platforms/platform-badge';
import { AlertBanner } from '@/components/ui/alert';

describe('UI Components: Dashboard Visual & Functional Integrity', () => {
  it('renders MetricCard with value, subtitle, and positive growth percentage', () => {
    render(
      <MetricCard
        title="Visualizaciones Totales"
        value="125,4 mil"
        subtitle="Comparado contra los 30 días previos"
        percentageChange={24.5}
        icon={<span data-testid="metric-icon">V</span>}
        highlight
      />
    );

    expect(screen.getByText('Visualizaciones Totales')).toBeInTheDocument();
    expect(screen.getByText('125,4 mil')).toBeInTheDocument();
    expect(screen.getByText('+24.5%')).toBeInTheDocument();
  });

  it('renders accurate PlatformBadge and ConnectionStatusBadge labels', () => {
    render(
      <div>
        <PlatformBadge platform="youtube" />
        <PlatformBadge platform="tiktok" />
        <ConnectionStatusBadge status="connected" />
        <ConnectionStatusBadge status="expired" />
      </div>
    );

    expect(screen.getByText('YouTube')).toBeInTheDocument();
    expect(screen.getByText('TikTok')).toBeInTheDocument();
    expect(screen.getByText('Conectada')).toBeInTheDocument();
    expect(screen.getByText('Token Expirado')).toBeInTheDocument();
  });

  it('renders AlertBanner with accessible role="alert"', () => {
    render(
      <AlertBanner variant="error" title="Error de Permisos">
        El scope instagram_manage_insights requiere aprobación.
      </AlertBanner>
    );

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(screen.getByText('Error de Permisos')).toBeInTheDocument();
  });
});
