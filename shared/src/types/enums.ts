/**
 * Shared enums / string-literal union types used across WORKSIGNAL.
 *
 * These mirror the design document's data models and TypeScript contracts.
 * String-literal unions are preferred over TS `enum` so the values are
 * structurally identical to the persisted DynamoDB representations.
 */

/** Career stage selected during onboarding (Req 3, Users table). */
export type CareerStage =
  | 'fresh_grad'
  | 'early_career'
  | 'mid_career'
  | 'senior'
  | 'career_switcher';

/** Residency / work-authorisation status (Req 3, Users table). */
export type ResidencyStatus = 'citizen' | 'pr' | 'ep_holder' | 'need_sponsorship';

/**
 * The six priority factors a user ranks during onboarding (Req 4).
 * A valid ranking is a permutation containing each value exactly once.
 */
export type PriorityFactor =
  | 'salary'
  | 'growth'
  | 'balance'
  | 'brand'
  | 'purpose'
  | 'stability';

/** The complete, canonical set of priority factors (used by validation). */
export const PRIORITY_FACTORS: readonly PriorityFactor[] = [
  'salary',
  'growth',
  'balance',
  'brand',
  'purpose',
  'stability',
] as const;

/** Employment types a user may accept as a non-negotiable (Req 5/9). */
export type EmploymentType = 'full_time' | 'contract' | 'part_time';

/** Work-arrangement preference (Req 5/8/9). */
export type WorkArrangement = 'any' | 'hybrid_remote' | 'fully_remote';

/** The four debate agents (Req 10). */
export type AgentName = 'ambition' | 'realism' | 'risk' | 'opportunity';

/** All debate agents in canonical order. */
export const AGENT_NAMES: readonly AgentName[] = [
  'ambition',
  'realism',
  'risk',
  'opportunity',
] as const;

/**
 * The Master Orchestrator's decision class (Req 12).
 * Computed deterministically from the apply-equivalent verdict count.
 */
export type Decision =
  | 'apply_consensus'
  | 'apply_with_caveat'
  | 'skip_consensus'
  | 'deadlock_escalate'
  | 'veto_skip';

/**
 * Pipeline status of an application (Req 16, 17, 18).
 * Exactly one value is ever active for an application.
 */
export type ApplicationStatus =
  | 'sent'
  | 'opened'
  | 'callback'
  | 'rejected'
  | 'ghosted'
  | 'redirected_external'
  | 'needs_review'
  | 'delivery_failed';

/** The complete set of valid application statuses (used by validation). */
export const APPLICATION_STATUSES: readonly ApplicationStatus[] = [
  'sent',
  'opened',
  'callback',
  'rejected',
  'ghosted',
  'redirected_external',
  'needs_review',
  'delivery_failed',
] as const;

/** Classification label for an inbound reply email (Req 18). */
export type ReplyLabel = 'acknowledgement' | 'callback' | 'rejection' | 'other';

/**
 * Keys identifying which non-negotiable a job violated in the Pre_Filter
 * (Req 8/9). Returned in {@link FilterResult} when a job is discarded.
 */
export type NonNegotiableKey =
  | 'min_salary'
  | 'employment_type'
  | 'work_arrangement'
  | 'location'
  | 'custom'
  | 'ep_salary_floor'
  | 'ep_sponsorship';

/** Lifecycle state of a Filter_Relaxation_Suggestion (Req 9.5-9.8). */
export type ApprovalState = 'pending' | 'approved' | 'rejected' | 'expired';

/**
 * The non-negotiable a relaxation suggestion targets (Req 9.6).
 * Coarser than {@link NonNegotiableKey} — groups EP-related checks.
 */
export type RelaxationTarget =
  | 'min_salary'
  | 'employment_type'
  | 'work_arrangement'
  | 'custom'
  | 'ep_related';

/** Severity of a Risk_Agent red flag (Req 10.4). */
export type RedFlagSeverity = 'high' | 'medium' | 'low';

/** Resource type within a Growth roadmap week (Req 19.3). */
export type RoadmapResourceType = 'course' | 'project' | 'event' | 'certification';

/** Ordering tier for a network suggestion (Req 20.3). */
export type NetworkConnectionType = 'alumni' | 'community' | 'cold';

/** Lifecycle status of a tracked skill gap (SkillGaps table). */
export type SkillGapStatus =
  | 'identified'
  | 'roadmap_created'
  | 'in_progress'
  | 'completed';
