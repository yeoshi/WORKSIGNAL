/**
 * Verdict-schema validator (Debate_Engine, Requirements 10.2-10.5, 11.1-11.4).
 *
 * Pure validation logic with NO I/O and NO persistence (aside from an optional
 * injected logger used only for the post-completion logging hook of Req 11.4).
 *
 * A raw agent output is accepted as a valid {@link Verdict} **if and only if**
 * (Property 8):
 *  1. it is valid JSON conforming to that agent's defined schema (Req 11.1),
 *     where the schema is the agent's verdict shape from Req 10.2-10.5, and
 *  2. every numeric score it contains lies within 0-100 inclusive (Req 11.2),
 *     with the boundary values 0 and 100 both accepted and any value strictly
 *     below 0 or strictly above 100 (or non-finite) rejected.
 *
 * When the raw output does not conform, the agent's evaluation is treated as
 * failed: {@link validateVerdict} returns an {@link InvalidVerdict} carrying the
 * agent name, a human-readable reason, and the offending raw output in its
 * `details` so the caller (Debate_Engine) can record the failure in
 * `agent_failures` and apply agent-failure recovery (Req 11.3).
 *
 * Per the design's `DebateEngine.validateVerdict(raw, agent): Verdict |
 * InvalidVerdict` contract, this module RETURNS an `InvalidVerdict` instance on
 * failure rather than throwing, so a successful and a failed validation are
 * distinguished by the return value. Use {@link isInvalidVerdict} to branch.
 *
 * "Numeric score" interpretation (Req 11.2): the four primary agent scores
 * (`ambition_score`, `match_score`, `risk_score`, `urgency_score`) are each
 * range-checked to 0-100. The Risk verdict's `glassdoor_score` is also a
 * numeric score (Req 10.4) and is therefore range-checked to 0-100 when
 * present and non-null; this comfortably accommodates Glassdoor's native
 * 0-5 scale while honouring the literal "any numeric score" rule. A `null`
 * `glassdoor_score` is explicitly permitted by the schema.
 */

import {
  InvalidVerdict,
  type AgentName,
  type AmbitionVerdict,
  type Logger,
  type OpportunityVerdict,
  type RealismVerdict,
  type RedFlag,
  type RedFlagSeverity,
  type RiskVerdict,
  type Verdict,
} from '@worksignal/shared';

/** Lowest accepted numeric score (inclusive). */
const SCORE_MIN = 0;
/** Highest accepted numeric score (inclusive). */
const SCORE_MAX = 100;

/** The allowed `verdict` values per agent (Req 10.2-10.5). */
const AMBITION_VERDICTS = ['apply', 'skip'] as const;
const REALISM_VERDICTS = ['apply', 'skip', 'caution'] as const;
const RISK_VERDICTS = ['safe', 'caution', 'avoid'] as const;
const OPPORTUNITY_VERDICTS = ['act_now', 'monitor', 'no_advantage'] as const;
const RED_FLAG_SEVERITIES: readonly RedFlagSeverity[] = ['high', 'medium', 'low'];

/**
 * Internal result of validating a candidate object against an agent schema:
 * either a clean, normalised verdict or a human-readable rejection reason.
 */
type ValidationOutcome<T extends Verdict> =
  | { readonly ok: true; readonly verdict: T }
  | { readonly ok: false; readonly reason: string };

/** Is the value a non-null, non-array plain object? */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Is the value a finite number (rejects NaN and ±Infinity)? */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Is the value a finite numeric score within 0-100 inclusive (Req 11.2)? */
function isScoreInRange(value: unknown): value is number {
  return isFiniteNumber(value) && value >= SCORE_MIN && value <= SCORE_MAX;
}

/** Is the value an array whose every element is a string? */
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/** Is the value one of the provided literal options? */
function isOneOf<T extends string>(
  value: unknown,
  options: readonly T[],
): value is T {
  return typeof value === 'string' && (options as readonly string[]).includes(value);
}

/** Validate a single Risk red flag entry (Req 10.4). */
function isRedFlag(value: unknown): value is RedFlag {
  return (
    isPlainObject(value) &&
    typeof value.flag === 'string' &&
    typeof value.source === 'string' &&
    isOneOf(value.severity, RED_FLAG_SEVERITIES)
  );
}

