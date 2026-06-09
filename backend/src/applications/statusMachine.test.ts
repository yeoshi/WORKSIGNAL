/**
 * Property-based and unit tests for application status validity.
 *
 * Feature: worksignal, Property 13: Application status is always a single valid
 * enum value.
 * Validates: Requirements 16.5, 16.7, 16.8, 17.3
 *
 * Property 13 states that, across *all* creation paths (employer email →
 * `sent`, no employer email → `redirected_external`, bounce → `delivery_failed`)
 * AND *all* update sequences (arbitrary chronological sequences of reply
 * classifications applied via `progressReplyStatus`), the resulting application
 * status is always exactly one valid `ApplicationStatus` enum value — i.e. a
 * member of `VALID_APPLICATION_STATUSES`. The status model is total: there is
 * no input (creation path or reply sequence) that can leave an application in
 * an undefined, multi-valued, or out-of-enum status.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  APPLICATION_STATUSES,
  type ApplicationStatus,
  type Classification,
  type ReplyLabel,
} from '@worksignal/shared';
import {
  deriveInitialStatus,
  isValidApplicationStatus,
  VALID_APPLICATION_STATUSES,
  type ApplicationCreationPath,
} from './statusMachine.js';
import { progressReplyStatus } from './replyProgression.js';

/** Minimum fast-check iterations required by the spec for property tests. */
const NUM_RUNS = 200;

/* --- Generators ----------------------------------------------------------- */

/**
 * Every creation path, so the property exercises all three send paths
 * (Req 16.5 / 16.7 / 16.8): employer email, no employer email, and bounce.
 */
const creationPathArb: fc.Arbitrary<ApplicationCreationPath> = fc.constantFrom<
  ApplicationCreationPath
>(
  { kind: 'employer_email' },
  { kind: 'no_employer_email' },
  { kind: 'bounce' },
);

/** Every reply classification label (Req 18). */
const replyLabelArb: fc.Arbitrary<ReplyLabel> = fc.constantFrom<ReplyLabel>(
  'acknowledgement',
  'callback',
  'rejection',
  'other',
);

/**
 * An arbitrary reply classification: any label with a Classification_Confidence
 * spanning the full 0–100 range, deliberately including the 60 boundary and the
 * extremes so update sequences cover both high- (>= 60) and low-confidence
 * (< 60) transitions.
 */
const classificationArb: fc.Arbitrary<Classification> = fc.record({
  label: replyLabelArb,
  confidence: fc.integer({ min: 0, max: 100 }),
});

/**
 * An arbitrary chronological (oldest-first) sequence of reply classifications,
 * including the empty sequence (no replies → initial status is retained).
 */
const replySequenceArb: fc.Arbitrary<Classification[]> = fc.array(
  classificationArb,
  { minLength: 0, maxLength: 12 },
);

/* --- Property 13 ---------------------------------------------------------- */

describe('Feature: worksignal, Property 13: Application status is always a single valid enum value', () => {
  it('initial status from any creation path is exactly one valid enum value [Validates: Requirements 16.5, 16.7, 16.8, 17.3]', () => {
    fc.assert(
      fc.property(creationPathArb, (path) => {
        const status = deriveInitialStatus(path);
        expect(isValidApplicationStatus(status)).toBe(true);
        expect(VALID_APPLICATION_STATUSES.has(status)).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('status after ANY creation path + ANY update sequence is exactly one valid enum value [Validates: Requirements 16.5, 16.7, 16.8, 17.3]', () => {
    fc.assert(
      fc.property(creationPathArb, replySequenceArb, (path, replies) => {
        const initial = deriveInitialStatus(path);
        const finalStatus = progressReplyStatus(initial, replies);

        // Single-valued: the result is one string, and that string is a member
        // of the canonical enum set.
        expect(typeof finalStatus).toBe('string');
        expect(isValidApplicationStatus(finalStatus)).toBe(true);
        expect(VALID_APPLICATION_STATUSES.has(finalStatus)).toBe(true);
        expect(APPLICATION_STATUSES).toContain(finalStatus);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('remains valid when update sequences are applied incrementally (every intermediate status is valid)', () => {
    fc.assert(
      fc.property(creationPathArb, replySequenceArb, (path, replies) => {
        let status: ApplicationStatus = deriveInitialStatus(path);
        expect(VALID_APPLICATION_STATUSES.has(status)).toBe(true);
        // Feed progressively longer prefixes; each fold result must stay valid.
        for (let i = 1; i <= replies.length; i += 1) {
          status = progressReplyStatus(
            deriveInitialStatus(path),
            replies.slice(0, i),
          );
          expect(VALID_APPLICATION_STATUSES.has(status)).toBe(true);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

/* --- Supporting unit tests ------------------------------------------------ */

describe('deriveInitialStatus — creation-path mapping', () => {
  it('maps employer_email → sent (Req 16.5)', () => {
    expect(deriveInitialStatus({ kind: 'employer_email' })).toBe('sent');
  });

  it('maps no_employer_email → redirected_external (Req 16.7)', () => {
    expect(deriveInitialStatus({ kind: 'no_employer_email' })).toBe(
      'redirected_external',
    );
  });

  it('maps bounce → delivery_failed (Req 16.8)', () => {
    expect(deriveInitialStatus({ kind: 'bounce' })).toBe('delivery_failed');
  });
});

describe('isValidApplicationStatus — enum membership guard (Req 17.3)', () => {
  it('accepts every canonical status', () => {
    for (const status of APPLICATION_STATUSES) {
      expect(isValidApplicationStatus(status)).toBe(true);
    }
  });

  it('rejects non-members and non-strings', () => {
    for (const bad of ['SENT', 'unknown', '', null, undefined, 42, {}, []]) {
      expect(isValidApplicationStatus(bad)).toBe(false);
    }
  });
});
