'use client';

import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import type { PendingSendItem } from '../types';

export interface PendingSendKanbanCardProps {
  item: PendingSendItem;
  onOpenJob: (jobId: string) => void;
  onMarkSent: (jobId: string) => Promise<void>;
  onSkip: (jobId: string) => Promise<void>;
}

export function PendingSendKanbanCard({
  item,
  onOpenJob,
  onMarkSent,
  onSkip,
}: PendingSendKanbanCardProps) {
  const [busy, setBusy] = useState(false);

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
      data-testid="pending-send-kanban-card"
      role="button"
      tabIndex={0}
      onClick={() => onOpenJob(item.job_id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpenJob(item.job_id);
        }
      }}
      className="min-w-0 cursor-pointer rounded-lg border border-amber-200 bg-amber-50/40 p-2.5 text-left shadow-sm transition hover:border-amber-300 hover:shadow-md sm:p-3"
    >
      <p className="text-sm font-semibold leading-snug text-ws-ink">{item.company}</p>
      <p className="mt-0.5 text-xs leading-snug text-ws-muted">{item.role_title}</p>
      <p className="mt-2 text-xs leading-snug text-amber-800/80">
        Agents approved — apply on the job site (no hiring email found).
      </p>

      <div
        className="mt-3 flex flex-wrap gap-1.5"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        {item.source_url ? (
          <a
            href={item.source_url}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="pending-send-apply-link"
            onClick={(event) => event.stopPropagation()}
            className="inline-flex items-center gap-1 rounded-md bg-ws-teal px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-ws-teal-mid"
          >
            <ExternalLink size={12} aria-hidden />
            Apply on site
          </a>
        ) : null}
        <button
          type="button"
          data-testid="pending-send-mark-sent"
          disabled={busy}
          onClick={() => run(() => onMarkSent(item.job_id))}
          className="rounded-md border border-ws-line bg-ws-card px-2.5 py-1 text-[11px] font-semibold text-ws-ink hover:bg-ws-paper disabled:opacity-50"
        >
          Mark sent
        </button>
        <button
          type="button"
          data-testid="pending-send-skip"
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
