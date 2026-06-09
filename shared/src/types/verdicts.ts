/**
 * Debate-agent verdict contracts and the Master Orchestrator decision shape.
 *
 * Mirrors the four agent JSON schemas (Req 10.2-10.5) and the Master
 * Orchestrator output (Req 12). Verdict fields use snake_case to match the
 * strict JSON output contract validated by the Debate_Engine.
 */

import type { AgentName, Decision, RedFlagSeverity } from './enums.js';

/** Ambition_Agent verdict — career-ceiling lift (Req 10.2). */
export interface AmbitionVerdict {
  verdict: 'apply' | 'skip';
  /** 0-100 inclusive. */
  ambition_score: number;
  reasoning: string;
  key_argument: string;
}

/** Realism_Agent verdict — realistic callback probability (Req 10.3). */
export interface RealismVerdict {
  verdict: 'apply' | 'skip' | 'caution';
  /** 0-100 inclusive. */
  match_score: number;
  key_gaps: string[];
  work_life_flags: string[];
  reasoning: string;
  key_argument: string;
}

/** A single Risk_Agent red flag with provenance (Req 10.4). */
export interface RedFlag {
  flag: string;
  source: string;
  severity: RedFlagSeverity;
}

/** Risk_Agent verdict — company health research (Req 10.4). */
export interface RiskVerdict {
  verdict: 'safe' | 'caution' | 'avoid';
  /** 0-100 inclusive. */
  risk_score: number;
  red_flags: RedFlag[];
  glassdoor_score: number | null;
  reasoning: string;
  key_argument: string;
}

/** Opportunity_Agent verdict — timing / urgency (Req 10.5, 10.7). */
export interface OpportunityVerdict {
  verdict: 'act_now' | 'monitor' | 'no_advantage';
  /** 0-100 inclusive. */
  urgency_score: number;
  timing_factors: string[];
  reasoning: string;
  key_argument: string;
}

/** Discriminated union of any single agent's verdict. */
export type Verdict =
  | AmbitionVerdict
  | RealismVerdict
  | RiskVerdict
  | OpportunityVerdict;

/**
 * The collection of agent verdicts passed to the Master Orchestrator.
 * Fields are optional to support degraded resolution from a partial subset
 * of valid verdicts (Req 22.4, 22.5).
 */
export interface VerdictSet {
  ambition?: AmbitionVerdict;
  realism?: RealismVerdict;
  risk?: RiskVerdict;
  opportunity?: OpportunityVerdict;
}

/**
 * The Master Orchestrator's resolved decision (Req 12).
 * The `decision` class is computed deterministically from the verdicts;
 * prose fields are authored by Bedrock for apply-equivalent outcomes.
 */
export interface MasterDecision {
  decision: Decision;
  summary: string;
  /** Present for apply-equivalent decisions (Req 12.7). */
  resume_instructions?: string;
  /** Present for apply-equivalent decisions (Req 12.7). */
  cover_letter_angle?: string;
  agents_for: AgentName[];
  agents_against: AgentName[];
  /** Recorded for `apply_with_caveat` (Req 12.3). */
  dissent_note?: string;
  /** True when Realism match_score < 50 on an apply decision (Req 12.6). */
  user_action_required: boolean;
  /** Agents whose verdicts were unavailable in degraded mode (Req 22.4). */
  agent_failures?: AgentName[];
}
