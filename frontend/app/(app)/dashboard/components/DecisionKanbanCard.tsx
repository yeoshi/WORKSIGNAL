'use client';

import { useState } from 'react';
import type { ActionNeededItem } from '../types';

function badgeLabel(item: ActionNeededItem): string {
  if (item.decision === 'deadlock_escalate') return 'Tie — break it';
  if (item.user_action_required) return 'Confirm to apply';
  return 'Needs review';
}

export interface DecisionKanbanCardProps {
  item: ActionNeededItem;
  onOpenJob: (jobId: string) => void;
  onSend: (jobId: string) => Promise<void>;
  onSkip: (jobId: string) => Promise<void>;
  onSave: (jobId: string) => Promise<void>;
  onMarkSent: (jobId: string) => Promise<void>;
}

export function DecisionKanbanCard({
  item,
  onOpenJob,
  onSend,
  onSkip,
  onSave,
  onMarkSent,
}: DecisionKanbanCardProps) {
  const [busy, setBusy] = useState(false);
  const hasEmail = item.has_employer_email ?? false;
  const sourceUrl = item.source_url ?? '#';

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      data-testid="decision-kanban-card"
      role="button"
      tabIndex={0}
      onClick={() => onOpenJob(item.job_id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpenJob(item.job_id);
        }
      }}
      className="min-w-0 cursor-pointer rounded-lg border border-ws-line bg-ws-card p-2.5 text-left shadow-sm transition hover:border-ws-teal/40 hover:shadow-md sm:p-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ws-ink">{item.company}</p>
          <p className="mt-0.5 truncate text-xs text-ws-muted">{item.role_title}</p>
        </div>
        <span className="shrink-0 rounded-full bg-ws-teal/15 px-2 py-0.5 text-[10px] font-medium text-ws-teal-mid">
          {badgeLabel(item)}
        </span>
      </div>
      <p className="mt-2 line-clamp-2 text-xs text-ws-muted">{item.reason}</p>

      <div
        className="mt-3 flex flex-wrap gap-1.5"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {hasEmail ? (
          <button
            type="button"
            data-testid="decision-action-send"
            disabled={busy}
            onClick={() => run(() => onSend(item.job_id))}
            className="rounded-md bg-ws-teal px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-ws-teal-mid disabled:opacity-50"
          >
            Send
          </button>
        ) : (
          <>
            <a
              data-testid="decision-action-redirect"
              href={sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-md bg-ws-teal px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-ws-teal-mid"
            >
              Apply on site
            </a>
            <button
              type="button"
              data-testid="decision-action-done"
              disabled={busy}
              onClick={() => run(() => onMarkSent(item.job_id))}
              className="rounded-md border border-ws-teal px-2.5 py-1 text-[11px] font-semibold text-ws-teal-mid hover:bg-ws-teal/10 disabled:opacity-50"
            >
              Done sending
            </button>
          </>
        )}
        <button
          type="button"
          data-testid="decision-action-save"
          disabled={busy}
          onClick={() => run(() => onSave(item.job_id))}
          className="rounded-md border border-ws-line px-2.5 py-1 text-[11px] font-semibold text-ws-ink hover:bg-ws-paper disabled:opacity-50"
        >
          Save
        </button>
        <button
          type="button"
          data-testid="decision-action-skip"
          disabled={busy}
          onClick={() => run(() => onSkip(item.job_id))}
          className="rounded-md px-2.5 py-1 text-[11px] font-semibold text-ws-muted hover:bg-ws-paper disabled:opacity-50"
        >
          Skip
        </button>
      </div>
    </div>
  );
}

export default DecisionKanbanCard;
