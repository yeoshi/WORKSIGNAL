'use client';

import { useCallback, useEffect, useState } from 'react';
import { JobDetailView } from '../components/JobDetailView';
import type { JobDetailAction, JobDetailData } from '../components/jobDetailTypes';

interface JobDetailResponse extends JobDetailData {
  /** Optional pre-signed resume URL from the BFF (task 24.1). */
  resumeUrl?: string | null;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: JobDetailResponse };

/**
 * Job Detail hero screen route (Req 15). Fetches the assembled debate +
 * materials payload from the BFF (`/api/jobs/[jobId]`, wired in task 24.1)
 * and tolerates the API not yet existing by showing graceful states.
 */
export default function JobDetailPage({ params }: { params: { jobId: string } }) {
  const { jobId } = params;
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, {
          headers: { accept: 'application/json' },
        });
        if (!res.ok) {
          throw new Error(`Request failed (${res.status})`);
        }
        const data = (await res.json()) as JobDetailResponse;
        if (!cancelled) setState({ status: 'ready', data });
      } catch (err) {
        if (!cancelled) {
          setState({
            status: 'error',
            message:
              err instanceof Error ? err.message : 'Could not load this job.',
          });
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  const handleAction = useCallback(
    async (action: JobDetailAction, coverLetter: string) => {
      try {
        // Send uses the edited cover-letter text verbatim (Req 15.6).
        await fetch(`/api/jobs/${encodeURIComponent(jobId)}/${action}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ coverLetter }),
        });
      } catch {
        // Endpoints are wired in task 24.1; tolerate their absence here.
      }
    },
    [jobId],
  );

  if (state.status === 'loading') {
    return (
      <main
        data-testid="job-detail-loading"
        className="mx-auto max-w-4xl p-6 text-sm text-gray-500"
      >
        Loading job…
      </main>
    );
  }

  if (state.status === 'error') {
    return (
      <main
        data-testid="job-detail-error"
        className="mx-auto max-w-4xl p-6 text-sm text-gray-600"
      >
        We couldn’t load this job right now. {state.message}
      </main>
    );
  }

  return (
    <JobDetailView
      data={state.data}
      resumeUrl={state.data.resumeUrl ?? null}
      onAction={handleAction}
    />
  );
}
