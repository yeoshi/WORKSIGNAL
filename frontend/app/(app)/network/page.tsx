'use client';

import { NetworkView } from './components/NetworkView';

export default function NetworkPage() {
  return (
    <main className="mx-auto flex min-w-0 max-w-3xl flex-col gap-8 overflow-x-hidden p-4 sm:p-10">
      <header>
        <h1 className="font-wordmark text-2xl font-semibold text-ws-ink">
          Network
        </h1>
        <p className="mt-1 text-sm text-ws-muted">
          Connection suggestions by company.
        </p>
      </header>
      <NetworkView />
    </main>
  );
}
