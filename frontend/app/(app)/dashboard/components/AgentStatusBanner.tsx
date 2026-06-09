'use client';

import type { AgentStatusSummary } from '../types';
import { Badge } from '../../../components/ui/Badge';

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
      className="ws-card flex flex-wrap items-center justify-between gap-4 p-5"
    >
      <div className="flex items-center gap-4">
        <div className="relative">
          <span
            aria-hidden
            className={[
              'inline-flex h-10 w-10 items-center justify-center rounded-full border-2',
              status.scanning
                ? 'border-ws-teal bg-ws-teal/15 animate-pulse-ring'
                : 'border-ws-line bg-ws-paper',
            ].join(' ')}
          >
            <span
              className={[
                'h-3 w-3 rounded-full',
                status.scanning ? 'bg-ws-teal' : 'bg-ws-muted',
              ].join(' ')}
            />
          </span>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-ws-ink">
              {status.scanning ? 'Agents are scanning…' : 'Agents are idle'}
            </p>
            <Badge variant={status.scanning ? 'teal' : 'muted'}>
              {status.scanning ? 'Live' : 'Idle'}
            </Badge>
          </div>
          <p className="mt-0.5 font-mono text-xs text-ws-muted">
            Last scan {formatRelative(status.last_scan_at)}
            {status.next_scan_at
              ? ` · next in ${formatRelative(status.next_scan_at)}`
              : ''}
          </p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-3xl font-bold text-ws-ink">{status.jobs_in_review}</p>
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ws-muted">
          jobs in review
        </p>
      </div>
    </section>
  );
}

export default AgentStatusBanner;
