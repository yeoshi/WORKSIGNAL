'use client';

import { useState, type ReactNode } from 'react';
import { RunAgentButton } from '@/app/components/ui/RunAgentButton';
import { GrowthView } from './components/GrowthView';
import { GrowthRunPanel } from './components/GrowthRunPanel';
import { useGrowthAgentRun } from './hooks/useGrowthAgentRun';

export default function GrowthPage() {
  const [headerArchive, setHeaderArchive] = useState<ReactNode | null>(null);
  const { stream, mergeData, running } = useGrowthAgentRun();

  return (
    <main className="mx-auto flex min-w-0 max-w-3xl flex-col gap-8 overflow-x-hidden p-4 sm:p-10">
      <header className="flex min-w-0 flex-wrap items-start justify-between gap-3 sm:items-center">
        <div className="min-w-0">
          <h1 className="font-wordmark text-2xl font-semibold text-ws-ink">
            Growth
          </h1>
          <p className="mt-1 text-sm text-ws-muted">
            Your personalised skill-gap roadmap.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {headerArchive}
          <RunAgentButton
            label="Run Growth Agent"
            runningLabel="Running…"
            running={running}
            onClick={stream.start}
            testId="run-growth-agent-button"
            ariaLabel="Run Growth Agent"
          />
        </div>
      </header>

      {(running || stream.events.length > 0) && (
        <GrowthRunPanel events={stream.events} error={stream.error} />
      )}

      <GrowthView
        onTitleActionChange={setHeaderArchive}
        mergeRunData={mergeData}
        runError={stream.state === 'error' ? stream.error : null}
      />
    </main>
  );
}
