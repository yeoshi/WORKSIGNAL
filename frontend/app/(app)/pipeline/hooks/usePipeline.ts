'use client';

/**
 * React hook that loads the pipeline and retries silently on failure.
 *
 * Wraps {@link loadPipelineWithRetry} so the view only ever observes a
 * loading state and the eventual applications — never an error (Req 17.2).
 */

import { useCallback, useEffect, useState } from 'react';
import type { Application } from '@/app/types/shared';
import { loadPipelineWithRetry } from '../lib/fetchPipeline';

export interface UsePipelineResult {
  applications: Application[];
  isLoading: boolean;
  reload: () => void;
  prependApplication: (app: Application) => void;
}

export function usePipeline(): UsePipelineResult {
  const [applications, setApplications] = useState<Application[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => {
    setReloadToken((n) => n + 1);
  }, []);

  const prependApplication = useCallback((app: Application) => {
    setApplications((prev) => {
      if (prev.some((p) => p.job_id === app.job_id)) return prev;
      return [app, ...prev];
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    void loadPipelineWithRetry({
      isCancelled: () => cancelled,
      onSuccess: (next) => {
        setApplications(next);
        setIsLoading(false);
      },
    });

    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  return { applications, isLoading, reload, prependApplication };
}