/** Validate a raw object against the Ambition schema (Req 10.2). */
function validateAmbition(obj: Record<string, unknown>): ValidationOutcome<AmbitionVerdict> {
  if (!isOneOf(obj.verdict, AMBITION_VERDICTS)) {
    return { ok: false, reason: `ambition.verdict must be one of ${AMBITION_VERDICTS.join('|')}` };
  }
  if (!isScoreInRange(obj.ambition_score)) {
    return { ok: false, reason: 'ambition.ambition_score must be a number within 0-100 inclusive' };
  }
  if (typeof obj.reasoning !== 'string') {
    return { ok: false, reason: 'ambition.reasoning must be a string' };
  }
  if (typeof obj.key_argument !== 'string') {
    return { ok: false, reason: 'ambition.key_argument must be a string' };
  }
  return {
    ok: true,
    verdict: {
      verdict: obj.verdict,
      ambition_score: obj.ambition_score,
      reasoning: obj.reasoning,
      key_argument: obj.key_argument,
    },
  };
}

/** Validate a raw object against the Realism schema (Req 10.3). */
function validateRealism(obj: Record<string, unknown>): ValidationOutcome<RealismVerdict> {
  if (!isOneOf(obj.verdict, REALISM_VERDICTS)) {
    return { ok: false, reason: `realism.verdict must be one of ${REALISM_VERDICTS.join('|')}` };
  }
  if (!isScoreInRange(obj.match_score)) {
    return { ok: false, reason: 'realism.match_score must be a number within 0-100 inclusive' };
  }
  if (!isStringArray(obj.key_gaps)) {
    return { ok: false, reason: 'realism.key_gaps must be an array of strings' };
  }
  if (!isStringArray(obj.work_life_flags)) {
    return { ok: false, reason: 'realism.work_life_flags must be an array of strings' };
  }
  if (typeof obj.reasoning !== 'string') {
    return { ok: false, reason: 'realism.reasoning must be a string' };
  }
  if (typeof obj.key_argument !== 'string') {
    return { ok: false, reason: 'realism.key_argument must be a string' };
  }
  return {
    ok: true,
    verdict: {
      verdict: obj.verdict,
      match_score: obj.match_score,
      key_gaps: [...obj.key_gaps],
      work_life_flags: [...obj.work_life_flags],
      reasoning: obj.reasoning,
      key_argument: obj.key_argument,
    },
  };
}

/** Validate a raw object against the Risk schema (Req 10.4). */
function validateRisk(obj: Record<string, unknown>): ValidationOutcome<RiskVerdict> {
  if (!isOneOf(obj.verdict, RISK_VERDICTS)) {
    return { ok: false, reason: `risk.verdict must be one of ${RISK_VERDICTS.join('|')}` };
  }
  if (!isScoreInRange(obj.risk_score)) {
    return { ok: false, reason: 'risk.risk_score must be a number within 0-100 inclusive' };
  }
  if (!Array.isArray(obj.red_flags) || !obj.red_flags.every(isRedFlag)) {
    return {
      ok: false,
      reason: 'risk.red_flags must be an array of { flag, source, severity } entries',
    };
  }
  // glassdoor_score is `number | null`; when a number it is a numeric score and
  // must lie within 0-100 inclusive (Req 11.2). `null` is explicitly allowed.
  if (obj.glassdoor_score !== null && !isScoreInRange(obj.glassdoor_score)) {
    return {
      ok: false,
      reason: 'risk.glassdoor_score must be null or a number within 0-100 inclusive',
    };
  }
  if (typeof obj.reasoning !== 'string') {
    return { ok: false, reason: 'risk.reasoning must be a string' };
  }
  if (typeof obj.key_argument !== 'string') {
    return { ok: false, reason: 'risk.key_argument must be a string' };
  }
  return {
    ok: true,
    verdict: {
      verdict: obj.verdict,
      risk_score: obj.risk_score,
      red_flags: (obj.red_flags as RedFlag[]).map((rf) => ({
        flag: rf.flag,
        source: rf.source,
        severity: rf.severity,
      })),
      glassdoor_score: obj.glassdoor_score as number | null,
      reasoning: obj.reasoning,
      key_argument: obj.key_argument,
    },
  };
}

/** Validate a raw object against the Opportunity schema (Req 10.5, 10.7). */
function validateOpportunity(
  obj: Record<string, unknown>,
): ValidationOutcome<OpportunityVerdict> {
  if (!isOneOf(obj.verdict, OPPORTUNITY_VERDICTS)) {
    return {
      ok: false,
      reason: `opportunity.verdict must be one of ${OPPORTUNITY_VERDICTS.join('|')}`,
    };
  }
  if (!isScoreInRange(obj.urgency_score)) {
    return { ok: false, reason: 'opportunity.urgency_score must be a number within 0-100 inclusive' };
  }
  if (!isStringArray(obj.timing_factors)) {
    return { ok: false, reason: 'opportunity.timing_factors must be an array of strings' };
  }
  if (typeof obj.reasoning !== 'string') {
    return { ok: false, reason: 'opportunity.reasoning must be a string' };
  }
  if (typeof obj.key_argument !== 'string') {
    return { ok: false, reason: 'opportunity.key_argument must be a string' };
  }
  return {
    ok: true,
    verdict: {
      verdict: obj.verdict,
      urgency_score: obj.urgency_score,
      timing_factors: [...obj.timing_factors],
      reasoning: obj.reasoning,
      key_argument: obj.key_argument,
    },
  };
}

