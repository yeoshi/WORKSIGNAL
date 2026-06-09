'use client';

import { useState } from 'react';
import type { ActionNeededItem } from '../types';

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
}: DecisionKanbanCardProps) {
  const [busy, setBusy] = useState(false);
  const hasEmail = item.has_employer_email ?? false;

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
      <p className="text-sm font-semibold leading-snug text-ws-ink">{item.company}</p>
      <p className="mt-0.5 text-xs leading-snug text-ws-muted">{item.role_title}</p>
      <p className="mt-2 text-xs leading-snug text-ws-muted">{item.reason}</p>

      <div
        className="mt-3 flex flex-wrap gap-1.5"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {hasEmail ? (
          <>
            <button
              type="button"
              data-testid="decision-action-send"
              disabled={busy}
              onClick={() => run(() => onSend(item.job_id))}
              className="rounded-md bg-ws-teal px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-ws-teal-mid disabled:opacity-50"
            >
              Send
            </button>
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
          </>
        ) : (
          <>
            <button
              type="button"
              data-testid="decision-action-review"
              disabled={busy}
              onClick={() => onOpenJob(item.job_id)}
              className="rounded-md bg-indigo-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              Review
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
          </>
        )}
      </div>
    </div>
  );
}

export default DecisionKanbanCard;
