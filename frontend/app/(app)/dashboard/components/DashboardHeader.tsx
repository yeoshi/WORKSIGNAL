'use client';

import { useSession } from 'next-auth/react';
import type { AgentStatusSummary } from '../types';
import { formatRelativeFuture, formatRelativePast } from '../lib/formatRelative';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function getFirstName(name?: string | null): string {
  if (!name) return 'there';
  return name.split(' ')[0] ?? 'there';
}

export interface DashboardHeaderProps {
  agentStatus: AgentStatusSummary;
  issueCount: number;
  onOpenIssues: () => void;
  onRunAgent?: () => void;
  agentRunning?: boolean;
}

export function DashboardHeader({
  agentStatus,
  issueCount,
  onOpenIssues,
  onRunAgent = () => {},
  agentRunning = false,
}: DashboardHeaderProps) {
  const { data: session } = useSession();
  const firstName = getFirstName(session?.user?.name);

  return (
    <header
      className="flex min-w-0 flex-wrap items-start justify-between gap-3 sm:items-center sm:gap-4"
      data-testid="dashboard-header"
    >
      <div className="min-w-0">
        <h1 className="font-wordmark text-xl font-semibold text-ws-ink sm:text-2xl">
          Dashboard
        </h1>
        <p
          className="mt-0.5 text-sm text-ws-muted"
          data-testid="dashboard-greeting"
        >
          {getGreeting()},{' '}
          <span className="font-medium text-ws-ink">{firstName}</span>!
        </p>
      </div>

      <div className="flex min-w-0 flex-wrap items-center justify-end gap-3 sm:gap-4">
        {/* Run WorkSignal Agent */}
        <button
          type="button"
          data-testid="run-agent-button"
          onClick={onRunAgent}
          disabled={agentRunning}
          className={[
            'inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition',
            agentRunning
              ? 'cursor-not-allowed border-ws-teal/40 bg-ws-teal/10 text-ws-teal'
              : 'border-ws-line bg-ws-card text-ws-ink hover:border-ws-teal/50 hover:bg-ws-paper',
          ].join(' ')}
          aria-label="Run WorkSignal agent pipeline"
        >
          {agentRunning ? (
            <>
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-ws-teal border-t-transparent" />
              Running…
            </>
          ) : (
            <>
              <svg aria-hidden className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 3l14 9-14 9V3z" />
              </svg>
              Run Agent
            </>
          )}
        </button>

        <div
          className="flex min-w-0 max-w-full items-center gap-2"
          data-testid="agent-status-inline"
        >
          <span
            aria-hidden
            className={[
              'h-2.5 w-2.5 shrink-0 rounded-full',
              agentStatus.scanning ? 'bg-ws-teal animate-pulse' : 'bg-ws-muted',
            ].join(' ')}
          />
          <p className="min-w-0 font-mono text-[11px] leading-snug text-ws-muted sm:text-xs">
            <span data-testid="agent-last-scan">
              Last scan {formatRelativePast(agentStatus.last_scan_at)}
            </span>
            {agentStatus.next_scan_at ? (
              <>
                {' · '}
                <span data-testid="agent-next-scan">
                  Next run {formatRelativeFuture(agentStatus.next_scan_at)}
                </span>
              </>
            ) : null}
          </p>
        </div>

        {issueCount > 0 && (
          <button
            type="button"
            data-testid="dashboard-issues-button"
            onClick={onOpenIssues}
            className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-ws-line bg-ws-card text-ws-ink transition hover:border-ws-teal/40 hover:bg-ws-paper"
            aria-label={`${issueCount} issue${issueCount === 1 ? '' : 's'} need attention`}
          >
            <svg
              aria-hidden
              className="h-5 w-5 text-amber-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <span
              data-testid="dashboard-issues-badge"
              className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-600 px-1 text-[10px] font-semibold text-white"
            >
              {issueCount}
            </span>
          </button>
        )}
      </div>
    </header>
  );
}

export default DashboardHeader;
