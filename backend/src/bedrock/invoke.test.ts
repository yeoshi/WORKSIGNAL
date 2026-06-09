/**
 * Property-based and unit tests for the bounded-retry Bedrock invocation
 * wrapper (task 10.2, Req 22.1).
 *
 * Feature: worksignal, Property 21: Bedrock retries are bounded
 *
 * Validates: Requirements 22.1
 *
 * The wrapper {@link invokeWithBoundedRetry} retries Bedrock calls on
 * rate-limit responses with exponential backoff, but never more than
 * {@link MAX_RETRY_ATTEMPTS} (= 3) times. Therefore the underlying `invoke`
 * function is called **at most** `1 + MAX_RETRY_ATTEMPTS` (= 4) times for any
 * sequence of rate-limit responses — even one that is always rate-limited.
 *
 * The tests are deterministic and fast: the underlying call, the rate-limit
 * predicate, and `sleep` are all injected, so there are no real AWS calls and
 * no real timers.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  invokeWithBoundedRetry,
  MAX_RETRY_ATTEMPTS,
} from './invoke.js';

/** Sentinel rate-limit error recognised by our injected predicate. */
class RateLimitError extends Error {
  readonly kind = 'rate_limit' as const;
  constructor() {
    super('rate limited (429)');
    this.name = 'RateLimitError';
  }
}

/** A non-rate-limit error: must never be retried. */
class FatalError extends Error {
  readonly kind = 'fatal' as const;
  constructor() {
    super('non-retryable failure');
    this.name = 'FatalError';
  }
}

/** No-op sleep so the property test runs instantly and deterministically. */
const noopSleep = async (_ms: number): Promise<void> => {
  void _ms;
};

/** Injected predicate: only {@link RateLimitError} is retryable. */
const isRateLimit = (error: unknown): boolean => error instanceof RateLimitError;

/**
 * One outcome of an underlying invoke attempt.
 *  - `rate_limit`: throws a retryable rate-limit error
 *  - `success`: resolves successfully
 *  - `fatal`: throws a non-retryable error
 */
type Outcome = 'rate_limit' | 'success' | 'fatal';

const outcomeArb: fc.Arbitrary<Outcome> = fc.constantFrom(
  'rate_limit',
  'success',
  'fatal',
);

/** The hard cap on total underlying calls: initial attempt + max retries. */
const MAX_TOTAL_CALLS = 1 + MAX_RETRY_ATTEMPTS;

/**
 * Build an `invoke` stub that walks a scripted list of outcomes, recording how
 * many times it was called. If the wrapper asks for more attempts than the
 * script provides, the final outcome repeats (so an all-rate-limit script
 * keeps rate-limiting forever).
 */
function makeScriptedInvoke(script: readonly Outcome[]): {
  invoke: () => Promise<string>;
  callCount: () => number;
} {
  let calls = 0;
  const invoke = async (): Promise<string> => {
    const outcome = script[Math.min(calls, script.length - 1)] ?? 'rate_limit';
    calls += 1;
    switch (outcome) {
      case 'success':
        return 'ok';
      case 'fatal':
        throw new FatalError();
      case 'rate_limit':
      default:
        throw new RateLimitError();
    }
  };
  return { invoke, callCount: () => calls };
}

