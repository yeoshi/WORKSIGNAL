'use client';

import { BriefView } from './components/BriefView';

export default function BriefPage() {
  return (
    <main className="mx-auto flex min-w-0 max-w-3xl flex-col gap-8 overflow-x-hidden p-4 sm:p-10">
      <header>
        <h1 className="font-wordmark text-2xl font-semibold text-ws-ink">
          Weekly Brief
        </h1>
      </header>
      <BriefView showHeader />
    </main>
  );
}
