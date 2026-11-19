import * as React from 'react';
import { requireAuthenticatedContext } from '@/features/auth/session';
import { listUserConnections } from '@/features/connections/connections.service';
import { DashboardSidebar } from '@/components/dashboard/sidebar';
import { DashboardHeader } from '@/components/dashboard/header';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireAuthenticatedContext();
  const connections = await listUserConnections(ctx.userId);
  const activeCount = connections.filter(
    (c) => c.account.connectionStatus === 'connected'
  ).length;

  return (
    <div className="flex min-h-screen bg-midnight text-slate-100">
      <DashboardSidebar />
      <div className="flex flex-1 flex-col min-w-0">
        <DashboardHeader
          profile={ctx.profile}
          connectedAccountsCount={activeCount}
        />
        <main className="flex-1 p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
          {children}
        </main>
      </div>
    </div>
  );
}
