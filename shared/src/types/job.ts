/**
 * Job discovery and pre-filter types.
 *
 * Mirrors the Jobs table schema and the Pre_Filter contract (Req 7, 8, 9).
 */

import type { NonNegotiableKey } from './enums.js';

/**
 * A job discovered by the Opportunity_Scanner and persisted in the Jobs
 * table (Req 7.2). `Job` is an alias used by the debate-stage contracts.
 */
export interface DiscoveredJob {
  job_id: string;
  user_id: string;
  company: string;
  role_title: string;
  salary_min: number;
  salary_max: number;
  /** Full job-description text. */
  jd_text: string;
  /** ISO timestamp of when the job was posted. */
  posted_at: string;
  source_url: string;
  employer_email: string | null;
  /** Used by the Pre_Filter (Req 9.1). */
  employment_type: string;
  /** Used by the Pre_Filter (Req 9.1). */
  work_arrangement: string;
  /** Used by the Singapore geo filter (Req 8.1, 8.2). */
  location: string;
  /** Whether the listing signals EP sponsorship availability (Req 9.4). */
  ep_sponsorship_signal: boolean;
  /** MCF listing duration in days, for the FCF 14-day rule (Req 10.7). */
  mcf_listing_days: number;
  /** ISO timestamp of when this job was scanned. */
  scanned_at: string;
}

/** Alias used throughout the debate-stage contracts (Req 10+). */
export type Job = DiscoveredJob;

/**
 * Result of a Pre_Filter evaluation (Req 8/9). Pure function output:
 * a job passes only if it violates none of the user's non-negotiables.
 */
export type FilterResult =
  | { pass: true }
  | { pass: false; violated: NonNegotiableKey[] };
