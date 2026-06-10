'use client';

import { useState, type ReactNode } from 'react';
import { RunAgentButton } from '@/app/components/ui/RunAgentButton';
import { NetworkView } from './components/NetworkView';
import { NetworkRunPanel } from './components/NetworkRunPanel';
import { useNetworkAgentRun } from './hooks/useNetworkAgentRun';

export default function NetworkPage() {
  const [headerArchive, setHeaderArchive] = useState<ReactNode | null>(null);
  const {
    stream,
    companyItems,
    companiesLoading,
    mergeCompanies,
    runCompletedEmpty,
    running,
  } = useNetworkAgentRun();

  return (
    <main className="mx-auto flex min-w-0 max-w-3xl flex-col gap-8 overflow-x-hidden p-4 sm:p-10">
      <header className="flex min-w-0 flex-wrap items-start justify-between gap-3 sm:items-center">
        <div className="min-w-0">
          <h1 className="font-wordmark text-2xl font-semibold text-ws-ink">
            Network
          </h1>
          <p className="mt-1 text-sm text-ws-muted">
            Connection suggestions by company.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {headerArchive}
          <RunAgentButton
            label="Run Network Agent"
            runningLabel="Running…"
            running={running}
            onClick={stream.start}
            testId="run-network-agent-button"
            ariaLabel="Run Network Agent"
          />
        </div>
      </header>

      {(running || stream.events.length > 0) && (
        <NetworkRunPanel events={stream.events} error={stream.error} />
      )}

      {companiesLoading ? (
        <div data-testid="network-companies-loading" className="h-20 animate-pulse rounded bg-ws-line/60" />
      ) : (
        <NetworkView
          companyItems={companyItems}
          onTitleActionChange={setHeaderArchive}
          mergeRunCompanies={mergeCompanies}
          runCompletedEmpty={runCompletedEmpty}
          runError={stream.state === 'error' ? stream.error : null}
        />
      )}
    </main>
  );
}
