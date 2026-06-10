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

/** Contact and location details extracted from a resume (Req 2.2). */
export interface ResumeBasicInfo {
  full_name: string;
  mobile: string;
  email: string;
  preferred_location: string;
}

/** A single education history entry (Req 2.2). */
export interface EducationEntry {
  school: string;
  faculty: string;
  degree: string;
  field_of_study: string;
  /** "YYYY-MM" */
  start: string;
  /** "YYYY-MM" or "Present" */
  end: string;
}

/** A single work or internship experience entry (Req 2.2). */
export interface WorkExperienceEntry {
  company: string;
  title: string;
  start: string;
  end: string;
  description: string;
}

/** A single project experience entry (Req 2.2). */
export interface ProjectEntry {
  project_name: string;
  title: string;
  start: string;
  end: string;
  url: string;
  description: string;
}

/** A single work sample link entry (Req 2.2). */
export interface WorkSampleEntry {
  url: string;
  description: string;
}

/** A single honor or award entry (Req 2.2). */
export interface HonorAwardEntry {
  title: string;
  date: string;
  description: string;
}

export type LanguageProficiency =
  | 'native_or_bilingual'
  | 'professional_working'
  | 'limited_working'
  | 'elementary';

/** A single language proficiency entry (Req 2.2). */
export interface LanguageSkillEntry {
  language: string;
  proficiency: LanguageProficiency;
}

export type SnsPlatform = 'linkedin' | 'github' | 'portfolio' | 'twitter' | 'other';

/** A single social/portfolio link entry (Req 2.2). */
export interface SnsLinkEntry {
  platform: SnsPlatform;
  url: string;
}

/** Structured profile extracted from a resume by the Resume_Parser (Req 2.2). */
export interface ParsedProfile {
  current_role: string;
  years_experience: number;
  skills: string[];
  education: string;
  university: string;
  basic_info?: ResumeBasicInfo;
  education_history?: EducationEntry[];
  work_experience?: WorkExperienceEntry[];
  internships?: WorkExperienceEntry[];
  projects?: ProjectEntry[];
  work_samples?: WorkSampleEntry[];
  honors_awards?: HonorAwardEntry[];
  languages?: LanguageSkillEntry[];
  self_introduction?: string;
  sns_links?: SnsLinkEntry[];
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
  /** Optional sample cover letter used to match tone when generating new letters. */
  cover_letter_sample_s3_key?: string;
  cover_letter_sample_text?: string;
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
