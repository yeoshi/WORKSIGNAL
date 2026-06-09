/**
 * Opportunity_Agent (Task 13.1, Req 10.5, 10.7).
 *
 * Detects timing advantages and urgency, biased toward acting fast on
 * time-sensitive roles. Runs as a Bedrock task with a **fixed system prompt**
 * (verbatim from PRD §6.4) and a strict JSON output contract validated into an
 * {@link OpportunityVerdict}.
 *
 * FCF timing factor (Req 10.7): WHERE the user requires Employment Pass
 * sponsorship, the agent is given the job's MyCareersFuture listing duration
 * relative to the Fair Consideration Framework 14-day rule and instructed to
 * include that comparison in `timing_factors`.
 */

import type {
  InvalidVerdict,
  Job,
  OpportunityVerdict,
  UserConfig,
} from '@worksignal/shared';
import { isInvalidVerdict } from '../verdictValidator.js';
import {
  FCF_LISTING_DAYS,
  formatJob,
  formatUser,
  invokeAndValidate,
  needsSponsorship,
  STRICT_JSON_TRAILER,
  type AgentInvocationOptions,
  type BedrockInvoke,
} from './shared.js';

/** The Opportunity_Agent's fixed system prompt (verbatim from PRD §6.4). */
export const OPPORTUNITY_SYSTEM_PROMPT = `You are the Opportunity Agent in WORKSIGNAL.

Your mandate: detect when timing matters. Push to act fast on time-sensitive roles.
Your bias: action-oriented. First qualified applicant often wins.

Evaluate:
1. Posting age (hours/days)
2. Company hiring speed signals (size, industry norms)
3. Exa: recent company news (funding, expansion, exec changes) signalling urgency
4. First-mover advantage available?
5. If user needs work pass: how long has this role been on MyCareersFuture? (FCF 14-day rule)

Output JSON:
{
  "verdict": "act_now" | "monitor" | "no_advantage",
  "urgency_score": 0-100,
  "timing_factors": ["array of specific factors"],
  "reasoning": "2-3 sentences",
  "key_argument": "one-line for the debate summary"
}`;

/**
 * Build the FCF timing note for `need_sponsorship` users (Req 10.7): the job's
 * MCF listing duration relative to the 14-day Fair Consideration Framework
 * window, with the remaining days until a foreigner may be hired.
 */
export function buildFcfTimingNote(job: Job): string {
  const listed = job.mcf_listing_days;
  const remaining = FCF_LISTING_DAYS - listed;
  if (remaining > 0) {
    return (
      `This user requires Employment Pass sponsorship. This role has been listed on ` +
      `MyCareersFuture for ${listed} of the ${FCF_LISTING_DAYS} days required by the FCF rule — ` +
      `${remaining} more day(s) must elapse before a foreigner can be hired. ` +
      'Include this MCF-listing-duration-vs-FCF-14-day comparison in timing_factors.'
    );
  }
  return (
    `This user requires Employment Pass sponsorship. This role has been listed on ` +
    `MyCareersFuture for ${listed} days, meeting the FCF ${FCF_LISTING_DAYS}-day requirement — ` +
    'a foreigner is now eligible to be hired. ' +
    'Include this MCF-listing-duration-vs-FCF-14-day comparison in timing_factors.'
  );
}

/**
 * Build the Opportunity_Agent's per-job user prompt. For `need_sponsorship`
 * users, appends the FCF listing-duration timing note (Req 10.7).
 */
export function buildOpportunityPrompt(job: Job, user: UserConfig): string {
  const lines = [formatUser(user), '', formatJob(job), ''];
  if (needsSponsorship(user)) {
    lines.push(buildFcfTimingNote(job), '');
  }
  lines.push(
    'Evaluate timing and urgency for the user per your mandate and output contract.',
    STRICT_JSON_TRAILER,
  );
  return lines.join('\n');
}

/**
 * Run the Opportunity_Agent for a job (Req 10.5, 10.7).
 *
 * Builds the user prompt (including the FCF timing factor for
 * `need_sponsorship` users), invokes Bedrock through the bounded-retry wrapper
 * (Req 22.1), and validates the strict-JSON output into an
 * {@link OpportunityVerdict}. Returns an {@link InvalidVerdict} on
 * non-conforming output (Req 11.3).
 *
 * @param job - The pre-filtered job under debate.
 * @param user - The user's latest configuration (source of truth, Req 5.5).
 * @param bedrock - Injectable Bedrock invocation (stubbed in tests).
 * @param options - Bounded-retry knobs and optional logger.
 */
export async function runOpportunityAgent(
  job: Job,
  user: UserConfig,
  bedrock: BedrockInvoke,
  options: AgentInvocationOptions = {},
): Promise<OpportunityVerdict | InvalidVerdict> {
  const prompt = buildOpportunityPrompt(job, user);
  const result = await invokeAndValidate(
    'opportunity',
    OPPORTUNITY_SYSTEM_PROMPT,
    prompt,
    bedrock,
    options,
  );
  if (isInvalidVerdict(result)) {
    return result;
  }
  return result as OpportunityVerdict;
}
