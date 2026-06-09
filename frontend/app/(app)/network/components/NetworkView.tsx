'use client';

import { useEffect, useState } from 'react';
import { CompanyRow } from './CompanyRow';
import { ConnectionCard } from './ConnectionCard';
import { UpcomingEvents } from './UpcomingEvents';
import { fetchNetworkOnce, type NetworkData } from '../lib/fetchNetwork';

type LoadState =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'error' }
  | { status: 'ready'; data: NetworkData };

export function NetworkView() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [expandedCompany, setExpandedCompany] = useState<string | null>(null);

  useEffect(() => {
    if (state.status === 'ready') {
      setExpandedCompany(state.data.company);
    }
  }, [state]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    fetchNetworkOnce(controller.signal)
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
      <div data-testid="network-loading" className="flex flex-col gap-4" aria-busy="true">
        <div className="h-20 w-full animate-pulse rounded bg-ws-line/60" />
        <div className="h-44 w-full animate-pulse rounded bg-ws-line/40" />
      </div>
    );
  }

  if (state.status === 'empty') {
    return (
      <div
        data-testid="network-empty"
        className="flex flex-col items-center gap-2 rounded-card border border-dashed border-ws-line bg-ws-paper p-10 text-center"
      >
        <h2 className="text-xl font-semibold text-ws-ink">No network suggestions yet</h2>
        <p className="max-w-md text-sm text-ws-muted">
          Once you&apos;ve sent at least two applications to the same company,
          Work Signal will surface connection suggestions.
        </p>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div
        data-testid="network-error"
        className="rounded-card border border-rose-200 bg-rose-50 p-8 text-center"
      >
        <p className="text-sm text-rose-700">Could not load network suggestions.</p>
      </div>
    );
  }

  const { company, application_count, suggestionSet } = state.data;
  const showDetails = expandedCompany === company;

  return (
    <div className="flex flex-col gap-6">
      <CompanyRow
        company={company}
        applicationCount={application_count}
        suggestions={suggestionSet.suggestions}
        onClick={() =>
          setExpandedCompany((c) => (c === company ? null : company))
        }
      />

      {showDetails && suggestionSet.suggestions.length > 0 && (
        <section aria-label="Connection suggestions">
          <h2 className="ws-section-label">Connections</h2>
          <div className="flex flex-col gap-4">
            {suggestionSet.suggestions.map((suggestion) => (
              <ConnectionCard
                key={`${suggestion.type}-${suggestion.name}`}
                suggestion={suggestion}
              />
            ))}
          </div>
        </section>
      )}

      <UpcomingEvents events={suggestionSet.upcoming_events} />
    </div>
  );
}
