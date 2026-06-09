'use client';

import { JobDetailView } from '../components/JobDetailView';
import { useJobDetail } from '../hooks/useJobDetail';

/**
 * Job Detail hero screen route (Req 15). Fetches the assembled debate +
 * materials payload from the BFF (`/api/jobs/[jobId]`, wired in task 24.1)
 * and tolerates the API not yet existing by showing graceful states.
 */
export default function JobDetailPage({ params }: { params: { jobId: string } }) {
  const { jobId } = params;
  const { state, handleAction } = useJobDetail(jobId, true);

  if (state.status === 'loading' || state.status === 'idle') {
    return (
      <main
        data-testid="job-detail-loading"
        className="mx-auto min-w-0 max-w-4xl overflow-x-hidden p-4 text-sm text-gray-500 sm:p-6"
      >
        Loading job…
      </main>
    );
  }

  if (state.status === 'error') {
    return (
      <main
        data-testid="job-detail-error"
        className="mx-auto min-w-0 max-w-4xl overflow-x-hidden p-4 text-sm text-gray-600 sm:p-6"
      >
        We couldn&apos;t load this job right now. {state.message}
      </main>
    );
  }

  return (
    <JobDetailView
      data={state.data}
      resumeUrl={state.resumeUrl}
       onAction={handleAction}
    />
  );
}
