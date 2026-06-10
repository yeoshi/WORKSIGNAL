'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ApprovalState } from '@/app/types/shared';
import type { DashboardData } from './types';
import { filterSkippedActionNeeded } from './lib/skippedJobsStorage';

/**
 * Client-side data hook for the dashboard.
 *
 * Fetches the dashboard payload from the BFF (`GET /api/dashboard`, wired in
 * task 24.1) and exposes approve / reject actions for surfaced relaxation
 * suggestions (Req 9.7). The endpoint may not exist yet, so the hook tolerates
 * its absence: failures surface as an error state rather than throwing, and
 * the page renders an empty / loading state accordingly.
 */

type LoadState = 'loading' | 'ready' | 'error';

export interface UseDashboardData {
  data: DashboardData | null;
  state: LoadState;
  reload: () => void;
  removeActionNeeded: (jobId: string) => void;
  removePendingSend: (jobId: string) => void;
  approveSuggestion: (suggestionId: string) => Promise<void>;
  rejectSuggestion: (suggestionId: string) => Promise<void>;
}

export function useDashboardData(): UseDashboardData {
  const [data, setData] = useState<DashboardData | null>(null);
  const [state, setState] = useState<LoadState>('loading');

  const load = useCallback(async () => {
    setState('loading');
    try {
      const res = await fetch('/api/dashboard', {
        headers: { accept: 'application/json' },
      });
      if (!res.ok) {
        setState('error');
        return;
      }
      const payload = (await res.json()) as DashboardData;
      setData({
        ...payload,
        action_needed: filterSkippedActionNeeded(payload.action_needed),
        pending_send: filterSkippedActionNeeded(payload.pending_send ?? []),
      });
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Optimistically update a suggestion's approval state in local data. */
  const setSuggestionState = useCallback(
    (suggestionId: string, approvalState: ApprovalState) => {
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          relaxation_suggestions: prev.relaxation_suggestions.map((s) =>
            s.suggestion_id === suggestionId
              ? { ...s, approval_state: approvalState }
              : s,
          ),
        };
      });
    },
    [],
  );

  const resolveSuggestion = useCallback(
    async (suggestionId: string, action: 'approve' | 'reject') => {
      const nextState: ApprovalState =
        action === 'approve' ? 'approved' : 'rejected';
      try {
        const res = await fetch(
          `/api/relaxation-suggestions/${encodeURIComponent(
            suggestionId,
          )}/${action}`,
          { method: 'POST' },
        );
        if (res.ok) {
          setSuggestionState(suggestionId, nextState);
        }
      } catch {
        // Network unavailable (endpoint not wired yet): leave state unchanged
        // so non-negotiables are never assumed to have mutated (Req 9.8).
      }
    },
    [setSuggestionState],
  );

  const approveSuggestion = useCallback(
    (suggestionId: string) => resolveSuggestion(suggestionId, 'approve'),
    [resolveSuggestion],
  );

  const rejectSuggestion = useCallback(
    (suggestionId: string) => resolveSuggestion(suggestionId, 'reject'),
    [resolveSuggestion],
  );

  const removeActionNeeded = useCallback((jobId: string) => {
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        action_needed: prev.action_needed.filter((i) => i.job_id !== jobId),
      };
    });
  }, []);

  const removePendingSend = useCallback((jobId: string) => {
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        pending_send: prev.pending_send.filter((i) => i.job_id !== jobId),
      };
    });
  }, []);

  return {
    data,
    state,
    reload: () => void load(),
    removeActionNeeded,
    removePendingSend,
    approveSuggestion,
    rejectSuggestion,
  };
}
