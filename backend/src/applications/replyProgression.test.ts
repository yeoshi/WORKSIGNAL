/**
 * Property test for **reply-status progression by classification confidence**
 * (task 7.4, Req 18.5/18.6/18.7).
 *
 * Feature: worksignal, Property 14: Reply-status progression follows confidence
 * rules.
 *
 * **Validates: Requirements 18.5, 18.6, 18.7**
 *
 * Property statement (design §Property 14): *for any* ordered (oldest-first)
 * sequence of reply classifications applied to an application's initial status,
 * the status after processing equals the classification of the **most recent**
 * reply whose confidence is `>= 60`; if the most recent processed reply has
 * confidence `< 60` it yields `needs_review`; and any later `>= 60` reply
 * overrides prior classifications. With no replies the initial status is
 * unchanged.
 *
 * Because every reply fully determines the next status (a `>= 60` reply sets the
 * status from its classification and overrides any prior one — 18.5/18.7 — while
 * a `< 60` reply sets `needs_review` — 18.6), the final status is fully
 * determined by the **last processed reply**. The facets below exercise:
 *   (a) General fold — final status equals the last reply's classification
 *       status (`statusForClassification` of the most recent reply).
 *   (b) Empty sequence — the initial status is returned unchanged.
 *   (c) Override (18.7) — a trailing `>= 60` reply wins regardless of history.
 *   (d) Low-confidence tail (18.6) — a trailing `< 60` reply yields
 *       `needs_review` regardless of history.
 *   (e) Boundary — confidence exactly 60 counts as high confidence (label
 *       mapping applies, never `needs_review`).
 *   (f) Single-step mapping (18.5/18.6) — `statusForClassification` is correct
 *       and total against an independent oracle.
 *
 * Generators run a minimum of 100 iterations (numRuns below) and explicitly
 * include a Classification_Confidence of exactly 60.
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
  CONFIDENCE_THRESHOLD,
  applyReplyClassification,
  progressReplyStatus,
  statusForClassification,
} from './replyProgression.js';

const NUM_RUNS = 200;

/* --- Independent oracle --------------------------------------------------- */

/**
 * Independent (test-owned) mapping from a high-confidence (`>= 60`) reply label
 * to the application status it implies. Duplicated here intentionally so the
 * test does not lean on the implementation's own table when asserting the
 * single-step mapping (18.5).
 */
const EXPECTED_HIGH_CONFIDENCE_STATUS: Record<ReplyLabel, ApplicationStatus> = {
  callback: 'callback',
  rejection: 'rejected',
  acknowledgement: 'opened',
  other: 'opened',
};

/** Oracle for a single reply: `>= 60` → label status, else `needs_review`. */
function expectedStatusForReply(reply: Classification): ApplicationStatus {
  return reply.confidence >= CONFIDENCE_THRESHOLD
    ? EXPECTED_HIGH_CONFIDENCE_STATUS[reply.label]
    : 'needs_review';
}

/* --- Arbitraries ---------------------------------------------------------- */

const replyLabel = fc.constantFrom<ReplyLabel>(
  'acknowledgement',
  'callback',
  'rejection',
  'other',
);

/**
 * Classification_Confidence in 0-100. The `fc.constant(CONFIDENCE_THRESHOLD)`
 * branch guarantees the boundary value 60 is exercised (Property 14 boundary).
 */
const confidence = fc.oneof(
  fc.integer({ min: 0, max: 100 }),
  fc.constant(CONFIDENCE_THRESHOLD),
);

/** Confidence strictly below the threshold (yields `needs_review`, 18.6). */
const lowConfidence = fc.integer({ min: 0, max: CONFIDENCE_THRESHOLD - 1 });
/** Confidence at or above the threshold, including exactly 60 (18.5). */
const highConfidence = fc.integer({ min: CONFIDENCE_THRESHOLD, max: 100 });

const classification: fc.Arbitrary<Classification> = fc.record({
  label: replyLabel,
  confidence,
});

function classificationWith(
  conf: fc.Arbitrary<number>,
): fc.Arbitrary<Classification> {
  return fc.record({ label: replyLabel, confidence: conf });
}

const replies = fc.array(classification, { maxLength: 8 });
const initialStatus = fc.constantFrom<ApplicationStatus>(...APPLICATION_STATUSES);

/* --- Properties ----------------------------------------------------------- */

describe('Feature: worksignal, Property 14: reply-status progression follows confidence rules', () => {
  // (a) General fold: the final status is decided by the most recent reply.
  it('final status equals the classification status of the most recent reply', () => {
    fc.assert(
      fc.property(initialStatus, replies, (initial, history) => {
        const result = progressReplyStatus(initial, history);
        if (history.length === 0) {
          expect(result).toBe(initial);
        } else {
          const last = history[history.length - 1]!;
          expect(result).toBe(expectedStatusForReply(last));
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // (b) Empty sequence leaves the initial status untouched.
  it('returns the initial status unchanged when there are no replies', () => {
    fc.assert(
      fc.property(initialStatus, (initial) => {
        expect(progressReplyStatus(initial, [])).toBe(initial);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // (c) Override (18.7): a trailing >= 60 reply wins regardless of prior history.
  it('a later >= 60 reply overrides all prior classifications', () => {
    fc.assert(
      fc.property(
        initialStatus,
        replies,
        classificationWith(highConfidence),
        (initial, history, finalReply) => {
          const result = progressReplyStatus(initial, [...history, finalReply]);
          expect(result).toBe(EXPECTED_HIGH_CONFIDENCE_STATUS[finalReply.label]);
          // A >= 60 reply never yields needs_review.
          expect(result).not.toBe('needs_review');
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // (d) Low-confidence tail (18.6): a trailing < 60 reply yields needs_review.
  it('a trailing < 60 reply yields needs_review regardless of prior history', () => {
    fc.assert(
      fc.property(
        initialStatus,
        replies,
        classificationWith(lowConfidence),
        (initial, history, finalReply) => {
          const result = progressReplyStatus(initial, [...history, finalReply]);
          expect(result).toBe('needs_review');
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // (e) Boundary: confidence exactly 60 counts as high confidence (18.5).
  it('treats confidence of exactly 60 as high confidence (boundary)', () => {
    fc.assert(
      fc.property(
        initialStatus,
        replies,
        replyLabel,
        (initial, history, label) => {
          const boundaryReply: Classification = {
            label,
            confidence: CONFIDENCE_THRESHOLD,
          };
          const result = progressReplyStatus(initial, [
            ...history,
            boundaryReply,
          ]);
          expect(result).toBe(EXPECTED_HIGH_CONFIDENCE_STATUS[label]);
          expect(result).not.toBe('needs_review');
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // (f) Single-step mapping (18.5/18.6) is correct and consistent with the fold.
  it('statusForClassification and a single applyReplyClassification step match the oracle', () => {
    fc.assert(
      fc.property(initialStatus, classification, (initial, reply) => {
        const expected = expectedStatusForReply(reply);
        expect(statusForClassification(reply)).toBe(expected);
        // A single step overrides the current status (18.7) and matches the map.
        expect(applyReplyClassification(initial, reply)).toBe(expected);
        // Folding a one-element sequence equals the single-step result.
        expect(progressReplyStatus(initial, [reply])).toBe(expected);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
