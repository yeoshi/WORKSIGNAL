'use client';

import { useState } from 'react';
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
  onClearDashboard?: () => Promise<void>;
}

export function DashboardHeader({
  agentStatus,
  issueCount,
  onOpenIssues,
  onRunAgent = () => {},
  agentRunning = false,
  onClearDashboard,
}: DashboardHeaderProps) {
  const { data: session } = useSession();
  const firstName = getFirstName(session?.user?.name);
  const [clearState, setClearState] = useState<'idle' | 'confirm' | 'clearing'>('idle');

  async function handleClearClick() {
    if (clearState === 'idle') {
      setClearState('confirm');
      // Auto-reset if user doesn't confirm within 3 seconds.
      setTimeout(() => setClearState((s) => (s === 'confirm' ? 'idle' : s)), 3000);
      return;
    }
    if (clearState === 'confirm' && onClearDashboard) {
      setClearState('clearing');
      try {
        await onClearDashboard();
      } finally {
        setClearState('idle');
      }
    }
  }

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
        {/* Clear Dashboard */}
        {onClearDashboard && (
          <button
            type="button"
            onClick={() => { void handleClearClick(); }}
            disabled={clearState === 'clearing' || agentRunning}
            className={[
              'inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition',
              clearState === 'confirm'
                ? 'border-red-400 bg-red-50 text-red-600 hover:bg-red-100'
                : clearState === 'clearing'
                  ? 'cursor-not-allowed border-ws-line bg-ws-card text-ws-muted'
                  : 'border-ws-line bg-ws-card text-ws-muted hover:border-red-300 hover:text-red-500',
            ].join(' ')}
            aria-label="Clear all jobs and verdicts from dashboard"
          >
            {clearState === 'clearing' ? (
              <>
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Clearing…
              </>
            ) : clearState === 'confirm' ? (
              <>
                <svg aria-hidden className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                Confirm clear?
              </>
            ) : (
              <>
                <svg aria-hidden className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Clear
              </>
            )}
          </button>
        )}

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
