'use client';

import { useCallback, useEffect, useState } from 'react';
import type { NetworkRunEvent } from '@/app/api/network/run/route';
import { useAgentStream } from '@/app/hooks/useAgentStream';
import type { NetworkCardItem } from '../../dashboard/types';
import { normalizeNetworkResponse } from '../lib/fetchNetwork';
import type { NetworkRunCompanyPayload } from '../components/NetworkView';

function parseNetworkComplete(events: NetworkRunEvent[]): NetworkRunCompanyPayload[] | null {
  const complete = [...events].reverse().find((e) => e.type === 'complete');
  if (!complete || complete.type !== 'complete') return null;
  return complete.companies
    .map((row) => {
      const normalized = normalizeNetworkResponse(row);
      if (!normalized) return null;
      return {
        company: normalized.company,
        application_count: normalized.application_count,
        suggestions: normalized.suggestionSet.suggestions,
        upcoming_events: normalized.suggestionSet.upcoming_events,
      };
    })
    .filter((r): r is NetworkRunCompanyPayload => r !== null);
}

function mergeCompanyItems(
  fetched: NetworkCardItem[],
  initial: NetworkCardItem[],
): NetworkCardItem[] {
  const byName = new Map<string, NetworkCardItem>();
  for (const item of fetched) {
    byName.set(item.company, item);
  }
  for (const item of initial) {
    const existing = byName.get(item.company);
    byName.set(item.company, {
      company: item.company,
      suggestion_count: item.suggestion_count ?? existing?.suggestion_count ?? 0,
    });
  }
  return [...byName.values()].sort((a, b) => a.company.localeCompare(b.company));
}

export function useNetworkAgentRun(initialCompanies: NetworkCardItem[] = []) {
  const [companyItems, setCompanyItems] = useState<NetworkCardItem[]>(initialCompanies);
  const [companiesLoading, setCompaniesLoading] = useState(true);
  const [mergeCompanies, setMergeCompanies] = useState<NetworkRunCompanyPayload[] | null>(null);
  const [runCompletedEmpty, setRunCompletedEmpty] = useState(false);

  const initialCompaniesKey = initialCompanies
    .map((c) => `${c.company}:${c.suggestion_count}`)
    .join('|');

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/network/companies', { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : { companies: [] }))
      .then(
        (body: {
          companies?: Array<{
            company: string;
            application_count: number;
            suggestion_count?: number;
          }>;
        }) => {
          const fetched = (body.companies ?? []).map((c) => ({
            company: c.company,
            suggestion_count: c.suggestion_count ?? 0,
          }));
          setCompanyItems(mergeCompanyItems(fetched, initialCompanies));
        },
      )
      .catch(() => setCompanyItems(mergeCompanyItems([], initialCompanies)))
      .finally(() => setCompaniesLoading(false));

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by stable company list
  }, [initialCompaniesKey]);

  const handleComplete = useCallback((events: NetworkRunEvent[]) => {
    const data = parseNetworkComplete(events);
    if (data && data.length > 0) {
      setRunCompletedEmpty(false);
      setMergeCompanies(data);
      setCompanyItems((prev) => {
        const byName = new Map(prev.map((p) => [p.company, p]));
        for (const row of data) {
          byName.set(row.company, {
            company: row.company,
            suggestion_count: row.suggestions.length,
          });
        }
        return [...byName.values()];
      });
    } else {
      setRunCompletedEmpty(true);
    }
  }, []);

  const stream = useAgentStream<NetworkRunEvent>({
    url: '/api/network/run',
    completeTypes: ['complete'],
    onComplete: handleComplete,
  });

  const start = useCallback(() => {
    setRunCompletedEmpty(false);
    stream.start();
  }, [stream]);

  return {
    stream: { ...stream, start },
    companyItems,
    companiesLoading,
    mergeCompanies,
    runCompletedEmpty,
    running: stream.state === 'running',
  };
}
