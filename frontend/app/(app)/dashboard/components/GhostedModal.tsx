'use client';

import type { Application } from '@/app/types/shared';
import { Modal } from '../../../components/ui/Modal';
import { formatSentDate } from '../../pipeline/lib/format';

export interface GhostedModalProps {
  open: boolean;
  onClose: () => void;
  applications: Application[];
  onOpenJob: (jobId: string) => void;
}

export function GhostedModal({
  open,
  onClose,
  applications,
  onOpenJob,
}: GhostedModalProps) {
  const ghosted = applications.filter((app) => app.status === 'ghosted');

  return (
    <Modal open={open} onClose={onClose} title="Ghosted companies" size="md">
      <p className="text-sm text-ws-muted">
        These companies have not replied since you applied. Follow up or move on.
      </p>

      {ghosted.length === 0 ? (
        <p
          data-testid="ghosted-empty"
          className="mt-6 rounded-xl border border-dashed border-ws-line p-6 text-center text-sm text-ws-muted"
        >
          No ghosted applications yet.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {ghosted.map((app) => (
            <li key={app.application_id}>
              <button
                type="button"
                data-testid="ghosted-company-row"
                onClick={() => {
                  onOpenJob(app.job_id);
                  onClose();
                }}
                className="flex w-full items-start justify-between gap-3 rounded-xl border border-ws-line bg-ws-paper px-4 py-3 text-left transition hover:border-ws-teal/40 hover:bg-ws-card"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ws-ink">{app.company}</p>
                  <p className="mt-0.5 text-xs text-ws-muted">{app.role_title}</p>
                </div>
                <span className="shrink-0 font-mono text-[10px] text-ws-muted">
                  {formatSentDate(app)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
