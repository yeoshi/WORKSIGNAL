'use client';

import type { Application, ApplicationStatus } from '@worksignal/shared';
import type { ActionNeededItem } from '../types';
import { formatSentDate } from '../../pipeline/lib/format';
import { StatusBadge } from '../../pipeline/components/StatusBadge';
import { DecisionKanbanCard } from './DecisionKanbanCard';

const PIPELINE_COLUMNS: { id: ApplicationStatus; label: string }[] = [
  { id: 'sent', label: 'Sent' },
  { id: 'opened', label: 'Opened' },
  { id: 'callback', label: 'Callback' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'ghosted', label: 'Ghosted' },
];

const OTHER_STATUSES: ApplicationStatus[] = [
  'redirected_external',
  'needs_review',
  'delivery_failed',
];

export interface PipelineKanbanProps {
  applications: Application[];
  actionNeeded: ActionNeededItem[];
  isLoading?: boolean;
  onOpenJob: (jobId: string, opts: { showActions: boolean }) => void;
  onSend: (jobId: string) => Promise<void>;
  onSkip: (jobId: string) => Promise<void>;
  onSave: (jobId: string) => Promise<void>;
  onMarkSent: (jobId: string) => Promise<void>;
}

function groupApplications(applications: Application[]) {
  const groups = new Map<ApplicationStatus, Application[]>();
  for (const col of PIPELINE_COLUMNS) groups.set(col.id, []);
  const other: Application[] = [];

  for (const app of applications) {
    if (groups.has(app.status)) {
      groups.get(app.status)!.push(app);
    } else if (OTHER_STATUSES.includes(app.status)) {
      other.push(app);
    }
  }

  return { groups, other };
}

export function PipelineKanban({
  applications,
  actionNeeded,
  isLoading = false,
  onOpenJob,
  onSend,
  onSkip,
  onSave,
  onMarkSent,
}: PipelineKanbanProps) {
  const { groups, other } = groupApplications(applications);
  const totalCount = applications.length + actionNeeded.length;
  const isEmpty = totalCount === 0;

  if (isLoading && isEmpty) {
    return (
      <div
        data-testid="pipeline-kanban-loading"
        className="ws-card p-8 text-center text-sm text-ws-muted"
      >
        Loading your pipeline…
      </div>
    );
  }

  const pipelineColumns = [
    ...PIPELINE_COLUMNS,
    ...(other.length > 0
      ? [{ id: 'needs_review' as ApplicationStatus, label: 'Other' }]
      : []),
  ];

  return (
    <section
      id="pipeline"
      aria-label="Application pipeline"
      data-testid="pipeline-kanban"
      className="ws-card min-w-0 overflow-hidden"
    >
      <div className="border-b border-ws-line px-4 py-4 sm:px-5">
        <h2 className="font-wordmark text-lg font-semibold text-ws-ink">
          Pipeline
        </h2>
        <p className="mt-0.5 text-sm text-ws-muted">
          Tracking {totalCount} application{totalCount === 1 ? '' : 's'}
        </p>
      </div>
      <div className="grid min-w-0 grid-cols-2 gap-2 p-3 sm:grid-cols-3 sm:gap-2.5 sm:p-4 md:grid-cols-4 lg:grid-cols-[minmax(0,1.35fr)_repeat(6,minmax(0,1fr))] lg:gap-2">
        <div
          className="flex min-w-0 flex-col rounded-xl bg-ws-paper/80"
          data-testid="kanban-column-needs_decision"
        >
          <div className="flex items-start justify-between gap-1 px-2 py-2 sm:px-2.5">
            <span className="font-mono text-[9px] uppercase leading-tight tracking-[0.1em] text-ws-muted lg:text-[10px]">
              Needs Decision
            </span>
            <span className="rounded-full bg-ws-line/60 px-2 py-0.5 text-xs font-medium text-ws-ink">
              {actionNeeded.length}
            </span>
          </div>
          <div className="flex flex-1 flex-col gap-2 px-2 pb-2">
            {actionNeeded.length === 0 ? (
              <p
                data-testid="kanban-decision-empty"
                className="rounded-lg border border-dashed border-ws-line p-3 text-center text-xs text-ws-muted"
              >
                All caught up
              </p>
            ) : (
              actionNeeded.map((item) => (
                <DecisionKanbanCard
                  key={`${item.job_id}:${item.decision}`}
                  item={item}
                  onOpenJob={(jobId) =>
                    onOpenJob(jobId, { showActions: true })
                  }
                  onSend={onSend}
                  onSkip={onSkip}
                  onSave={onSave}
                  onMarkSent={onMarkSent}
                />
              ))
            )}
          </div>
        </div>

        {pipelineColumns.map((col) => {
          const items =
            col.label === 'Other' ? other : (groups.get(col.id) ?? []);
          return (
            <div
              key={col.id}
              className="flex min-w-0 flex-col rounded-xl bg-ws-paper/80"
              data-testid={`kanban-column-${col.id}`}
            >
              <div className="flex items-center justify-between gap-1 px-2 py-2 sm:px-2.5">
                <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-ws-muted lg:text-[10px]">
                  {col.label}
                </span>
                <span className="rounded-full bg-ws-line/60 px-2 py-0.5 text-xs font-medium text-ws-ink">
                  {items.length}
                </span>
              </div>
              <div className="flex flex-1 flex-col gap-2 px-2 pb-2">
                {items.map((app) => (
                  <button
                    key={app.application_id}
                    type="button"
                    data-testid="kanban-card"
                    onClick={() =>
                      onOpenJob(app.job_id, { showActions: false })
                    }
                    className="min-w-0 rounded-lg border border-ws-line bg-ws-card p-2.5 text-left shadow-sm transition hover:border-ws-teal/40 hover:shadow-md sm:p-3"
                  >
                    <p className="truncate text-sm font-semibold text-ws-ink">
                      {app.company}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-ws-muted">
                      {app.role_title}
                    </p>
                    <div className="mt-2 flex min-w-0 items-center justify-between gap-1">
                      <span className="min-w-0 truncate font-mono text-[10px] text-ws-muted">
                        {formatSentDate(app)}
                      </span>
                      <StatusBadge status={app.status} className="shrink-0" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
