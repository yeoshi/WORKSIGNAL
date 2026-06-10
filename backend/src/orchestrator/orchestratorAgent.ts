/**
 * Orchestrator Agent — Bedrock prose generation for holistic_summary.
 *
 * The action, confidence, and deciding_factor are already computed
 * deterministically by {@link scoreHeuristic.ts}. This module adds a single
 * Bedrock call to author the `holistic_summary`: a 2–3 sentence paragraph
 * addressed to the user explaining, in plain language, how the deadlock was
 * resolved and what they should do next.
 *
 * If Bedrock fails (network error, timeout, invalid JSON), the caller receives
 * a template-based fallback so the demo never breaks.
 */

import type {
  Job,
  OrchestratorAction,
  SkillGapSummary,
  UserConfig,
  VerdictSet,
} from '@worksignal/shared';
import {
  formatJob,
  formatUser,
  STRICT_JSON_TRAILER,
  type AgentInvocationOptions,
  type BedrockInvoke,
} from '../debate/agents/shared.js';
import type { HeuristicResult } from './scoreHeuristic.js';

const ORCHESTRATOR_SYSTEM_PROMPT = `You are the Orchestrator Agent in WORKSIGNAL, a multi-agent job application system.

Four specialist agents (Ambition, Realism, Risk, Opportunity) have evaluated a job for a user and reached a split verdict. You have already computed the recommended action and the deciding factor. Your task is to write a clear, direct 2–3 sentence explanation of this decision addressed to the user in second person.

Guidelines:
- Be specific: reference the actual scores and reasons, not generic platitudes
- Be honest: acknowledge the concerns of the opposing agents, but explain why the action is still correct
- Be actionable: end with what the user should do immediately
- Do NOT say "I recommend" — state the conclusion directly
- Do NOT repeat the deciding_factor verbatim — build on it

Output JSON only:
{
  "holistic_summary": "2-3 sentences"
}`;

function buildOrchestratorPrompt(
  action: OrchestratorAction,
  deciding_factor: string,
  heuristic: HeuristicResult,
  verdicts: VerdictSet,
  user: UserConfig,
  job: Job,
  skillGapHistory: SkillGapSummary[],
): string {
  const lines: string[] = [
    formatUser(user),
    '',
    formatJob(job),
    '',
    'DEBATE SUMMARY:',
    `- Ambition  [score=${verdicts.ambition?.ambition_score ?? 'N/A'}, verdict=${verdicts.ambition?.verdict ?? 'N/A'}]: ${verdicts.ambition?.key_argument ?? ''}`,
    `- Realism   [match=${verdicts.realism?.match_score ?? 'N/A'}, verdict=${verdicts.realism?.verdict ?? 'N/A'}]: ${verdicts.realism?.key_argument ?? ''}`,
    `  Key gaps: ${(verdicts.realism?.key_gaps ?? []).join('; ') || 'none listed'}`,
    `- Risk      [risk=${verdicts.risk?.risk_score ?? 'N/A'}, verdict=${verdicts.risk?.verdict ?? 'N/A'}]: ${verdicts.risk?.key_argument ?? ''}`,
    `- Opportunity [urgency=${verdicts.opportunity?.urgency_score ?? 'N/A'}, verdict=${verdicts.opportunity?.verdict ?? 'N/A'}]: ${verdicts.opportunity?.key_argument ?? ''}`,
  ];

  if (skillGapHistory.length > 0) {
    lines.push('', 'RECURRING SKILL GAPS:');
    for (const g of skillGapHistory) {
      lines.push(
        `- ${g.skill}: flagged in ${g.times_flagged} distinct jobs${g.has_roadmap ? ' (roadmap already exists)' : ''}`,
      );
    }
  }

  lines.push(
    '',
    `COMPUTED ACTION: ${action.toUpperCase()}`,
    `DECIDING FACTOR: ${deciding_factor}`,
  );

  if (heuristic.upskill_targets && heuristic.upskill_targets.length > 0) {
    lines.push(`UPSKILL TARGETS: ${heuristic.upskill_targets.join(', ')}`);
  }
  if (heuristic.apply_angle) {
    lines.push(`APPLY ANGLE: ${heuristic.apply_angle}`);
  }

  lines.push(
    '',
    'Write the holistic_summary for this user explaining the decision.',
    STRICT_JSON_TRAILER,
  );

  return lines.join('\n');
}

/** Template fallback used when Bedrock is unavailable. */
function fallbackSummary(
  action: OrchestratorAction,
  deciding_factor: string,
  heuristic: HeuristicResult,
): string {
  if (action === 'apply') {
    return `${deciding_factor} ${heuristic.apply_angle ?? 'Submit your application now while the opportunity is open.'}`;
  }
  if (action === 'upskill') {
    const targets = heuristic.upskill_targets?.join(', ') ?? 'the flagged skill gaps';
    return `${deciding_factor} Focus on ${targets} before targeting this role type again — closing these gaps will improve both your match score and your confidence in applications.`;
  }
  return `${deciding_factor} Hold off on this role for now; revisit when either your skill profile improves or a more aligned opportunity appears.`;
}

/**
 * Call Bedrock to generate the `holistic_summary` for an orchestrator verdict.
 * Returns the Bedrock-authored text, or a template fallback on any failure.
 * Never throws.
 */
export async function generateOrchestratorProse(
  action: OrchestratorAction,
  deciding_factor: string,
  heuristic: HeuristicResult,
  verdicts: VerdictSet,
  user: UserConfig,
  job: Job,
  bedrock: BedrockInvoke,
  skillGapHistory: SkillGapSummary[] = [],
  options: AgentInvocationOptions = {},
): Promise<string> {
  const userPrompt = buildOrchestratorPrompt(
    action,
    deciding_factor,
    heuristic,
    verdicts,
    user,
    job,
    skillGapHistory,
  );

  try {
    const raw = await bedrock({ system: ORCHESTRATOR_SYSTEM_PROMPT, user: userPrompt });
    const parsed = JSON.parse(raw) as { holistic_summary?: string };
    const summary = parsed.holistic_summary?.trim();
    if (summary && summary.length > 0) {
      return summary;
    }
    return fallbackSummary(action, deciding_factor, heuristic);
  } catch {
    options.logger?.warn?.('Orchestrator Bedrock prose call failed; using fallback', {
      action,
    });
    return fallbackSummary(action, deciding_factor, heuristic);
  }
}
