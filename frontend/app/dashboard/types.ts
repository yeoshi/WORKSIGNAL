/**
 * View-model types for the main dashboard (task 21.3).
 *
 * These describe the shape returned by the dashboard BFF endpoint
 * (`GET /api/dashboard`, wired in task 24.1). They compose the shared
 * design contracts from `@worksignal/shared` into a single payload the
 * dashboard renders. Until the API exists, the dashboard tolerates its
 * absence with loading / empty states.
 */

import type {
  ApplicationStatus,
  Decision,
  Filter_Relaxation_Suggestion,
  RecalibrationLogEntry,
} from '@worksignal/shared';

/** Agent status banner data — scan activity (Req 13). */
export interface AgentStatusSummary {
  /** True while a scan / debate run is in progress. */
  scanning: boolean;
  /** ISO timestamp of the last completed scan, or null if none yet. */
  last_scan_at: string | null;
  /** ISO timestamp of the next scheduled scan, or null if unknown. */
  next_scan_at: string | null;
  /** Number of jobs currently queued for the user to review. */
  jobs_in_review: number;
}

/**
 * An item surfaced in the "action needed" cards. Covers `deadlock_escalate`
 * ties that need the user to break them (Req 13.2) and apply-equivalent
 * decisions that require explicit confirmation (Req 12.6).
 */
export interface ActionNeededItem {
  job_id: string;
  application_id: string | null;
  company: string;
  role_title: string;
  decision: Decision;
  /** True when low realism forces confirmation on an apply decision. */
  user_action_required: boolean;
  /** Human-readable explanation of why the user must act. */
  reason: string;
  created_at: string;
}

/** Pipeline summary — counts of applications by status (Req 17). */
export interface PipelineSummary {
  total: number;
  by_status: Partial<Record<ApplicationStatus, number>>;
}

/** A surfaced Growth_Agent skill gap (Req 19). */
export interface GrowthCardItem {
  skill: string;
  projected_match_improvement: string;
  times_flagged: number;
}

/** A surfaced Network_Agent target company (Req 20). */
export interface NetworkCardItem {
  company: string;
  application_count: number;
  suggestion_count: number;
}

/** Intelligence card — callback rate and latest recalibration (Req 21). */
export interface IntelligenceSummary {
  /** Most recent weekly callback rate (0-1), or null if no data yet. */
  callback_rate: number | null;
  latest_recalibration: RecalibrationLogEntry | null;
}

/** The complete dashboard payload returned by `GET /api/dashboard`. */
export interface DashboardData {
  agent_status: AgentStatusSummary;
  action_needed: ActionNeededItem[];
  pipeline: PipelineSummary;
  growth: GrowthCardItem[];
  network: NetworkCardItem[];
  intelligence: IntelligenceSummary;
  relaxation_suggestions: Filter_Relaxation_Suggestion[];
}
