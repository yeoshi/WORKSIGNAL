/**
 * Realism_Agent (Task 13.1, Req 10.3).
 *
 * Evaluates the user's realistic callback probability for a job, keeps the user
 * honest, and flags work-life-balance red flags and skill gaps (a repeatedly
 * flagged gap later feeds the Growth_Agent trigger, Req 19.1). Runs as a
 * Bedrock task with a **fixed system prompt** (verbatim from PRD §6.2) and a
 * strict JSON output contract validated into a {@link RealismVerdict}.
 *
 * The agent applies the **per-user match threshold** from calibration
 * (`agent_weights.realism_threshold`: 70 fresh_grad / 85 senior / 80 default,
 * Req 6.1, 6.2) — the threshold is injected into the user prompt so the model
 * applies the value calibrated for this specific user rather than the PRD's
 * stated 80% default.
 */

import type {
  InvalidVerdict,
  Job,
  RealismVerdict,
  UserConfig,
} from '@worksignal/shared';
import { isInvalidVerdict } from '../verdictValidator.js';
import {
  formatJob,
  formatUser,
  invokeAndValidate,
  STRICT_JSON_TRAILER,
  type AgentInvocationOptions,
  type BedrockInvoke,
} from './shared.js';

/**
 * The Realism_Agent's fixed system prompt (verbatim from PRD §6.2). The PRD's
 * stated 80% default is overridden per-user at runtime via the user prompt
 * (see {@link buildRealismPrompt}).
 */
export const REALISM_SYSTEM_PROMPT = `You are the Realism Agent in WORKSIGNAL.

Your mandate: optimise for actual application success rate.
Your bias: conservative. 10 strong > 50 weak.

Evaluate:
1. % of hard requirements met (years, tools, certifications)
2. Is the gap addressable in a cover letter or is it a hard filter?
3. Realistic callback probability based on profile strength
4. Work-life balance signals in JD (red flags: "fast-paced", "wear many hats", "24/7")
5. Salary alignment with market data for this role + experience level

Default threshold for "apply" is 80% match. Adjustable via recalibration.

Output JSON:
{
  "verdict": "apply" | "skip" | "caution",
  "match_score": 0-100,
  "key_gaps": ["array of specific gaps"],
  "work_life_flags": ["array of any WLB red flags detected"],
  "reasoning": "2-3 sentences",
  "key_argument": "one-line for the debate summary"
}`;

/**
 * Build the Realism_Agent's per-job user prompt. Injects the user's calibrated
 * match threshold (Req 6.1, 6.2) and instructs the agent to emit `key_gaps`
 * and `work_life_flags` (Req 10.3).
 */
export function buildRealismPrompt(job: Job, user: UserConfig): string {
  const threshold = user.agent_weights.realism_threshold;
  return [
    formatUser(user),
    '',
    formatJob(job),
    '',
    `This user's calibrated "apply" match threshold is ${threshold}% — use ${threshold}% (not the 80% default) as the bar for an apply verdict.`,
    'Identify specific skill/experience gaps in key_gaps and any work-life-balance red flags in work_life_flags.',
    'Evaluate this job for the user per your mandate and output contract.',
    STRICT_JSON_TRAILER,
  ].join('\n');
}

/**
 * Run the Realism_Agent for a job (Req 10.3).
 *
 * Applies the user's per-user match threshold, builds the user prompt, invokes
 * Bedrock through the bounded-retry wrapper (Req 22.1), and validates the
 * strict-JSON output into a {@link RealismVerdict} (with `key_gaps` and
 * `work_life_flags`). Returns an {@link InvalidVerdict} on non-conforming
 * output (Req 11.3).
 *
 * @param job - The pre-filtered job under debate.
 * @param user - The user's latest configuration (source of truth, Req 5.5).
 * @param bedrock - Injectable Bedrock invocation (stubbed in tests).
 * @param options - Bounded-retry knobs and optional logger.
 */
export async function runRealismAgent(
  job: Job,
  user: UserConfig,
  bedrock: BedrockInvoke,
  options: AgentInvocationOptions = {},
): Promise<RealismVerdict | InvalidVerdict> {
  const prompt = buildRealismPrompt(job, user);
  const result = await invokeAndValidate(
    'realism',
    REALISM_SYSTEM_PROMPT,
    prompt,
    bedrock,
    options,
  );
  if (isInvalidVerdict(result)) {
    return result;
  }
  return result as RealismVerdict;
}
