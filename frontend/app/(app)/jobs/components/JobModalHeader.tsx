import type { Job } from '@worksignal/shared';
import { formatPostingTime, formatSalary } from './jobDetailTypes';

export interface JobModalHeaderProps {
  job: Job;
}

export function JobModalHeader({ job }: JobModalHeaderProps) {
  return (
    <div data-testid="job-modal-header">
      <p className="font-wordmark text-lg font-semibold leading-snug text-ws-ink">
        {job.company}
        <span className="mx-2 text-ws-line" aria-hidden>
          ·
        </span>
        {job.role_title}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-ws-muted">
        <span data-testid="job-modal-salary" className="font-medium text-ws-ink">
          {formatSalary(job.salary_min, job.salary_max)}
        </span>
        <span aria-hidden className="text-ws-line">
          ·
        </span>
        <span data-testid="job-modal-posting-time">{formatPostingTime(job.posted_at)}</span>
        {job.location ? (
          <>
            <span aria-hidden className="text-ws-line">
              ·
            </span>
            <span>{job.location}</span>
          </>
        ) : null}
      </div>
    </div>
  );
}
