'use client';

import { useEffect, useState } from 'react';
import { SummaryMetrics } from './SummaryMetrics';
import { AgentAccuracyDisplay } from './AgentAccuracyDisplay';
import { ThresholdAdjustments } from './ThresholdAdjustments';
import { fetchBriefOnce, type WeeklyBrief } from '../lib/fetchBrief';
import { formatWeekOf } from '../../../lib/formatDate';

type LoadState =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'error' }
  | { status: 'ready'; data: WeeklyBrief };

export function BriefView({ showHeader = true }: { showHeader?: boolean }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    fetchBriefOnce(controller.signal)
      .then((data) => {
        if (!active) return;
        setState(data ? { status: 'ready', data } : { status: 'empty' });
      })
      .catch((error) => {
        if (!active || (error instanceof DOMException && error.name === 'AbortError')) {
          return;
        }
        setState({ status: 'error' });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  if (state.status === 'loading') {
    return (
      <div data-testid="brief-loading" className="flex flex-col gap-6" aria-busy="true">
        <div className="h-8 w-48 animate-pulse rounded bg-ws-line" />
        <div className="grid grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded bg-ws-line/60" />
          ))}
        </div>
      </div>
    );
  }

  if (state.status === 'empty') {
    return (
      <div
        data-testid="brief-empty"
        className="flex flex-col items-center gap-2 rounded-card border border-dashed border-ws-line bg-ws-paper p-10 text-center"
      >
        <h2 className="text-xl font-semibold text-ws-ink">No brief yet</h2>
        <p className="max-w-md text-sm text-ws-muted">
          Your first weekly brief will appear after Work Signal runs its weekly
          recalibration.
        </p>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div
        data-testid="brief-error"
        className="rounded-card border border-rose-200 bg-rose-50 p-8 text-center"
      >
        <p className="text-sm text-rose-700">Could not load your brief.</p>
      </div>
    );
  }

  return (
    <>
      {showHeader && (
        <header className="mb-2">
          <p className="text-sm text-ws-muted">
            {formatWeekOf(state.data.week_of)}
            {state.data.emergency && (
              <span className="ml-2 inline-flex items-center rounded bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700">
                Emergency recalibration
              </span>
            )}
          </p>
        </header>
      )}
      <SummaryMetrics metrics={state.data.metrics} />
      <AgentAccuracyDisplay agentPerformance={state.data.agent_performance} />
      <ThresholdAdjustments adjustments={state.data.adjustments_made} />
      {state.data.brief_text && (
        <section aria-label="Generated brief" data-testid="brief-text">
          <h2 className="ws-section-label">Summary</h2>
          <div className="rounded-lg border border-ws-line bg-ws-card p-4">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-ws-muted">
              {state.data.brief_text}
            </p>
          </div>
        </section>
      )}
    </>
  );
}
