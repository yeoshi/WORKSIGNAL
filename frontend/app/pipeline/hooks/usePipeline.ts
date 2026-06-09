'use client';

/**
 * React hook that loads the pipeline and retries silently on failure.
 *
 * Wraps {@link loadPipelineWithRetry} so the view only ever observes a
 * loading state and the eventual applications — never an error (Req 17.2).
 */

import { useEffect, useState } from 'react';
import type { Application } from '@worksignal/shared';
import { loadPipelineWithRetry } from '../lib/fetchPipeline';

export interface UsePipelineResult {
  applications: Application[];
  isLoading: boolean;
}

export function usePipeline(): UsePipelineResult {
  const [applications, setApplications] = useState<Application[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

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
  }, []);

  return { applications, isLoading };
}
