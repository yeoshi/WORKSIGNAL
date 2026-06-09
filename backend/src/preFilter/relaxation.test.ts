/**
 * Property-based and unit tests for Filter_Relaxation_Suggestion lifecycle
 * approval semantics.
 *
 * Feature: worksignal, Property 7: Non-negotiables change only on explicit
 * approval.
 *
 * Validates: Requirements 9.7, 9.8
 *
 * Property statement (design §Correctness Properties, Property 7):
 *   For any sequence of Filter_Relaxation_Suggestion lifecycle events applied to
 *   a pending suggestion, the user's non-negotiables remain equal to their
 *   pre-suggestion values unless and until the user explicitly approves a
 *   suggestion, after which exactly the approved adjustment is applied (at most
 *   once); suggestions in `pending`, `rejected`, or `expired` state never mutate
 *   non-negotiables.
 *
 * fast-check, minimum 100 iterations over arbitrary lifecycle event sequences.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type {
  EmploymentType,
  Filter_Relaxation_Suggestion,
  NonNegotiables,
  RelaxationTarget,
  WorkArrangement,
} from '@worksignal/shared';
import {
  applyApprovedAdjustment,
  applyLifecycleEvents,
  processLifecycleEvent,
  type LifecycleEvent,
} from './relaxation.js';

/** Minimum fast-check iterations required by the spec for property tests. */
const NUM_RUNS = 200;

const EMPLOYMENT_TYPES: readonly EmploymentType[] = [
  'full_time',
  'contract',
  'part_time',
];
const WORK_ARRANGEMENTS: readonly WorkArrangement[] = [
  'any',
  'hybrid_remote',
  'fully_remote',
];
const RELAXATION_TARGETS: readonly RelaxationTarget[] = [
  'min_salary',
  'employment_type',
  'work_arrangement',
  'custom',
  'ep_related',
];
const LIFECYCLE_EVENTS: readonly LifecycleEvent[] = [
  'approve',
  'reject',
  'expire',
];

// --- Generators --------------------------------------------------------------

/** Arbitrary set of non-negotiables (the user's pre-suggestion constraints). */
const nonNegotiablesArb: fc.Arbitrary<NonNegotiables> = fc.record({
  min_salary: fc.integer({ min: 1, max: 50_000 }),
  employment_type: fc
    .uniqueArray(fc.constantFrom(...EMPLOYMENT_TYPES), { minLength: 1 })
    .map((xs) => [...xs]),
  work_arrangement: fc.constantFrom(...WORK_ARRANGEMENTS),
  custom: fc.array(fc.string(), { maxLength: 4 }),
  ep_sponsorship_required: fc.boolean(),
});

/**
 * A type-valid `proposed_value` for the chosen relaxation target, so the
 * approved adjustment actually exercises the mutating branch of
 * {@link applyApprovedAdjustment}.
 */
function proposedValueArb(target: RelaxationTarget): fc.Arbitrary<unknown> {
  switch (target) {
    case 'min_salary':
      return fc.integer({ min: 1, max: 50_000 });
    case 'work_arrangement':
      return fc.constantFrom(...WORK_ARRANGEMENTS);
    case 'employment_type':
      return fc
        .uniqueArray(fc.constantFrom(...EMPLOYMENT_TYPES), { minLength: 1 })
        .map((xs) => [...xs]);
    case 'custom':
      return fc.array(fc.string(), { maxLength: 4 });
    case 'ep_related':
      // Legal guardrail — value is irrelevant (never applied).
      return fc.anything();
  }
}

/** Arbitrary pending suggestion paired with its (consistent) target. */
const pendingSuggestionArb: fc.Arbitrary<Filter_Relaxation_Suggestion> = fc
  .constantFrom(...RELAXATION_TARGETS)
  .chain((target) =>
    fc.record({
      suggestion_id: fc.uuid(),
      user_id: fc.uuid(),
      created_at: fc.constant('2025-01-01T00:00:00.000Z'),
      scan_run_id: fc.uuid(),
      target_non_negotiable: fc.constant(target),
      current_value: fc.anything(),
      proposed_value: proposedValueArb(target),
      rationale: fc.string(),
      evidence_job_ids: fc.array(fc.uuid(), { maxLength: 5 }),
      approval_state: fc.constant<'pending'>('pending'),
    }),
  );