describe('Feature: worksignal, Property 21: Bedrock retries are bounded', () => {
  it('underlying invoke is called at most 1 + MAX_RETRY_ATTEMPTS times for ANY outcome sequence [Validates: Requirements 22.1]', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(outcomeArb, { minLength: 1, maxLength: 12 }),
        async (script) => {
          const { invoke, callCount } = makeScriptedInvoke(script);
          try {
            await invokeWithBoundedRetry({
              invoke,
              isRateLimit,
              sleep: noopSleep,
            });
          } catch {
            // Either an exhausted rate-limit or a fatal error — both fine here.
          }
          // The core bound: retries never exceed MAX_RETRY_ATTEMPTS.
          expect(callCount()).toBeLessThanOrEqual(MAX_TOTAL_CALLS);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('an always-rate-limited sequence calls invoke EXACTLY 1 + MAX_RETRY_ATTEMPTS times and then throws', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Length is irrelevant — the scripted invoke repeats the final outcome,
        // so this is "always rate limited" regardless of array size.
        fc.array(fc.constant<Outcome>('rate_limit'), { minLength: 1, maxLength: 5 }),
        async (script) => {
          const { invoke, callCount } = makeScriptedInvoke(script);
          await expect(
            invokeWithBoundedRetry({ invoke, isRateLimit, sleep: noopSleep }),
          ).rejects.toBeInstanceOf(RateLimitError);
          expect(callCount()).toBe(MAX_TOTAL_CALLS);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('a success on attempt k stops all further calls (called exactly k times)', async () => {
    await fc.assert(
      fc.asyncProperty(
        // k-1 rate limits followed by a success; k in [1, 1 + MAX_RETRY_ATTEMPTS].
        fc.integer({ min: 0, max: MAX_RETRY_ATTEMPTS }),
        async (priorRateLimits) => {
          const script: Outcome[] = [
            ...Array<Outcome>(priorRateLimits).fill('rate_limit'),
            'success',
          ];
          const { invoke, callCount } = makeScriptedInvoke(script);
          const result = await invokeWithBoundedRetry({
            invoke,
            isRateLimit,
            sleep: noopSleep,
          });
          expect(result).toBe('ok');
          // Exactly the attempts up to and including the successful one.
          expect(callCount()).toBe(priorRateLimits + 1);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('a non-rate-limit error is never retried (invoke called exactly once)', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Whatever follows the fatal error must never be reached.
        fc.array(outcomeArb, { minLength: 0, maxLength: 6 }),
        async (tail) => {
          const { invoke, callCount } = makeScriptedInvoke(['fatal', ...tail]);
          await expect(
            invokeWithBoundedRetry({ invoke, isRateLimit, sleep: noopSleep }),
          ).rejects.toBeInstanceOf(FatalError);
          expect(callCount()).toBe(1);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('invokeWithBoundedRetry — unit examples', () => {
  it('returns immediately on first-attempt success without sleeping', async () => {
    let slept = 0;
    const result = await invokeWithBoundedRetry({
      invoke: async () => 42,
      isRateLimit,
      sleep: async () => {
        slept += 1;
      },
    });
    expect(result).toBe(42);
    expect(slept).toBe(0);
  });

  it('clamps an oversized maxRetries down to the hard cap of three', async () => {
    const { invoke, callCount } = makeScriptedInvoke(['rate_limit']);
    await expect(
      invokeWithBoundedRetry({
        invoke,
        isRateLimit,
        sleep: noopSleep,
        maxRetries: 100,
      }),
    ).rejects.toBeInstanceOf(RateLimitError);
    expect(callCount()).toBe(MAX_TOTAL_CALLS);
  });

  it('honours a smaller maxRetries (0 retries = single attempt)', async () => {
    const { invoke, callCount } = makeScriptedInvoke(['rate_limit']);
    await expect(
      invokeWithBoundedRetry({
        invoke,
        isRateLimit,
        sleep: noopSleep,
        maxRetries: 0,
      }),
    ).rejects.toBeInstanceOf(RateLimitError);
    expect(callCount()).toBe(1);
  });

  it('sleeps once per retry on an always-rate-limited call', async () => {
    let slept = 0;
    const { invoke } = makeScriptedInvoke(['rate_limit']);
    await expect(
      invokeWithBoundedRetry({
        invoke,
        isRateLimit,
        sleep: async () => {
          slept += 1;
        },
      }),
    ).rejects.toBeInstanceOf(RateLimitError);
    // One sleep before each of the MAX_RETRY_ATTEMPTS retries.
    expect(slept).toBe(MAX_RETRY_ATTEMPTS);
  });
});
