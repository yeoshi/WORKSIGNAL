/**
 * Bounded-retry Bedrock invocation wrapper (Requirement 22.1).
 *
 * All agent reasoning and generation in WORKSIGNAL runs through Bedrock
 * (Claude Sonnet, region `ap-southeast-1`). Under load Bedrock can answer a
 * request with a throttling / rate-limit response (HTTP 429). This module wraps
 * a single Bedrock call so that such responses are retried with exponential
 * backoff, but only a **bounded** number of times.
 *
 * Design reference (design.md — Error Handling):
 *   "Bedrock rate limit (429) → Step Functions `Retry` with exponential
 *    backoff, **max 3 attempts** (22.1)."
 * and the Step Functions notes:
 *   "Retry/Catch on each Bedrock task handles rate-limits (exponential backoff,
 *    max 3)."
 *
 * In production the orchestration runs as Step Functions `Retry` policy; this
 * Lambda-side wrapper provides the equivalent semantics for code paths that
 * call Bedrock directly, and is the single, deterministically-testable source
 * of truth for the retry bound.
 *
 * Requirement:
 *  - 22.1: WHEN a Bedrock task receives a rate-limit (429) response, THE system
 *          SHALL retry with exponential backoff, capped at a maximum of three
 *          retry attempts per invocation.
 *
 * Correctness property (Property 21 — Bedrock retries are bounded): for *any*
 * sequence of Bedrock rate-limit responses, this wrapper issues **at most
 * three** retry attempts for a single invocation — i.e. the underlying call is
 * made at most `1 + MAX_RETRY_ATTEMPTS` (= 4) times. The property test lives in
 * task 10.2.
 *
 * Testability: the underlying call, the sleep/delay function, and the
 * rate-limit detection predicate are all injectable, so the retry behaviour can
 * be exercised deterministically with no real AWS SDK calls and no real timers.
 * Non-rate-limit errors are never retried — they propagate immediately.
 */

/**
 * The hard maximum number of *retry* attempts for a single invocation (Req
 * 22.1). The initial attempt is not a retry, so the underlying call is made at
 * most `1 + MAX_RETRY_ATTEMPTS` times. This cap can never be exceeded, even if
 * a caller passes a larger {@link BoundedRetryOptions.maxRetries}.
 */
export const MAX_RETRY_ATTEMPTS = 3 as const;

/**
 * Default base delay, in milliseconds, used to seed the exponential backoff.
 * The delay before retry number `n` (0-indexed) is
 * `baseDelayMs * 2 ** n` (see {@link defaultBackoffMs}).
 */
export const DEFAULT_BASE_DELAY_MS = 500;

/**
 * Predicate that decides whether an error/response represents a Bedrock
 * rate-limit (HTTP 429 / throttling) that is eligible for retry. Pure and
 * total over any input.
 */
export type RateLimitPredicate = (error: unknown) => boolean;

/** Awaitable delay function (injected so tests need no real timers). */
export type SleepFn = (ms: number) => Promise<void>;

/**
 * Computes the backoff delay (ms) to wait *before* a given retry. `retryIndex`
 * is 0-indexed: `0` is the wait before the first retry, `1` before the second,
 * and so on. Pure and deterministic.
 */
export type BackoffFn = (retryIndex: number, baseDelayMs: number) => number;

/** Options for {@link invokeWithBoundedRetry}. */
export interface BoundedRetryOptions<T> {
  /**
   * The underlying Bedrock call to perform. Invoked once per attempt. Injected
   * so callers (and tests) control exactly what the call does.
   */
  invoke: () => Promise<T>;
  /**
   * Detects whether a thrown error is a retryable rate-limit response. Defaults
   * to {@link isRateLimitError}. Only errors for which this returns `true` are
   * retried; all other errors propagate immediately without retry.
   */
  isRateLimit?: RateLimitPredicate;
  /**
   * Delay function used between attempts. Defaults to a real `setTimeout`-based
   * sleep ({@link realSleep}); tests inject a no-op or recording stub.
   */
  sleep?: SleepFn;
  /**
   * Requested maximum number of retry attempts. Clamped to
   * `[0, MAX_RETRY_ATTEMPTS]`, so the hard cap of three can never be exceeded.
   * Defaults to {@link MAX_RETRY_ATTEMPTS}.
   */
  maxRetries?: number;
  /** Base delay seeding the backoff. Defaults to {@link DEFAULT_BASE_DELAY_MS}. */
  baseDelayMs?: number;
  /**
   * Backoff schedule. Defaults to exponential ({@link defaultBackoffMs}).
   * Injected for tests that want to assert on the delays requested.
   */
  backoff?: BackoffFn;
}

