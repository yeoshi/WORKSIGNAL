/**
 * Emergency-recalibration detection (Requirement 21.6).
 *
 * Pure, deterministic logic — no I/O. The Recalibration_Engine runs weekly and
 * appends a {@link RecalibrationLogEntry} to the RecalibrationLog table. When a
 * user shows a sustained lack of callbacks WORKSIGNAL escalates to an
 * *emergency recalibration* and alerts the user; this module is the single
 * source of truth for *whether* that escalation should fire.
 *
 * Design reference: design.md — Recalibration_Engine: "If the user has **zero
 * callbacks across the three most recent recalibrations**, it performs an
 * emergency recalibration and alerts the user (21.6)."
 *
 * Requirement:
 *  - 21.6: IF a User has received zero callbacks across the three most recent
 *          weekly recalibrations, THEN THE Recalibration_Engine SHALL perform an
 *          emergency recalibration and alert the User.
 *
 * Correctness property (Property 20): for *all* recalibration histories, the
 * emergency flag fires iff the three most recent recalibration entries EACH
 * recorded zero callbacks. A history with fewer than three recalibrations can
 * never trigger an emergency (there is not yet a three-week window of evidence),
 * regardless of how many of those entries recorded zero callbacks. The
 * three-entry boundary and the zero-callback boundary are the edges exercised
 * most heavily by the property test (task 8.11).
 */

import type { RecalibrationLogEntry } from '@worksignal/shared';

/**
 * The number of most-recent recalibrations that must each record zero callbacks
 * for an emergency recalibration to be warranted (Req 21.6).
 */
export const EMERGENCY_RECALIBRATION_WINDOW = 3 as const;

/**
 * The minimal shape this module needs from a recalibration entry: the callback
 * count for that week. Tied to the shared {@link RecalibrationLogEntry} type so
 * callers can pass full log entries while property tests can pass minimal
 * objects.
 */
export type RecalibrationCallbackRef = {
  metrics: Pick<RecalibrationLogEntry['metrics'], 'callbacks'>;
};

/**
 * Whether a single recalibration entry recorded zero callbacks.
 *
 * A callback count is treated as "zero" only when it is exactly `0`. Any
 * positive count means the user received at least one callback that week.
 * (Counts are non-negative tallies by construction; this predicate does not
 * special-case negative or fractional values.)
 *
 * @param entry - The recalibration entry to inspect.
 * @returns `true` iff the entry recorded zero callbacks.
 */
function recordedZeroCallbacks(entry: RecalibrationCallbackRef): boolean {
  return entry.metrics.callbacks === 0;
}

/**
 * Decide whether an emergency recalibration should be triggered given the
 * user's recalibration history (Req 21.6, Property 20).
 *
 * The history is ordered oldest → newest (newest last), matching how weekly
 * entries are appended to the RecalibrationLog over time. The emergency flag
 * fires iff:
 *
 *  1. there are at least {@link EMERGENCY_RECALIBRATION_WINDOW} (3)
 *     recalibrations in the history, AND
 *  2. each of the three most recent entries recorded zero callbacks.
 *
 * A history with fewer than three entries never triggers an emergency, even if
 * every entry present recorded zero callbacks — the three-week window of
 * evidence does not yet exist. Pure and total over any history (an empty
 * history yields `false`).
 *
 * @param history - The user's weekly recalibrations, ordered oldest → newest.
 * @returns `true` iff an emergency recalibration is warranted.
 */
export function shouldTriggerEmergencyRecalibration(
  history: readonly RecalibrationCallbackRef[],
): boolean {
  if (history.length < EMERGENCY_RECALIBRATION_WINDOW) {
    return false;
  }

  const mostRecent = history.slice(-EMERGENCY_RECALIBRATION_WINDOW);
  return mostRecent.every(recordedZeroCallbacks);
}
