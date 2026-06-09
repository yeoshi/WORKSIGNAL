'use client';

import { SessionProvider } from 'next-auth/react';
import type { ReactNode } from 'react';

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <div className="min-h-screen bg-gray-50">{children}</div>
    </SessionProvider>
  );
}
