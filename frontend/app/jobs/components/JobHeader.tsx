import type { Job } from '@worksignal/shared';
import { formatPostingTime, formatSalary } from './jobDetailTypes';

export interface JobHeaderProps {
  job: Job;
}

/**
 * Job header showing company, role, salary, and posting time (Req 15.1).
 */
export function JobHeader({ job }: JobHeaderProps) {
  return (
    <header
      data-testid="job-header"
      className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
    >
      <p className="text-sm font-medium uppercase tracking-wide text-gray-500">
        {job.company}
      </p>
      <h1 className="mt-1 text-3xl font-bold text-gray-900">{job.role_title}</h1>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600">
        <span data-testid="job-salary" className="font-medium text-gray-900">
          {formatSalary(job.salary_min, job.salary_max)}
        </span>
        <span aria-hidden className="text-gray-300">
          •
        </span>
        <span data-testid="job-posting-time">{formatPostingTime(job.posted_at)}</span>
        {job.location ? (
          <>
            <span aria-hidden className="text-gray-300">
              •
            </span>
            <span>{job.location}</span>
          </>
        ) : null}
      </div>
    </header>
  );
}
