/**
 * Filter_Relaxation_Suggestion type (Req 9.5-9.8).
 *
 * A proposal with an explicit approval state. It never mutates a user's
 * non-negotiables until the user explicitly approves it.
 */

import type { ApprovalState, RelaxationTarget } from './enums.js';

/**
 * A suggestion to relax one non-negotiable, derived from a scan run in
 * which every discovered job was discarded (Req 9.6).
 *
 * Named with underscores to match the design document's contract name.
 */
export interface Filter_Relaxation_Suggestion {
  suggestion_id: string;
  user_id: string;
  created_at: string;
  /** The scan run in which all jobs were discarded (Req 9.6). */
  scan_run_id: string;
  target_non_negotiable: RelaxationTarget;
  current_value: unknown;
  proposed_value: unknown;
  /** e.g. "8 of 12 scanned jobs would pass" (Req 9.6). */
  rationale: string;
  evidence_job_ids: string[];
  /** Non-negotiables change only on transition to `approved` (Req 9.7, 9.8). */
  approval_state: ApprovalState;
}
