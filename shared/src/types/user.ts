/**
 * User profile, onboarding, calibration, and configuration types.
 *
 * Mirrors the Users table schema and the Onboarding_Service contract in the
 * design document (Req 1-6). Data-model fields use snake_case to match the
 * persisted DynamoDB representation.
 */

import type {
  CareerStage,
  EmploymentType,
  PriorityFactor,
  ResidencyStatus,
  WorkArrangement,
} from './enums.js';

/** Structured profile extracted from a resume by the Resume_Parser (Req 2.2). */
export interface ParsedProfile {
  current_role: string;
  years_experience: number;
  skills: string[];
  education: string;
  university: string;
}

/**
 * Full user profile: parsed resume fields plus onboarding targets (Req 4).
 * Stored under `profile` in the Users table.
 */
export interface Profile extends ParsedProfile {
  target_roles: string[];
  target_industries: string[];
  dream_companies: string[];
  /** A permutation of the six {@link PriorityFactor} values (Req 4.2-4.4). */
  priority_ranking: PriorityFactor[];
}

/** Context captured when a user is a `career_switcher` (Req 3.3, 6.5). */
export interface CareerSwitchContext {
  from: string;
  to: string;
}

/** The user's hard, non-negotiable constraints (Req 5, enforced by Pre_Filter). */
export interface NonNegotiables {
  /** Minimum acceptable monthly salary in SGD; must be positive (Req 5.3). */
  min_salary: number;
  employment_type: EmploymentType[];
  work_arrangement: WorkArrangement;
  /** Free-text custom dealbreakers (Req 9.1). */
  custom: string[];
  /** True when the user requires EP sponsorship (Req 9.3, 9.4). */
  ep_sponsorship_required: boolean;
}

/**
 * Per-user agent calibration weights derived during onboarding (Req 6).
 * Defaults: ambition 70, realism 80 (70 fresh_grad / 85 senior),
 * risk_max_acceptable 70, opportunity_urgency_boost true.
 */
export interface AgentWeights {
  ambition_threshold: number;
  realism_threshold: number;
  risk_max_acceptable: number;
  opportunity_urgency_boost: boolean;
}

/**
 * The editable onboarding configuration — WORKSIGNAL's source of truth
 * (Req 5.4, 5.5). `editOnboarding` accepts a Partial of this and returns the
 * full updated state. Pre_Filter and agents always read the latest version.
 */
export interface OnboardingState {
  career_stage: CareerStage;
  residency_status: ResidencyStatus;
  /** Required when `career_stage === 'career_switcher'` (Req 3.3). */
  career_switch_context?: CareerSwitchContext;
  target_roles: string[];
  target_industries: string[];
  dream_companies: string[];
  priority_ranking: PriorityFactor[];
  non_negotiables: NonNegotiables;
  /** Monotonically increasing version stamp set on each save (Req 5.5). */
  onboarding_version: number;
  /** ISO timestamp of the most recent save (Req 5.5). */
  updated_at: string;
}

/**
 * The complete persisted user record (Users table).
 * `UserConfig` is the read shape consumed by the Pre_Filter and the debate
 * agents — it always reflects the most recently saved onboarding version.
 */
export interface UserConfig {
  /** Google OAuth `sub`. */
  user_id: string;
  email: string;
  name: string;
  resume_s3_key?: string;
  career_stage: CareerStage;
  residency_status: ResidencyStatus;
  career_switch_context?: CareerSwitchContext;
  profile: Profile;
  non_negotiables: NonNegotiables;
  agent_weights: AgentWeights;
  /** Encrypted Gmail OAuth token (Req 1.4). */
  gmail_oauth_token?: string;
  /** False when the user declined the Gmail scope (Req 1.5). */
  inbox_monitoring_available: boolean;
  /** Source-of-truth version tracking (Req 5.5). */
  onboarding_version: number;
  updated_at: string;
  created_at: string;
  /** Timestamp of the last completed discovery scan (Req 7.1, 7.3). */
  last_scan_at?: string;
}
