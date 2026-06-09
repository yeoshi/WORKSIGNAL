/**
 * Ambition_Agent (Task 13.1, Req 10.2).
 *
 * Evaluates a job's potential to raise the user's career ceiling, with a bias
 * toward applying. Runs as a Bedrock task with a **fixed system prompt**
 * (verbatim from PRD §6.1) and a strict JSON output contract validated into an
 * {@link AmbitionVerdict} by the Debate_Engine's verdict validator.
 */

import type {
  AmbitionVerdict,
  InvalidVerdict,
  Job,
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
 * The Ambition_Agent's fixed system prompt (verbatim from PRD §6.1). This is
 * the single source of truth for the agent's mandate and output contract.
 */
export const AMBITION_SYSTEM_PROMPT = `You are the Ambition Agent in WORKSIGNAL, a multi-agent job application system.

Your mandate: maximise this user's career ceiling. Push them to stretch.
Your bias: lean toward applying. People undersell themselves.

Evaluate each job against the user's profile on:
1. Seniority step-up potential
2. Salary improvement vs current/market rate
3. Growth area skill building (especially AI-adjacent skills)
4. Company brand and career optionality
5. Career progression path clarity
6. Whether this role is future-proof against automation

Consider the user's stated priority ranking (money/growth/balance/brand/purpose/stability).

Output JSON:
{
  "verdict": "apply" | "skip",
  "ambition_score": 0-100,
  "reasoning": "2-3 sentences",
  "key_argument": "one-line for the debate summary"
}`;

/** Build the Ambition_Agent's per-job user prompt from the Job + UserConfig. */
export function buildAmbitionPrompt(job: Job, user: UserConfig): string {
  return [
    formatUser(user),
    '',
    formatJob(job),
    '',
    'Evaluate this job for the user per your mandate and output contract.',
    STRICT_JSON_TRAILER,
  ].join('\n');
}

/**
 * Run the Ambition_Agent for a job (Req 10.2).
 *
 * Builds the user prompt from `job` + `user`, invokes Bedrock through the
 * bounded-retry wrapper (Req 22.1), and validates the strict-JSON output into
 * an {@link AmbitionVerdict}. Returns an {@link InvalidVerdict} when the output
 * does not conform (Req 11.3).
 *
 * @param job - The pre-filtered job under debate.
 * @param user - The user's latest configuration (source of truth, Req 5.5).
 * @param bedrock - Injectable Bedrock invocation (stubbed in tests).
 * @param options - Bounded-retry knobs and optional logger.
 */
export async function runAmbitionAgent(
  job: Job,
  user: UserConfig,
  bedrock: BedrockInvoke,
  options: AgentInvocationOptions = {},
): Promise<AmbitionVerdict | InvalidVerdict> {
  const prompt = buildAmbitionPrompt(job, user);
  const result = await invokeAndValidate(
    'ambition',
    AMBITION_SYSTEM_PROMPT,
    prompt,
    bedrock,
    options,
  );
  if (isInvalidVerdict(result)) {
    return result;
  }
  return result as AmbitionVerdict;
}
