'use client';

import { SessionProvider } from 'next-auth/react';
import type { ReactNode } from 'react';
import { TopBar } from './TopBar';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <div className="flex min-h-screen min-w-0 flex-col overflow-x-hidden">
        <TopBar />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </SessionProvider>
  );
}
