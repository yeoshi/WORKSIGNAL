'use client';

import type { ApplicationStatus } from '@worksignal/shared';
import type { PipelineSummary } from '../types';

/**
 * Pipeline summary card (Req 17) — a compact roll-up of application counts
 * by status, with a link through to the full Pipeline view.
 */

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  sent: 'Sent',
  opened: 'Opened',
  callback: 'Callbacks',
  rejected: 'Rejected',
  ghosted: 'Ghosted',
  redirected_external: 'Redirected',
  needs_review: 'Needs review',
  delivery_failed: 'Delivery failed',
};

const STATUS_ORDER: ApplicationStatus[] = [
  'sent',
  'opened',
  'callback',
  'rejected',
  'ghosted',
  'redirected_external',
  'needs_review',
  'delivery_failed',
];

export interface PipelineSummaryCardProps {
  pipeline: PipelineSummary;
}

export function PipelineSummaryCard({ pipeline }: PipelineSummaryCardProps) {
  const visible = STATUS_ORDER.filter(
    (status) => (pipeline.by_status[status] ?? 0) > 0,
  );

  return (
    <section
      aria-label="Pipeline summary"
      data-testid="pipeline-summary"
      className="rounded-lg border border-gray-200 bg-white p-5"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Pipeline</h2>
        <a href="/pipeline" className="text-sm font-medium text-blue-600">
          View all
        </a>
      </div>
      <p className="mt-2 text-3xl font-bold text-gray-900">{pipeline.total}</p>
      <p className="text-xs text-gray-500">applications tracked</p>

      {visible.length > 0 && (
        <ul className="mt-4 grid grid-cols-2 gap-2">
          {visible.map((status) => (
            <li
              key={status}
              className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2 text-sm"
            >
              <span className="text-gray-600">{STATUS_LABELS[status]}</span>
              <span className="font-semibold text-gray-900">
                {pipeline.by_status[status] ?? 0}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default PipelineSummaryCard;
