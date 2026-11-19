'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  Film,
  GitCompareArrows,
  LayoutDashboard,
  Link2,
  Menu,
  ShieldCheck,
  Tv,
  UploadCloud,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

const MAIN_NAV: NavItem[] = [
  {
    label: 'Resumen General',
    href: '/dashboard',
    icon: LayoutDashboard,
  },
  {
    label: 'Biblioteca de Videos',
    href: '/videos',
    icon: Film,
  },
  {
    label: 'Publicar / Programar',
    href: '/publish',
    icon: UploadCloud,
  },
  {
    label: 'Comparación Multiplataforma',
    href: '/compare',
    icon: GitCompareArrows,
  },
  {
    label: 'Conexiones OAuth',
    href: '/connections',
    icon: Link2,
  },
];

const PLATFORM_NAV: NavItem[] = [
  {
    label: 'YouTube Analytics',
    href: '/platforms/youtube',
    icon: Tv,
  },
  {
    label: 'TikTok Analytics',
    href: '/platforms/tiktok',
    icon: BarChart3,
  },
  {
    label: 'Instagram Graph',
    href: '/platforms/instagram',
    icon: BarChart3,
  },
  {
    label: 'Facebook Graph',
    href: '/platforms/facebook',
    icon: BarChart3,
  },
];

export function DashboardSidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const renderLinks = (items: NavItem[]) =>
    items.map((item) => {
      const Icon = item.icon;
      const isActive =
        pathname === item.href ||
        (item.href !== '/dashboard' && pathname.startsWith(item.href));

      return (
        <Link
          key={item.href}
          href={item.href}
          onClick={() => setMobileOpen(false)}
          className={cn(
            'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
            isActive
              ? 'bg-electricTeal/15 text-electricTeal border border-electricTeal/30 shadow-sm'
              : 'text-slate-300 hover:bg-midnight/60 hover:text-white border border-transparent'
          )}
        >
          <Icon
            className={cn(
              'h-4 w-4 shrink-0 transition-colors',
              isActive ? 'text-electricTeal' : 'text-slateBlue-muted group-hover:text-white'
            )}
          />
          <span className="truncate">{item.label}</span>
        </Link>
      );
    });

  return (
    <>
      <button
        type="button"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label="Alternar menú de navegación"
        className="fixed bottom-4 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-electricTeal text-midnight shadow-tealGlow lg:hidden"
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {mobileOpen ? (
        <div
          className="fixed inset-0 z-40 bg-midnight/80 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slateBlue-border bg-slateBlue transition-transform duration-200 lg:static lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Brand Header */}
        <div className="flex h-16 items-center gap-3 border-b border-slateBlue-border px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-electricTeal/15 border border-electricTeal/40 text-electricTeal">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold tracking-wide text-white">
              SOCIAL<span className="text-electricTeal">PULSE</span>
            </p>
            <p className="text-[11px] text-slateBlue-muted">Private Analytics Suite</p>
          </div>
        </div>

        {/* Navigation Sections */}
        <div className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
          <div className="space-y-1">
            <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slateBlue-muted">
              Panel Central
            </p>
            <nav className="mt-2 space-y-1">{renderLinks(MAIN_NAV)}</nav>
          </div>

          <div className="space-y-1">
            <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slateBlue-muted">
              Rendimiento por Red
            </p>
            <nav className="mt-2 space-y-1">{renderLinks(PLATFORM_NAV)}</nav>
          </div>
        </div>

        {/* Security Status Footer */}
        <div className="border-t border-slateBlue-border p-4">
          <div className="rounded-lg bg-midnight/80 border border-slateBlue-border/80 p-3">
            <div className="flex items-center gap-2 text-xs font-medium text-electricTeal">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              <span>Conexiones Protegidas</span>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-slateBlue-muted">
              Tus métricas y accesos están cifrados y aislados exclusivamente en tu cuenta.
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
