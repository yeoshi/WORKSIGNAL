/**
 * Shared infrastructure for the four Bedrock debate agents (Task 13.1).
 *
 * Each debate agent (Ambition, Realism, Risk, Opportunity) is a Bedrock task
 * (Claude Sonnet) with a **fixed system prompt** (verbatim from PRD §6) and a
 * **strict JSON output contract** validated by the Debate_Engine's verdict
 * validator. This module holds the pieces those agents share:
 *
 *  - The injectable {@link BedrockInvoke} call shape, so the underlying Bedrock
 *    invocation can be stubbed in tests with no real AWS SDK calls.
 *  - The injectable {@link ExaClient} used by the Risk_Agent for company
 *    research (Req 10.4, 22.2).
 *  - {@link AgentInvocationOptions} threading the bounded-retry knobs
 *    (Req 22.1) and an optional logger through to every agent.
 *  - {@link invokeAndValidate}, the common "invoke Bedrock via the bounded-retry
 *    wrapper, then parse/validate strict JSON into a verdict" path shared by all
 *    four agents.
 *  - Prompt-building helpers that render a {@link Job} and {@link UserConfig}
 *    into the user-prompt text each agent sends to Bedrock.
 *
 * The agents themselves (ambition.ts, realism.ts, risk.ts, opportunity.ts) own
 * only their fixed system prompt and the agent-specific parts of their user
 * prompt; everything reusable lives here.
 */

import type {
  AgentName,
  InvalidVerdict,
  Job,
  Logger,
  UserConfig,
  Verdict,
} from '@worksignal/shared';
import {
  invokeWithBoundedRetry,
  type BackoffFn,
  type RateLimitPredicate,
  type SleepFn,
} from '../../bedrock/invoke.js';
import { validateVerdict } from '../verdictValidator.js';

/**
 * The Fair Consideration Framework (FCF) minimum listing duration, in days,
 * that a role must be advertised on MyCareersFuture before a foreigner may be
 * hired. Used by the Opportunity_Agent's timing analysis for `need_sponsorship`
 * users (Req 10.7).
 */
export const FCF_LISTING_DAYS = 14 as const;

/** A single Bedrock prompt: a fixed system prompt plus the rendered user prompt. */
export interface BedrockRequest {
  /** The agent's fixed system prompt (verbatim from PRD §6). */
  system: string;
  /** The per-job user prompt built from the Job + UserConfig. */
  user: string;
}

/**
 * An injectable Bedrock invocation. Given a {@link BedrockRequest}, resolves to
 * the model's raw completion text (expected to be strict JSON per the agent's
 * output contract). Injected so tests can exercise the agents deterministically
 * without real Bedrock calls.
 */
export type BedrockInvoke = (request: BedrockRequest) => Promise<string>;

/** A single research result returned by the Exa client (Req 10.4). */
export interface ExaResult {
  /** The result's title, when available. */
  title?: string;
  /** The source URL — used as the `source` of a Risk red flag. */
  url: string;
  /** Extracted text / snippet for the result, when available. */
  text?: string;
  /** ISO publish date, when available. */
  publishedDate?: string;
}

/**
 * An injectable Exa research client. Given a (Singapore-scoped) query string,
 * resolves to the list of results. Injected so the Risk_Agent can be tested
 * with no real Exa calls — including the **empty-results** path (Req 22.2).
 */
export type ExaClient = (query: string) => Promise<ExaResult[]>;

/**
 * Options common to every agent invocation. The retry knobs are forwarded to
 * the bounded-retry Bedrock wrapper (Req 22.1) so the hard cap of three retries
 * is always honoured; tests inject `sleep`/`maxRetries` for determinism. An
 * optional logger records invalid agent output (Req 11.3).
 */
export interface AgentInvocationOptions {
  /** Delay function between retries; defaults to a real timer in the wrapper. */
  sleep?: SleepFn;
  /** Rate-limit predicate; defaults to the wrapper's Bedrock throttling check. */
  isRateLimit?: RateLimitPredicate;
  /** Requested retry budget; clamped to the hard cap of three by the wrapper. */
  maxRetries?: number;
  /** Base backoff delay in ms; defaults to the wrapper's default. */
  baseDelayMs?: number;
  /** Backoff schedule; defaults to exponential in the wrapper. */
  backoff?: BackoffFn;
  /** Optional structured logger for recording invalid verdicts. */
  logger?: Logger;
}

