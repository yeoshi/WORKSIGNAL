'use client';

/**
 * Pipeline view (Req 17).
 *
 * Shows every application's Company / Role / Sent date / Status with status
 * badges (17.1, 17.3). Application data is loaded with a silent background
 * retry on failure (17.2). Selecting a row opens the application's original
 * agent debate (17.4) by navigating to the job's detail/debate route.
 */

import { useRouter } from 'next/navigation';
import type { Application } from '@worksignal/shared';
import { usePipeline } from './hooks/usePipeline';
import { PipelineTable } from './components/PipelineTable';

export default function PipelinePage() {
  const router = useRouter();
  const { applications, isLoading } = usePipeline();

  const openDebate = (application: Application) => {
    // The Job Detail view renders the original agent debate for this job
    // (Req 17.4). Navigate by job id so the debate associated with the
    // application is shown.
    router.push(`/jobs/${application.job_id}`);
  };

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Pipeline</h1>
        <p className="mt-1 text-sm text-gray-600">
          Every application you&apos;ve sent and where it stands.
        </p>
      </header>

      <PipelineTable
        applications={applications}
        isLoading={isLoading}
        onRowSelect={openDebate}
      />
    </main>
  );
}