/** Dispatch to the schema validator for the named agent. */
function validateForAgent(
  agent: AgentName,
  obj: Record<string, unknown>,
): ValidationOutcome<Verdict> {
  switch (agent) {
    case 'ambition':
      return validateAmbition(obj);
    case 'realism':
      return validateRealism(obj);
    case 'risk':
      return validateRisk(obj);
    case 'opportunity':
      return validateOpportunity(obj);
    default: {
      // Exhaustiveness guard: an unknown agent name cannot be validated.
      const exhaustive: never = agent;
      return { ok: false, reason: `unknown agent: ${String(exhaustive)}` };
    }
  }
}

/**
 * Coerce a raw agent output into a candidate object. Bedrock agents emit JSON
 * text, so a `string` is parsed as JSON (Req 11.1, "valid JSON"); a value that
 * is already an object is used directly. Returns the parsed object, or a
 * rejection reason when the input is not valid JSON or is not a JSON object.
 */
function toCandidateObject(
  raw: unknown,
): { ok: true; obj: Record<string, unknown> } | { ok: false; reason: string } {
  let value: unknown = raw;

  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return { ok: false, reason: 'output is not valid JSON' };
    }
  }

  if (!isPlainObject(value)) {
    return { ok: false, reason: 'output is not a JSON object' };
  }

  return { ok: true, obj: value };
}

/** Options for {@link validateVerdict}. */
export interface ValidateVerdictOptions {
  /**
   * Optional structured logger. When validation fails and a logger is
   * provided, the invalid output is logged at `warn` level. This is the
   * general-purpose logging path; for invalid output detected *after* an
   * evaluation has been marked complete use
   * {@link logInvalidVerdictAfterCompletion} (Req 11.4) so the completed status
   * is preserved.
   */
  logger?: Logger;
}

/**
 * Validate a raw agent output against the schema for `agent` (Req 11.1-11.3).
 *
 * @param raw - The raw agent output: a JSON string or an already-parsed value.
 * @param agent - The agent whose schema the output must conform to.
 * @param options - Optional logger for recording rejections.
 * @returns A clean, normalised {@link Verdict} when the output conforms to the
 *   agent's schema and every numeric score is within 0-100 inclusive;
 *   otherwise an {@link InvalidVerdict} (the failed-evaluation marker) whose
 *   `details` carries `{ agent, reason, raw }`.
 */
export function validateVerdict(
  raw: unknown,
  agent: AgentName,
  options: ValidateVerdictOptions = {},
): Verdict | InvalidVerdict {
  const reject = (reason: string): InvalidVerdict => {
    const error = new InvalidVerdict(
      `Invalid ${agent} verdict: ${reason}`,
      { agent, reason, raw },
    );
    options.logger?.warn('debate.verdict.invalid', { agent, reason });
    return error;
  };

  const candidate = toCandidateObject(raw);
  if (!candidate.ok) {
    return reject(candidate.reason);
  }

  const outcome = validateForAgent(agent, candidate.obj);
  if (!outcome.ok) {
    return reject(outcome.reason);
  }

  return outcome.verdict;
}

/** Type guard: did {@link validateVerdict} reject the output? */
export function isInvalidVerdict(
  result: Verdict | InvalidVerdict,
): result is InvalidVerdict {
  return result instanceof InvalidVerdict;
}

/**
 * Logging hook for invalid output detected *after* an agent's evaluation has
 * already been marked complete (Req 11.4).
 *
 * Late validation must not retroactively fail a completed evaluation: this
 * helper logs the invalid output (so it is auditable) and returns the existing
 * `completedStatus` unchanged, preserving the completed state. It performs no
 * mutation beyond emitting a log entry.
 *
 * @param raw - The raw agent output that failed late validation.
 * @param agent - The agent whose completed evaluation produced the output.
 * @param logger - Structured logger used to record the invalid output.
 * @param completedStatus - The already-recorded completed status to preserve.
 * @returns `completedStatus`, unchanged.
 */
export function logInvalidVerdictAfterCompletion<TStatus>(
  raw: unknown,
  agent: AgentName,
  logger: Logger,
  completedStatus: TStatus,
): TStatus {
  const result = validateVerdict(raw, agent);
  if (isInvalidVerdict(result)) {
    logger.warn('debate.verdict.invalid_after_completion', {
      agent,
      reason: result.details,
      preserved_status: completedStatus,
    });
  }
  return completedStatus;
}