/** Arbitrary sequence of lifecycle events (possibly empty). */
const eventsArb: fc.Arbitrary<LifecycleEvent[]> = fc.array(
  fc.constantFrom(...LIFECYCLE_EVENTS),
  { maxLength: 12 },
);

// --- Independent reference ---------------------------------------------------

/**
 * The adjustment that an explicit approval should make to the non-negotiables,
 * computed independently of the implementation so the property is a genuine
 * oracle. `ep_related` is a legal guardrail and is never applied.
 */
function expectedApprovedAdjustment(
  nn: NonNegotiables,
  suggestion: Filter_Relaxation_Suggestion,
): NonNegotiables {
  switch (suggestion.target_non_negotiable) {
    case 'min_salary':
      return { ...nn, min_salary: suggestion.proposed_value as number };
    case 'work_arrangement':
      return {
        ...nn,
        work_arrangement: suggestion.proposed_value as WorkArrangement,
      };
    case 'employment_type':
      return {
        ...nn,
        employment_type: suggestion.proposed_value as EmploymentType[],
      };
    case 'custom':
      return { ...nn, custom: suggestion.proposed_value as string[] };
    case 'ep_related':
      return nn;
  }
}

// --- Property 7 --------------------------------------------------------------

describe('Feature: worksignal, Property 7: Non-negotiables change only on explicit approval [Validates: Requirements 9.7, 9.8]', () => {
  it('applies exactly the approved adjustment iff the first event is an explicit approve, and never otherwise', () => {
    fc.assert(
      fc.property(
        nonNegotiablesArb,
        pendingSuggestionArb,
        eventsArb,
        (original, suggestion, events) => {
          // Snapshot the inputs to prove they are never mutated in place.
          const originalSnapshot = structuredClone(original);

          const outcome = applyLifecycleEvents(suggestion, original, events);

          // Only the FIRST event can act (it transitions pending -> terminal);
          // every later event hits a terminal state and is ignored.
          const firstEvent = events[0];
          const approvedFirst = firstEvent === 'approve';

          const expectedNN = approvedFirst
            ? expectedApprovedAdjustment(original, suggestion)
            : original;

          // (1) Non-negotiables equal pre-suggestion values unless an approval
          //     occurred first; if it did, exactly the approved adjustment.
          expect(outcome.non_negotiables).toEqual(expectedNN);

          // (2) The original inputs are never mutated in place.
          expect(original).toEqual(originalSnapshot);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('never mutates non-negotiables for any sequence that contains no approve (reject/expire/pending)', () => {
    const nonApproveEventsArb = fc.array(
      fc.constantFrom<LifecycleEvent>('reject', 'expire'),
      { maxLength: 12 },
    );
    fc.assert(
      fc.property(
        nonNegotiablesArb,
        pendingSuggestionArb,
        nonApproveEventsArb,
        (original, suggestion, events) => {
          const outcome = applyLifecycleEvents(suggestion, original, events);
          // Identical reference — no new object is ever produced without approval.
          expect(outcome.non_negotiables).toBe(original);
          expect(outcome.applied).toBe(false);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('applies the adjustment at most once: a leading approve followed by any events keeps the single approved result', () => {
    fc.assert(
      fc.property(
        nonNegotiablesArb,
        pendingSuggestionArb,
        eventsArb,
        (original, suggestion, trailingEvents) => {
          const events: LifecycleEvent[] = ['approve', ...trailingEvents];
          const outcome = applyLifecycleEvents(suggestion, original, events);

          const expectedNN = expectedApprovedAdjustment(original, suggestion);
          expect(outcome.non_negotiables).toEqual(expectedNN);
          expect(outcome.suggestion.approval_state).toBe('approved');

          // Re-applying the now-approved suggestion is idempotent on the
          // already-adjusted non-negotiables (no second application).
          const reapplied = applyApprovedAdjustment(
            outcome.non_negotiables,
            outcome.suggestion,
          );
          expect(reapplied).toEqual(expectedNN);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('keeps non-negotiables unchanged at every step up to (but not including) the first approval', () => {
    fc.assert(
      fc.property(
        nonNegotiablesArb,
        pendingSuggestionArb,
        eventsArb,
        (original, suggestion, events) => {
          let current = suggestion;
          let nn: NonNegotiables = original;
          let seenApproval = false;

          for (const event of events) {
            const step = processLifecycleEvent(current, nn, event);
            const wasPending = current.approval_state === 'pending';

            if (!seenApproval) {
              if (wasPending && event === 'approve') {
                // The single moment a change is permitted.
                seenApproval = true;
                expect(step.non_negotiables).toEqual(
                  expectedApprovedAdjustment(original, suggestion),
                );
              } else {
                // Before any approval, non-negotiables are untouched.
                expect(step.non_negotiables).toBe(original);
                expect(step.applied).toBe(false);
              }
            }

            current = step.suggestion;
            nn = step.non_negotiables;
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});

// --- Targeted unit examples --------------------------------------------------

describe('relaxation lifecycle — unit examples', () => {
  const baseNN: NonNegotiables = {
    min_salary: 6000,
    employment_type: ['full_time'],
    work_arrangement: 'hybrid_remote',
    custom: ['no night shifts'],
    ep_sponsorship_required: false,
  };

  const pendingMinSalary: Filter_Relaxation_Suggestion = {
    suggestion_id: 's1',
    user_id: 'u1',
    created_at: '2025-01-01T00:00:00.000Z',
    scan_run_id: 'r1',
    target_non_negotiable: 'min_salary',
    current_value: 6000,
    proposed_value: 5000,
    rationale: 'Lowering minimum salary from 6000 to 5000 would surface 3 of 5 scanned jobs.',
    evidence_job_ids: ['j1', 'j2', 'j3'],
    approval_state: 'pending',
  };

  it('approve applies exactly the proposed adjustment', () => {
    const outcome = processLifecycleEvent(pendingMinSalary, baseNN, 'approve');
    expect(outcome.suggestion.approval_state).toBe('approved');
    expect(outcome.non_negotiables.min_salary).toBe(5000);
    expect(outcome.applied).toBe(true);
  });

  it('reject leaves non-negotiables unchanged', () => {
    const outcome = processLifecycleEvent(pendingMinSalary, baseNN, 'reject');
    expect(outcome.suggestion.approval_state).toBe('rejected');
    expect(outcome.non_negotiables).toBe(baseNN);
    expect(outcome.applied).toBe(false);
  });

  it('expire leaves non-negotiables unchanged', () => {
    const outcome = processLifecycleEvent(pendingMinSalary, baseNN, 'expire');
    expect(outcome.suggestion.approval_state).toBe('expired');
    expect(outcome.non_negotiables).toBe(baseNN);
    expect(outcome.applied).toBe(false);
  });

  it('a reject followed by a late approve never applies the adjustment', () => {
    const outcome = applyLifecycleEvents(pendingMinSalary, baseNN, [
      'reject',
      'approve',
    ]);
    expect(outcome.suggestion.approval_state).toBe('rejected');
    expect(outcome.non_negotiables).toEqual(baseNN);
    expect(outcome.applied).toBe(false);
  });

  it('an empty event sequence (pending) never mutates non-negotiables', () => {
    const outcome = applyLifecycleEvents(pendingMinSalary, baseNN, []);
    expect(outcome.suggestion.approval_state).toBe('pending');
    expect(outcome.non_negotiables).toBe(baseNN);
    expect(outcome.applied).toBe(false);
  });

  it('approving an ep_related (legal guardrail) suggestion never mutates non-negotiables', () => {
    const epSuggestion: Filter_Relaxation_Suggestion = {
      ...pendingMinSalary,
      target_non_negotiable: 'ep_related',
      proposed_value: { anything: true },
    };
    const outcome = processLifecycleEvent(epSuggestion, baseNN, 'approve');
    expect(outcome.suggestion.approval_state).toBe('approved');
    expect(outcome.non_negotiables).toEqual(baseNN);
  });
});
