import type { Job, MasterDecision, Materials, VerdictSet } from '@worksignal/shared';

/**
 * The full data payload backing the Job Detail hero screen.
 * Assembled by the BFF/API route (wired in task 24.1) and consumed by the
 * presentational {@link JobDetailView}.
 */
export interface JobDetailData {
  job: Job;
  verdicts: VerdictSet;
  decision: MasterDecision;
  materials: Materials;
  /** The cover-letter text to seed the editable field (Req 15.4). */
  coverLetter: string;
}

/** The action a user can trigger from the action bar (Req 15.5). */
export type JobDetailAction = 'send' | 'skip' | 'save';

/** Format a monthly SGD salary range for the job header (Req 15.1). */
export function formatSalary(min: number, max: number): string {
  const fmt = (n: number) =>
    new Intl.NumberFormat('en-SG', {
      style: 'currency',
      currency: 'SGD',
      maximumFractionDigits: 0,
    }).format(n);

  if (!min && !max) return 'Salary not disclosed';
  if (min && max && min !== max) return `${fmt(min)} – ${fmt(max)} / month`;
  return `${fmt(max || min)} / month`;
}

/**
 * Format an ISO posting timestamp as a relative "posted" string for the
 * job header (Req 15.1). Falls back to the raw value if unparseable.
 */
export function formatPostingTime(postedAt: string, now: Date = new Date()): string {
  const posted = new Date(postedAt);
  if (Number.isNaN(posted.getTime())) return postedAt;

  const diffMs = now.getTime() - posted.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return 'Posted today';
  if (diffDays === 1) return 'Posted 1 day ago';
  if (diffDays < 30) return `Posted ${diffDays} days ago`;

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths === 1) return 'Posted 1 month ago';
  return `Posted ${diffMonths} months ago`;
}
