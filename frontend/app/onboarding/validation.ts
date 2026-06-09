/**
 * Client-side onboarding validation helpers.
 *
 * These mirror the Onboarding_Service validation rules (design.md →
 * Onboarding_Service) so the UI can surface the same messaging the backend
 * enforces, before a request is ever made:
 *
 * - Priority ranking must be an exact permutation of the six canonical
 *   factors `{salary, growth, balance, brand, purpose, stability}` (Req 4.2-4.4).
 * - Minimum monthly salary must be a positive number (Req 5.1, 5.3).
 * - When the career stage is `career_switcher`, both the source ("from") and
 *   target ("to") fields are required (Req 3.3).
 *
 * All functions here are pure (no I/O) so component tests (task 21.2) can
 * target the validation messaging directly.
 */
import {
  PRIORITY_FACTORS,
  type CareerStage,
  type PriorityFactor,
} from '@worksignal/shared';

/** A discriminated result returned by every validator in this module. */
export type ValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string };

const CANONICAL_FACTORS: ReadonlySet<string> = new Set<string>(PRIORITY_FACTORS);

/** Human-readable label for a priority factor (used in messaging). */
export function priorityFactorLabel(factor: PriorityFactor): string {
  switch (factor) {
    case 'salary':
      return 'Salary';
    case 'growth':
      return 'Growth';
    case 'balance':
      return 'Work-life balance';
    case 'brand':
      return 'Company brand';
    case 'purpose':
      return 'Purpose';
    case 'stability':
      return 'Stability';
    default:
      return factor;
  }
}

/**
 * Validate a submitted priority ranking. Accepts the list if and only if it is
 * a permutation containing each of the six canonical factors exactly once. On
 * rejection the message names the missing and/or duplicated factors (Req 4.4).
 */
export function validatePriorityRanking(
  submitted: readonly string[],
): ValidationResult {
  const seen = new Set<string>();
  const duplicated = new Set<string>();
  const unknown = new Set<string>();

  for (const entry of submitted) {
    if (!CANONICAL_FACTORS.has(entry)) {
      unknown.add(entry);
      continue;
    }
    if (seen.has(entry)) {
      duplicated.add(entry);
    } else {
      seen.add(entry);
    }
  }

  const missing = PRIORITY_FACTORS.filter((f) => !seen.has(f));

  if (missing.length === 0 && duplicated.size === 0 && unknown.size === 0) {
    return { ok: true };
  }

  const parts: string[] = [];
  if (missing.length > 0) {
    parts.push(
      `missing ${missing
        .map((f) => priorityFactorLabel(f))
        .join(', ')}`,
    );
  }
  if (duplicated.size > 0) {
    parts.push(
      `duplicated ${[...duplicated]
        .map((f) => priorityFactorLabel(f as PriorityFactor))
        .join(', ')}`,
    );
  }
  if (unknown.size > 0) {
    parts.push(`unrecognised ${[...unknown].join(', ')}`);
  }

  return {
    ok: false,
    message: `Rank all six factors exactly once — ${parts.join('; ')}.`,
  };
}

/**
 * Validate a minimum monthly salary. Accepts it if and only if it is a finite
 * positive number (Req 5.3). `raw` is the raw string from the input field.
 */
export function validateMinSalary(raw: string): ValidationResult {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return { ok: false, message: 'Enter a minimum monthly salary.' };
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0) {
    return {
      ok: false,
      message: 'Minimum monthly salary must be a positive number.',
    };
  }
  return { ok: true };
}

/**
 * Validate the career-switch context. When the career stage is
 * `career_switcher`, both `from` and `to` must be provided (Req 3.3). For any
 * other stage no switch context is required.
 */
export function validateCareerSwitch(
  stage: CareerStage,
  from: string,
  to: string,
): ValidationResult {
  if (stage !== 'career_switcher') {
    return { ok: true };
  }
  if (from.trim() === '' || to.trim() === '') {
    return {
      ok: false,
      message:
        'Tell us the field you are switching from and the field you are switching to.',
    };
  }
  return { ok: true };
}