/**
 * Invoke a Bedrock agent call through the bounded-retry wrapper (Req 22.1) and
 * parse/validate its raw output into a {@link Verdict} for `agent` (Req
 * 11.1-11.2). Returns the validated verdict, or an {@link InvalidVerdict} when
 * the output does not conform to the agent's schema (Req 11.3).
 *
 * This is the shared core of all four agents: a fixed system prompt + a built
 * user prompt → Bedrock (bounded retry) → strict-JSON validation.
 */
export async function invokeAndValidate(
  agent: AgentName,
  system: string,
  userPrompt: string,
  bedrock: BedrockInvoke,
  options: AgentInvocationOptions = {},
): Promise<Verdict | InvalidVerdict> {
  const raw = await invokeWithBoundedRetry<string>({
    invoke: () => bedrock({ system, user: userPrompt }),
    sleep: options.sleep,
    isRateLimit: options.isRateLimit,
    maxRetries: options.maxRetries,
    baseDelayMs: options.baseDelayMs,
    backoff: options.backoff,
  });
  return validateVerdict(raw, agent, { logger: options.logger });
}

/** Format a (possibly empty) string list for inclusion in a prompt. */
function formatList(label: string, items: readonly string[]): string {
  if (items.length === 0) {
    return `${label}: (none provided)`;
  }
  return `${label}: ${items.join(', ')}`;
}

/**
 * Render a {@link Job} into the job-facts block shared by every agent's user
 * prompt. Untrusted job text is passed only as data (never executed).
 */
export function formatJob(job: Job): string {
  return [
    'JOB:',
    `- Company: ${job.company}`,
    `- Role: ${job.role_title}`,
    `- Salary range (SGD/month): ${job.salary_min} - ${job.salary_max}`,
    `- Employment type: ${job.employment_type}`,
    `- Work arrangement: ${job.work_arrangement}`,
    `- Location: ${job.location}`,
    `- Posted at: ${job.posted_at}`,
    `- Days listed on MyCareersFuture: ${job.mcf_listing_days}`,
    `- EP sponsorship signalled: ${job.ep_sponsorship_signal ? 'yes' : 'no'}`,
    `- Source URL: ${job.source_url}`,
    '- Job description:',
    job.jd_text,
  ].join('\n');
}

/**
 * Render the user's profile and calibration into the user-facts block shared by
 * every agent's user prompt. Includes the per-user priority ranking and
 * residency status, which several agents key off.
 */
export function formatUser(user: UserConfig): string {
  const p = user.profile;
  const lines = [
    'USER PROFILE:',
    `- Career stage: ${user.career_stage ?? 'unknown'}`,
    `- Residency status: ${user.residency_status ?? 'unknown'}`,
    `- Current role: ${p.current_role ?? 'unknown'}`,
    `- Years of experience: ${p.years_experience ?? 0}`,
    formatList('- Skills', p.skills ?? []),
    `- Education: ${p.education ?? 'not specified'}`,
    `- University: ${p.university ?? 'not specified'}`,
    formatList('- Target roles', p.target_roles ?? []),
    formatList('- Target industries', p.target_industries ?? []),
    formatList('- Dream companies', p.dream_companies ?? []),
    `- Priority ranking (highest first): ${(p.priority_ranking ?? []).join(' > ') || 'not specified'}`,
    `- Minimum salary (SGD/month): ${user.non_negotiables.min_salary}`,
  ];
  if (user.career_switch_context) {
    lines.push(
      `- Career switch: from "${user.career_switch_context.from}" to "${user.career_switch_context.to}"`,
    );
  }
  return lines.join('\n');
}

/** Does the user require Employment Pass sponsorship (Req 10.7, 9.3, 9.4)? */
export function needsSponsorship(user: UserConfig): boolean {
  return (
    user.residency_status === 'need_sponsorship' ||
    user.non_negotiables.ep_sponsorship_required
  );
}

/** Standard trailer instructing the model to emit only strict JSON. */
export const STRICT_JSON_TRAILER =
  'Respond with ONLY the JSON object specified in your output contract. ' +
  'Do not include markdown fences, commentary, or any text outside the JSON.';
