'use client';

import { useEffect, useRef, useState } from 'react';
import type { NetworkSuggestion } from '@/app/types/shared';
import { ConnectionCard } from './ConnectionCard';
import { fetchNetworkOnce, type NetworkData } from '../lib/fetchNetwork';
import {
  connectionReachOutKey,
  type ReachOutChannel,
} from '../lib/networkStorage';
import type { EnrichedNetworkSuggestion } from '../lib/connectionHelpers';

export interface ArchivedConnectionsPanelProps {
  company: string;
  reachedOutDates: Record<string, string>;
  reachedOutChannels: Record<string, ReachOutChannel>;
}

export function ArchivedConnectionsPanel({
  company,
  reachedOutDates,
  reachedOutChannels,
}: ArchivedConnectionsPanelProps) {
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'error' }
    | { status: 'ready'; data: NetworkData }
  >({ status: 'loading' });
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const existing = stateRef.current;
    if (existing.status === 'ready' && existing.data.company === company) return;

    const controller = new AbortController();
    let alive = true;

    setState({ status: 'loading' });

    fetchNetworkOnce(controller.signal, company)
      .then((data) => {
        if (!alive) return;
        setState(data ? { status: 'ready', data } : { status: 'error' });
      })
      .catch((error) => {
        if (!alive || (error instanceof DOMException && error.name === 'AbortError')) return;
        setState({ status: 'error' });
      });

    return () => {
      alive = false;
      controller.abort();
    };
  }, [company]);

  if (state.status === 'loading') {
    return (
      <div data-testid="network-archived-loading" className="space-y-2" aria-busy="true">
        <div className="h-12 animate-pulse rounded-xl bg-gray-100" />
        <div className="h-12 animate-pulse rounded-xl bg-gray-100" />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <p data-testid="network-archived-error" className="text-sm text-gray-500">
        Could not load archived connections.
      </p>
    );
  }

  const suggestions = state.data.suggestionSet.suggestions;

  return (
    <div data-testid="network-archived-panel" className="flex flex-col gap-2">
      <p className="text-sm text-gray-500">
        {company} · {suggestions.length} connection{suggestions.length === 1 ? '' : 's'}
      </p>
      <ul className="flex flex-col gap-2">
        {suggestions.map((suggestion: NetworkSuggestion) => {
          const key = connectionReachOutKey(company, suggestion.name);

          return (
            <li key={suggestion.name}>
              <ConnectionCard
                suggestion={suggestion as EnrichedNetworkSuggestion}
                company={company}
                readOnly
                reachOutChannel={reachedOutChannels[key]}
                reachedOutDate={reachedOutDates[key]}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
