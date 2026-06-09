/**
 * Property-based and unit tests for emergency-recalibration detection.
 *
 * Feature: worksignal, Property 20: Emergency recalibration on three zero-callback weeks
 * Validates: Requirements 21.6
 *
 * Property 20 states that `shouldTriggerEmergencyRecalibration` fires the
 * emergency flag if and only if there are at least three recalibrations in the
 * history AND each of the three most recent entries (the history is ordered
 * oldest → newest) recorded zero callbacks. A history with fewer than three
 * entries can never trigger an emergency, regardless of how many of those
 * entries recorded zero callbacks. The function is pure and total over any
 * history.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { RecalibrationLogEntry } from '@worksignal/shared';
import {
  EMERGENCY_RECALIBRATION_WINDOW,
  shouldTriggerEmergencyRecalibration,
  type RecalibrationCallbackRef,
} from './emergency.js';

/** Minimum fast-check iterations required by the spec for property tests. */
const NUM_RUNS = 200;

/** Build a minimal recalibration entry recording the given callback count. */
function entry(callbacks: number): RecalibrationCallbackRef {
  return { metrics: { callbacks } };
}

/**
 * Reference oracle: independently decide whether the history warrants an
 * emergency recalibration. Kept deliberately simple and separate from the
 * implementation so it can serve as a trusted check.
 */
function oracle(history: readonly RecalibrationCallbackRef[]): boolean {
  if (history.length < EMERGENCY_RECALIBRATION_WINDOW) return false;
  const lastThree = history.slice(history.length - EMERGENCY_RECALIBRATION_WINDOW);
  return lastThree.every((e) => e.metrics.callbacks === 0);
}

/**
 * A callback count weighted toward zero so the input space is heavily skewed
 * toward the interesting boundary (zero-callback weeks) while still producing
 * plenty of positive counts.
 */
const callbackCountArb = fc.oneof(
  { weight: 5, arbitrary: fc.constant(0) },
  { weight: 5, arbitrary: fc.integer({ min: 1, max: 25 }) },
);

/**
 * Histories of varied lengths (including 0, 1, 2 — below the window — and well
 * above it) with varied callback counts including zeros and positives.
 */
const historyArb: fc.Arbitrary<RecalibrationCallbackRef[]> = fc
  .array(callbackCountArb, { minLength: 0, maxLength: 12 })
  .map((counts) => counts.map(entry));

describe('shouldTriggerEmergencyRecalibration', () => {
  it('Feature: worksignal, Property 20: Emergency recalibration on three zero-callback weeks [Validates: Requirements 21.6]', () => {
    fc.assert(
      fc.property(historyArb, (history) => {
        expect(shouldTriggerEmergencyRecalibration(history)).toBe(oracle(history));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('Feature: worksignal, Property 20: never fires with fewer than three entries', () => {
    const shortHistoryArb = fc
      .array(callbackCountArb, { minLength: 0, maxLength: EMERGENCY_RECALIBRATION_WINDOW - 1 })
      .map((counts) => counts.map(entry));
    fc.assert(
      fc.property(shortHistoryArb, (history) => {
        expect(shouldTriggerEmergencyRecalibration(history)).toBe(false);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('Feature: worksignal, Property 20: any positive callback in the most recent window prevents the emergency', () => {
    // Build a history whose last three entries contain at least one positive
    // callback count; the flag must never fire.
    const arb = fc
      .record({
        prefix: fc.array(callbackCountArb, { minLength: 0, maxLength: 6 }),
        lastThree: fc
          .tuple(
            fc.integer({ min: 0, max: 25 }),
            fc.integer({ min: 0, max: 25 }),
            fc.integer({ min: 0, max: 25 }),
          )
          .filter(([a, b, c]) => a > 0 || b > 0 || c > 0),
      })
      .map(({ prefix, lastThree }) => [...prefix, ...lastThree].map(entry));
    fc.assert(
      fc.property(arb, (history) => {
        expect(shouldTriggerEmergencyRecalibration(history)).toBe(false);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('Feature: worksignal, Property 20: fires whenever the three most recent entries are all zero', () => {
    // A history of length >= 3 whose final three entries are all zero callbacks
    // (older entries arbitrary) must always trigger the emergency.
    const arb = fc
      .array(callbackCountArb, { minLength: 0, maxLength: 6 })
      .map((prefix) => [...prefix, 0, 0, 0].map(entry));
    fc.assert(
      fc.property(arb, (history) => {
        expect(shouldTriggerEmergencyRecalibration(history)).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // --- Unit tests: concrete examples and boundaries ---

  it('exposes the three-week window constant', () => {
    expect(EMERGENCY_RECALIBRATION_WINDOW).toBe(3);
  });

  it('returns false for an empty history', () => {
    expect(shouldTriggerEmergencyRecalibration([])).toBe(false);
  });

  it('returns false when only two zero-callback entries exist', () => {
    expect(shouldTriggerEmergencyRecalibration([entry(0), entry(0)])).toBe(false);
  });

  it('fires for exactly three zero-callback entries', () => {
    expect(shouldTriggerEmergencyRecalibration([entry(0), entry(0), entry(0)])).toBe(true);
  });

  it('ignores older non-zero weeks when the most recent three are all zero', () => {
    expect(
      shouldTriggerEmergencyRecalibration([entry(4), entry(2), entry(0), entry(0), entry(0)]),
    ).toBe(true);
  });

  it('does not fire when the most recent week recorded a callback', () => {
    expect(
      shouldTriggerEmergencyRecalibration([entry(0), entry(0), entry(0), entry(1)]),
    ).toBe(false);
  });

  it('accepts full RecalibrationLogEntry values', () => {
    const full = (callbacks: number): RecalibrationLogEntry => ({
      recalibration_id: 'r',
      user_id: 'u',
      week_of: '2025-01-01',
      metrics: {
        applications_sent: 10,
        callbacks,
        rejections: 0,
        ghosted: 0,
        callback_rate: callbacks / 10,
      },
      agent_performance: {
        ambition: { correct: 0, incorrect: 0 },
        realism: { correct: 0, incorrect: 0 },
        risk: { correct: 0, incorrect: 0 },
        opportunity: { correct: 0, incorrect: 0 },
      },
      adjustments_made: [],
      emergency: false,
      brief_text: '',
      created_at: '2025-01-01T00:00:00Z',
    });
    expect(
      shouldTriggerEmergencyRecalibration([full(0), full(0), full(0)]),
    ).toBe(true);
    expect(
      shouldTriggerEmergencyRecalibration([full(0), full(1), full(0)]),
    ).toBe(false);
  });
});
