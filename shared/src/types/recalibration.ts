/**
 * Recalibration_Engine output types (Req 21).
 *
 * Mirrors the RecalibrationLog table schema.
 */

import type { AgentName } from './enums.js';

/** Weekly outcome metrics (Req 21.1). */
export interface RecalibrationMetrics {
  applications_sent: number;
  callbacks: number;
  rejections: number;
  ghosted: number;
  /** Callbacks / applications_sent. */
  callback_rate: number;
}

/** Per-agent accuracy tally over the week (Req 21.2). */
export interface AgentAccuracy {
  correct: number;
  incorrect: number;
}

/** A single threshold adjustment made during recalibration (Req 21.3). */
export interface RecalibrationAdjustment {
  agent: AgentName;
  parameter: string;
  old_value: string | number;
  new_value: string | number;
  reason: string;
}

/** Average agent scores across all applications evaluated this week. */
export interface AgentScoreAverages {
  ambition: number;
  realism: number;
  risk: number;
  opportunity: number;
}

/** Skill flagged across JDs where Ambition said yes but Realism said no. */
export interface SkillGapSummaryItem {
  skill: string;
  flagged_count: number;
}

/**
 * A single weekly recalibration record (RecalibrationLog table, Req 21.4).
 */
export interface RecalibrationLogEntry {
  recalibration_id: string;
  user_id: string;
  /** The week this recalibration covers (date). */
  week_of: string;
  metrics: RecalibrationMetrics;
  agent_performance: Record<AgentName, AgentAccuracy>;
  adjustments_made: RecalibrationAdjustment[];
  /** Average scores per agent across all applications this week. */
  agent_score_averages?: AgentScoreAverages;
  /** Skills flagged in stretch-role JDs (high ambition, low realism). */
  skills_gap_summary?: SkillGapSummaryItem[];
  /** True for a zero-callback emergency recalibration (Req 21.6). */
  emergency: boolean;
  brief_text: string;
  created_at: string;
}
