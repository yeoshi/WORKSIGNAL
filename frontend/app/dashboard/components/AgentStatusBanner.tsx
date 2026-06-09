'use client';

import type { AgentStatusSummary } from '../types';

/**
 * Agent status banner — surfaces scan activity at the top of the dashboard
 * (Req 13). Shows whether the agents are currently scanning, when the last
 * scan completed, and how many jobs are waiting for review.
 */

function formatRelative(iso: string | null): string {
  if (!iso) return 'never';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'unknown';
  const diffMs = Date.now() - then;
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export interface AgentStatusBannerProps {
  status: AgentStatusSummary;
}

export function AgentStatusBanner({ status }: AgentStatusBannerProps) {
  return (
    <section
      aria-label="Agent status"
      data-testid="agent-status-banner"
      className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-gray-200 bg-white p-5"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className={`inline-block h-3 w-3 rounded-full ${
            status.scanning ? 'animate-pulse bg-emerald-500' : 'bg-gray-300'
          }`}
        />
        <div>
          <p className="text-sm font-semibold text-gray-900">
            {status.scanning ? 'Agents are scanning…' : 'Agents are idle'}
          </p>
          <p className="text-xs text-gray-500">
            Last scan {formatRelative(status.last_scan_at)}
            {status.next_scan_at
              ? ` · next ${formatRelative(status.next_scan_at).replace(' ago', '')}`
              : ''}
          </p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-2xl font-bold text-gray-900">
          {status.jobs_in_review}
        </p>
        <p className="text-xs text-gray-500">jobs in review</p>
      </div>
    </section>
  );
}

export default AgentStatusBanner;
