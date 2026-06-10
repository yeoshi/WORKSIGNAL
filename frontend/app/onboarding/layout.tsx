'use client';

import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';

const OnboardingProviders = dynamic(
  () =>
    import('./OnboardingProviders').then((mod) => mod.OnboardingProviders),
  { ssr: false },
);

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <OnboardingProviders>
      <div className="min-h-screen bg-ws-paper">{children}</div>
    </OnboardingProviders>
  );
}
