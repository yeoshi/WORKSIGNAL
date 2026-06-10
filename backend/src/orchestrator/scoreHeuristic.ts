/**
 * Orchestrator Agent — deterministic scoring heuristic.
 *
 * Computes the `OrchestratorAction`, `confidence`, `deciding_factor`, and
 * optional `apply_angle` / `upskill_targets` from the four agent verdict
 * scores and an optional recurring skill-gap history. This is intentionally
 * pure code — no I/O, no Bedrock — so the action is always deterministic and
 * safe to use as a fallback even when Bedrock is unavailable.
 *
 * Thresholds (aggressive, growth-biased):
 *   APPLY   when: urgency_score ≥ 75 (Opportunity=act_now)
 *           OR    (ambition_score ≥ 65 AND match_score ≥ 50)
 *   UPSKILL when: match_score < 45
 *           AND   urgency_score < 60
 *           AND   ≥3 distinct-job recurring skill gaps
 *   HOLD    otherwise (no dominant signal)
 *
 * Only fires on deadlock (`deadlock_escalate`) or borderline-apply cases
 * (`apply_with_caveat` + Realism floor). The caller in `resolveEnriched.ts`
 * is responsible for gating.
 */

import type {
  OrchestratorAction,
  SkillGapSummary,
  VerdictSet,
} from '@worksignal/shared';

/** Urgency score at or above which `act_now` timing is a decisive apply signal. */
export const URGENCY_APPLY_THRESHOLD = 75;

/** Ambition score at or above which career-ceiling lift is meaningful. */
export const AMBITION_APPLY_THRESHOLD = 65;

/** Realism match score at or above which skill fit is acceptable. */
export const MATCH_APPLY_THRESHOLD = 50;

/** Realism match score below which skill fit is too weak to apply without upskilling. */
export const MATCH_UPSKILL_FLOOR = 45;

/** Urgency score below which timing does not override an upskill signal. */
export const URGENCY_UPSKILL_CEILING = 60;

/**
 * Minimum number of distinct-job recurring gaps needed for the upskill path
 * to fire. Mirrors the Growth Agent trigger threshold (Req 19.1).
 */
export const UPSKILL_GAP_THRESHOLD = 3;

export interface HeuristicInput {
  verdicts: VerdictSet;
  skillGapHistory?: SkillGapSummary[];
}

export interface HeuristicResult {
  action: OrchestratorAction;
  confidence: number;
  deciding_factor: string;
  apply_angle?: string;
  upskill_targets?: string[];
}

/** Count recurring gaps that have not yet been addressed by a roadmap. */
function openRecurringGaps(history: SkillGapSummary[]): SkillGapSummary[] {
  return history.filter(
    (g) => g.times_flagged >= UPSKILL_GAP_THRESHOLD && !g.has_roadmap,
  );
}

/**
 * Compute the Orchestrator Agent's action deterministically from agent scores
 * and skill-gap history. Pure and total — the same inputs always yield the
 * same result.
 */
export function computeHeuristicAction(input: HeuristicInput): HeuristicResult {
  const { verdicts, skillGapHistory = [] } = input;

  const urgency = verdicts.opportunity?.urgency_score ?? 0;
  const ambition = verdicts.ambition?.ambition_score ?? 0;
  const match = verdicts.realism?.match_score ?? 0;
  const keyGaps = verdicts.realism?.key_gaps ?? [];
  const openGaps = openRecurringGaps(skillGapHistory);

  // ── Path 1: Timing urgency is decisive (act_now with high score) ──────────
  if (urgency >= URGENCY_APPLY_THRESHOLD) {
    const confidence = Math.min(95, Math.round(70 + (urgency - URGENCY_APPLY_THRESHOLD) * 0.8));
    const apply_angle =
      match >= MATCH_APPLY_THRESHOLD
        ? 'Emphasise engineering and data infrastructure experience to align with the role framing.'
        : 'Focus on transferable analytical skills and growth trajectory; acknowledge the role is a stretch but worth attempting given the timing window.';
    return {
      action: 'apply',
      confidence,
      deciding_factor: `Timing urgency (${urgency}/100) opens a first-mover window — applying now maximises your position before competition builds.`,
      apply_angle,
    };
  }

  // ── Path 2: Strong ambition + adequate match ─────────────────────────────
  if (ambition >= AMBITION_APPLY_THRESHOLD && match >= MATCH_APPLY_THRESHOLD) {
    const confidence = Math.round((ambition + match) / 2);
    return {
      action: 'apply',
      confidence,
      deciding_factor: `Growth potential (ambition ${ambition}/100) paired with adequate skill fit (match ${match}/100) outweighs the opposing agents' concerns.`,
      apply_angle: 'Lead with career progression narrative and highlight skills that align with the role even if the title is imperfect.',
    };
  }

  // ── Path 3: Weak match + recurring skill gaps + no timing urgency ─────────
  if (
    match < MATCH_UPSKILL_FLOOR &&
    urgency < URGENCY_UPSKILL_CEILING &&
    openGaps.length >= 1
  ) {
    const targets = openGaps.map((g) => g.skill);
    const topGaps = targets.slice(0, 3);
    // Also pull key_gaps from Realism verdict if not already in history
    const realismGaps = keyGaps.filter(
      (g) => g.trim().length > 0 && !targets.includes(g.trim()),
    );
    const allTargets = [...new Set([...topGaps, ...realismGaps.slice(0, 2)])];
    const confidence = Math.round(
      60 + openGaps.length * 5 + Math.max(0, MATCH_UPSKILL_FLOOR - match),
    );
    return {
      action: 'upskill',
      confidence: Math.min(90, confidence),
      deciding_factor: `Match score (${match}/100) is below threshold and ${openGaps.length} skill gap${openGaps.length > 1 ? 's' : ''} recur across multiple roles — closing these first will materially improve your applications.`,
      upskill_targets: allTargets,
    };
  }

  // ── Path 4: Upskill signal from Realism alone (no history needed) ─────────
  // Low match + no timing urgency, but recurring history not available yet.
  if (match < MATCH_UPSKILL_FLOOR && urgency < URGENCY_UPSKILL_CEILING && keyGaps.length > 0) {
    const allTargets = keyGaps.filter((g) => g.trim().length > 0).slice(0, 3);
    return {
      action: 'upskill',
      confidence: 60,
      deciding_factor: `Match score (${match}/100) is below the apply threshold and the Realism Agent flagged concrete skill gaps.`,
      upskill_targets: allTargets,
    };
  }

  // ── Path 5: No dominant signal → hold ────────────────────────────────────
  return {
    action: 'hold',
    confidence: 55,
    deciding_factor: `No dominant signal: urgency (${urgency}/100) and match (${match}/100) are both below the thresholds needed to apply or upskill with confidence.`,
  };
}
