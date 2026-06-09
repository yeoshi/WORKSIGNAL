import type {
  AgentName,
  AmbitionVerdict,
  OpportunityVerdict,
  RealismVerdict,
  RiskVerdict,
  VerdictSet,
} from '@worksignal/shared';
import { AGENT_NAMES } from '@worksignal/shared';

/**
 * Per-agent presentation theme for the Job Detail debate cards.
 * Colours are taken verbatim from the design's colour palette so each
 * agent card is visually distinct (Req 15.2).
 */
export interface AgentTheme {
  /** Human-readable agent name shown on the card header. */
  label: string;
  /** Hex accent colour for the agent (design palette). */
  color: string;
}

export const AGENT_THEME: Record<AgentName, AgentTheme> = {
  ambition: { label: 'Ambition', color: '#DC2626' },
  realism: { label: 'Realism', color: '#2563EB' },
  risk: { label: 'Risk', color: '#D97706' },
  opportunity: { label: 'Opportunity', color: '#059669' },
};

/** A list of related verdict detail values rendered under the reasoning. */
export interface AgentCardDetail {
  label: string;
  values: string[];
}

/**
 * Normalised, presentation-ready shape for a single debate card.
 * Every agent verdict is reduced to a common {verdict, score, reasoning,
 * key argument} surface (Req 15.2) plus agent-specific extra detail.
 */
export interface AgentCardData {
  agent: AgentName;
  label: string;
  color: string;
  /** Raw verdict token, e.g. "apply", "avoid", "act_now". */
  verdict: string;
  /** Numeric score (0-100) for this agent. */
  score: number;
  /** Label describing what the score measures, e.g. "Ambition score". */
  scoreLabel: string;
  reasoning: string;
  keyArgument: string;
  /** Agent-specific lists (gaps, red flags, timing factors). */
  details: AgentCardDetail[];
  /** True when this agent's verdict was unavailable (degraded mode). */
  failed: boolean;
}

const SCORE_LABEL: Record<AgentName, string> = {
  ambition: 'Ambition score',
  realism: 'Match score',
  risk: 'Risk score',
  opportunity: 'Urgency score',
};

function nonEmpty(values: string[] | undefined): string[] {
  return (values ?? []).filter((v) => v && v.trim().length > 0);
}

/**
 * Build the normalised card data for a single agent from its verdict.
 * Returns a `failed` placeholder card when the verdict is absent so the
 * screen can still show one card per agent (Req 15.2, degraded Req 22.4).
 */
export function toAgentCard(agent: AgentName, verdicts: VerdictSet): AgentCardData {
  const theme = AGENT_THEME[agent];
  const base = {
    agent,
    label: theme.label,
    color: theme.color,
    scoreLabel: SCORE_LABEL[agent],
  };

  switch (agent) {
    case 'ambition': {
      const v = verdicts.ambition;
      if (!v) break;
      return {
        ...base,
        verdict: v.verdict,
        score: v.ambition_score,
        reasoning: v.reasoning,
        keyArgument: v.key_argument,
        details: [],
        failed: false,
      };
    }
    case 'realism': {
      const v = verdicts.realism;
      if (!v) break;
      const details: AgentCardDetail[] = [];
      if (nonEmpty(v.key_gaps).length > 0) {
        details.push({ label: 'Key gaps', values: nonEmpty(v.key_gaps) });
      }
      if (nonEmpty(v.work_life_flags).length > 0) {
        details.push({ label: 'Work-life flags', values: nonEmpty(v.work_life_flags) });
      }
      return {
        ...base,
        verdict: v.verdict,
        score: v.match_score,
        reasoning: v.reasoning,
        keyArgument: v.key_argument,
        details,
        failed: false,
      };
    }
    case 'risk': {
      const v = verdicts.risk;
      if (!v) break;
      const details: AgentCardDetail[] = [];
      const flags = (v.red_flags ?? [])
        .map((f) => (f.source ? `${f.flag} (${f.source})` : f.flag))
        .filter((f) => f && f.trim().length > 0);
      if (flags.length > 0) {
        details.push({ label: 'Red flags', values: flags });
      }
      if (v.glassdoor_score !== null && v.glassdoor_score !== undefined) {
        details.push({ label: 'Glassdoor', values: [`${v.glassdoor_score} / 5`] });
      }
      return {
        ...base,
        verdict: v.verdict,
        score: v.risk_score,
        reasoning: v.reasoning,
        keyArgument: v.key_argument,
        details,
        failed: false,
      };
    }
    case 'opportunity': {
      const v = verdicts.opportunity;
      if (!v) break;
      const details: AgentCardDetail[] = [];
      if (nonEmpty(v.timing_factors).length > 0) {
        details.push({ label: 'Timing factors', values: nonEmpty(v.timing_factors) });
      }
      return {
        ...base,
        verdict: v.verdict,
        score: v.urgency_score,
        reasoning: v.reasoning,
        keyArgument: v.key_argument,
        details,
        failed: false,
      };
    }
  }

  // No verdict available for this agent (degraded resolution, Req 22.4).
  return {
    ...base,
    verdict: 'unavailable',
    score: 0,
    reasoning: 'This agent did not return a verdict for this job.',
    keyArgument: '',
    details: [],
    failed: true,
  };
}

/** Build one normalised card per agent, in canonical order (Req 15.2). */
export function toAgentCards(verdicts: VerdictSet): AgentCardData[] {
  return AGENT_NAMES.map((agent) => toAgentCard(agent, verdicts));
}

/** Narrowing helper retained for completeness / future agent-specific UI. */
export type AnyAgentVerdict =
  | AmbitionVerdict
  | RealismVerdict
  | RiskVerdict
  | OpportunityVerdict;