/**
 * Default exponential backoff: `baseDelayMs * 2 ** retryIndex`. Deterministic
 * and non-negative for any non-negative inputs. A negative `retryIndex` is
 * treated as `0`.
 */
export function defaultBackoffMs(retryIndex: number, baseDelayMs: number): number {
  const index = retryIndex > 0 ? retryIndex : 0;
  return baseDelayMs * 2 ** index;
}

/** Real timer-based sleep, used outside tests. */
export function realSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Default rate-limit detector for AWS Bedrock throttling responses.
 *
 * Recognises the common signals the AWS SDK surfaces for HTTP 429 throttling:
 *  - an error `name`/`code` of `ThrottlingException`, `TooManyRequestsException`,
 *    `ThrottledException`, `LimitExceededException`, or `Throttling`;
 *  - an HTTP status code of `429` (on the error, or its `$metadata`);
 *  - a `retryable` / `$retryable.throttling` flag set by the SDK.
 *
 * Pure and total: returns `false` for `null`, primitives, and anything that
 * doesn't carry one of the above signals.
 */
export function isRateLimitError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const e = error as Record<string, unknown>;

  const throttleNames = new Set([
    'throttlingexception',
    'toomanyrequestsexception',
    'throttledexception',
    'limitexceededexception',
    'throttling',
    'provisionedthroughputexceededexception',
  ]);

  const nameLike = [e['name'], e['code'], e['__type']]
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.toLowerCase());
  if (nameLike.some((n) => throttleNames.has(n))) {
    return true;
  }

  if (statusCodeOf(e) === 429) {
    return true;
  }

  const retryable = e['$retryable'];
  if (
    typeof retryable === 'object' &&
    retryable !== null &&
    (retryable as Record<string, unknown>)['throttling'] === true
  ) {
    return true;
  }

  return false;
}

/** Extracts an HTTP status code from an error shape, if present. */
function statusCodeOf(e: Record<string, unknown>): number | undefined {
  const direct = e['statusCode'] ?? e['httpStatusCode'] ?? e['$statusCode'];
  if (typeof direct === 'number') {
    return direct;
  }
  const metadata = e['$metadata'];
  if (typeof metadata === 'object' && metadata !== null) {
    const code = (metadata as Record<string, unknown>)['httpStatusCode'];
    if (typeof code === 'number') {
      return code;
    }
  }
  return undefined;
}

/**
 * Invoke a Bedrock call with bounded exponential-backoff retry on rate-limit
 * responses (Req 22.1, Property 21).
 *
 * Semantics:
 *  1. The underlying {@link BoundedRetryOptions.invoke} call is attempted.
 *  2. On success its value is returned immediately.
 *  3. If it throws and the error is **not** a rate-limit (per
 *     {@link BoundedRetryOptions.isRateLimit}), the error propagates at once —
 *     non-rate-limit errors are never retried.
 *  4. If it throws a rate-limit error and fewer than `maxRetries` retries have
 *     been used, the wrapper sleeps for the backoff delay and retries.
 *  5. Once `maxRetries` retries are exhausted, the most recent rate-limit error
 *     is rethrown.
 *
 * The number of retries is hard-capped at {@link MAX_RETRY_ATTEMPTS} (3): even
 * a `maxRetries` argument larger than 3 is clamped down, so the underlying call
 * is made at most 4 times in total. A `maxRetries` below 0 is clamped to 0.
 *
 * @typeParam T - The result type of the underlying Bedrock call.
 * @returns The resolved value of the first successful attempt.
 * @throws The last rate-limit error if all retries are exhausted, or any
 *         non-rate-limit error immediately.
 */
export async function invokeWithBoundedRetry<T>(
  options: BoundedRetryOptions<T>,
): Promise<T> {
  const {
    invoke,
    isRateLimit = isRateLimitError,
    sleep = realSleep,
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
    backoff = defaultBackoffMs,
  } = options;

  // Clamp the requested retry budget to the hard maximum. This is the
  // invariant Property 21 depends on: retries can never exceed three.
  const requested = options.maxRetries ?? MAX_RETRY_ATTEMPTS;
  const maxRetries = Math.min(
    MAX_RETRY_ATTEMPTS,
    Math.max(0, Math.floor(requested)),
  );

  // `retriesUsed` counts only retries, not the initial attempt.
  for (let retriesUsed = 0; ; retriesUsed += 1) {
    try {
      return await invoke();
    } catch (error) {
      // Non-rate-limit errors are never retried.
      if (!isRateLimit(error)) {
        throw error;
      }
      // Rate-limited but no retry budget left: surface the failure.
      if (retriesUsed >= maxRetries) {
        throw error;
      }
      // Wait out the exponential backoff, then retry.
      await sleep(Math.max(0, backoff(retriesUsed, baseDelayMs)));
    }
  }
}
