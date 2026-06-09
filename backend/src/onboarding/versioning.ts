/**
 * Onboarding versioning and source-of-truth selection (Task 2.7).
 *
 * Implements the source-of-truth semantics from the design document
 * (Requirements 5.4, 5.5):
 *
 *   "On save, the Onboarding_Service writes the new values and stamps
 *    `onboarding_version`/`updated_at`; the Pre_Filter and all agents always
 *    read the latest persisted values, so every subsequent scan/debate uses
 *    the most recent configuration."
 *
 * This module is intentionally **pure** and free of any DynamoDB / I/O wiring
 * (that is layered on in later tasks). It provides:
 *
 *   (a) {@link stampOnSave} — stamp an incremented `onboarding_version` and a
 *       fresh `updated_at` onto the values being saved.
 *   (b) {@link selectSourceOfTruth} — given a set of saved versions, always
 *       return the most recently saved one (highest `onboarding_version`,
 *       tie-broken by latest `updated_at`).
 *
 * Because the functions are pure and deterministic they are directly
 * property-testable (see Property 4, task 2.8).
 */

import type { OnboardingState } from '@worksignal/shared';

/**
 * The editable onboarding content a user submits on save, *before* the
 * service stamps version-tracking metadata onto it. {@link stampOnSave}
 * turns this into a fully-stamped {@link OnboardingState}.
 */
export type OnboardingContent = Omit<
  OnboardingState,
  'onboarding_version' | 'updated_at'
>;

/** The smallest version number assigned to a user's first saved onboarding. */
export const INITIAL_ONBOARDING_VERSION = 1;

/**
 * Options for {@link stampOnSave}, primarily to make the timestamp injectable
 * so the function stays pure and deterministic under test.
 */
export interface StampOptions {
  /**
   * The clock used for `updated_at`. Defaults to the current time. Accepts a
   * `Date` or an ISO-8601 string. Injecting this keeps the function pure.
   */
  now?: Date | string;
}

/** Normalise a `Date | string` clock value into an ISO-8601 string. */
function toIso(now: Date | string | undefined): string {
  if (now === undefined) {
    return new Date().toISOString();
  }
  return typeof now === 'string' ? now : now.toISOString();
}

/**
 * Stamp version-tracking metadata onto the onboarding values being saved.
 *
 * The new `onboarding_version` is one greater than `previousVersion` (or
 * {@link INITIAL_ONBOARDING_VERSION} for a user's first save), guaranteeing a
 * strictly monotonically increasing sequence per user. `updated_at` is set to
 * the provided (or current) time in ISO-8601 form.
 *
 * @param content          The onboarding values being saved (without stamps).
 * @param previousVersion  The version of the most recently saved state, or
 *                         `undefined` for the very first save.
 * @param options          Optional injectable clock for `updated_at`.
 * @returns                A fully-stamped {@link OnboardingState}.
 */
export function stampOnSave(
  content: OnboardingContent,
  previousVersion?: number,
  options: StampOptions = {},
): OnboardingState {
  const nextVersion =
    previousVersion === undefined
      ? INITIAL_ONBOARDING_VERSION
      : previousVersion + 1;

  return {
    ...content,
    onboarding_version: nextVersion,
    updated_at: toIso(options.now),
  };
}

/**
 * Order two saved onboarding versions by recency.
 *
 * Returns a positive number when `a` is more recent than `b`, negative when
 * `b` is more recent, and `0` when they are indistinguishable. Recency is
 * primarily determined by `onboarding_version` (the monotonic stamp set on
 * save); ties on version fall back to the later `updated_at` (ISO-8601 strings
 * compare chronologically under lexicographic ordering).
 */
export function compareByRecency(
  a: Pick<OnboardingState, 'onboarding_version' | 'updated_at'>,
  b: Pick<OnboardingState, 'onboarding_version' | 'updated_at'>,
): number {
  if (a.onboarding_version !== b.onboarding_version) {
    return a.onboarding_version - b.onboarding_version;
  }
  if (a.updated_at < b.updated_at) {
    return -1;
  }
  if (a.updated_at > b.updated_at) {
    return 1;
  }
  return 0;
}

/**
 * Select the source-of-truth onboarding state from a set of saved versions.
 *
 * This is the read function consumed by the Pre_Filter and all debate agents:
 * for any set of saved versions it returns the **most recently saved** one
 * (highest `onboarding_version`, tie-broken by latest `updated_at`) and never
 * an earlier one (Requirements 5.4, 5.5 / Property 4).
 *
 * @param versions  Saved onboarding versions for a single user, in any order.
 * @returns         The most recently saved version, or `undefined` when the
 *                  set is empty.
 */
export function selectSourceOfTruth(
  versions: readonly OnboardingState[],
): OnboardingState | undefined {
  let latest: OnboardingState | undefined;
  for (const version of versions) {
    if (latest === undefined || compareByRecency(version, latest) > 0) {
      latest = version;
    }
  }
  return latest;
}
