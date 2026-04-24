import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-bg-primary text-slate-100">
      <Sidebar />
      <TopBar />
      <main className="ml-[60px] mt-14 min-h-[calc(100vh-3.5rem)] overflow-y-auto p-4 md:ml-[240px] md:p-6">
        {children}
      </main>
    </div>
  );
}
