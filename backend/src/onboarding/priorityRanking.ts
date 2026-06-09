/**
 * Priority-ranking validator (Onboarding_Service, Requirements 4.2-4.4).
 *
 * Pure validation logic with NO I/O and NO persistence. A submitted priority
 * ranking is accepted ONLY when it is a permutation of exactly the six
 * canonical priority factors `{salary, growth, balance, brand, purpose,
 * stability}` — each present exactly once, with no omissions, duplicates, or
 * unrecognised entries.
 *
 * On rejection a {@link RankingError} is thrown whose `details` name the
 * offending factors (missing / duplicated / unknown). Because this is a pure
 * validator, nothing is persisted on rejection; persistence is the caller's
 * responsibility and only happens after a successful validation.
 *
 * Design reference: design.md → Onboarding_Service → "Priority ranking
 * validation (4.3/4.4)".
 */
import {
  PRIORITY_FACTORS,
  RankingError,
  type PriorityFactor,
} from '@worksignal/shared';

/**
 * Structured context attached to a {@link RankingError} describing precisely
 * why a submitted ranking was rejected.
 */
export interface RankingRejectionDetails {
  /** Canonical factors that were omitted from the submission. */
  readonly missing: PriorityFactor[];
  /** Canonical factors that appeared more than once. */
  readonly duplicated: PriorityFactor[];
  /** Submitted entries that are not one of the six canonical factors. */
  readonly unknown: string[];
}

/** Membership set of the canonical priority factors for O(1) lookups. */
const CANONICAL_FACTORS: ReadonlySet<string> = new Set<string>(PRIORITY_FACTORS);

/** Type guard: is the given value one of the six canonical priority factors? */
function isPriorityFactor(value: unknown): value is PriorityFactor {
  return typeof value === 'string' && CANONICAL_FACTORS.has(value);
}

/** Render an offending-factors message fragment, or empty string if none. */
function describe(label: string, items: readonly string[]): string {
  return items.length > 0 ? `${label}: ${items.join(', ')}` : '';
}

/**
 * Validate a submitted priority ranking.
 *
 * @param submitted - The user-submitted list of priority factors. Accepts
 *   `readonly unknown[]` so that malformed input (wrong values, wrong types)
 *   is handled defensively rather than trusted.
 * @returns The validated ranking, narrowed to `PriorityFactor[]`, when the
 *   submission is an exact permutation of the six canonical factors.
 * @throws {RankingError} when the submission omits, duplicates, or contains
 *   unrecognised factors. The thrown error's `details` is a
 *   {@link RankingRejectionDetails} naming the offending factors. Nothing is
 *   persisted on rejection (this function performs no I/O).
 */
export function validatePriorityRanking(
  submitted: readonly unknown[],
): PriorityFactor[] {
  // Tally how many times each recognised factor appears, and collect any
  // entries that are not recognised factors at all.
  const counts = new Map<PriorityFactor, number>();
  const unknown: string[] = [];

  for (const entry of submitted) {
    if (isPriorityFactor(entry)) {
      counts.set(entry, (counts.get(entry) ?? 0) + 1);
    } else {
      // Represent non-factor entries readably for the rejection message.
      unknown.push(typeof entry === 'string' ? entry : JSON.stringify(entry));
    }
  }

  // Missing and duplicated are evaluated against the canonical set in its
  // canonical order so messages are deterministic.
  const missing: PriorityFactor[] = [];
  const duplicated: PriorityFactor[] = [];
  for (const factor of PRIORITY_FACTORS) {
    const count = counts.get(factor) ?? 0;
    if (count === 0) {
      missing.push(factor);
    } else if (count > 1) {
      duplicated.push(factor);
    }
  }

  const isExactPermutation =
    missing.length === 0 && duplicated.length === 0 && unknown.length === 0;

  if (!isExactPermutation) {
    const details: RankingRejectionDetails = { missing, duplicated, unknown };
    const message = [
      'Invalid priority ranking: expected a permutation of exactly the six factors ' +
        `(${PRIORITY_FACTORS.join(', ')}).`,
      describe('missing', missing),
      describe('duplicated', duplicated),
      describe('unrecognised', unknown),
    ]
      .filter((part) => part.length > 0)
      .join(' ');

    throw new RankingError(message, details);
  }

  // Safe: every canonical factor appeared exactly once and nothing else did,
  // so the input is a permutation of the six factors.
  return submitted as PriorityFactor[];
}
