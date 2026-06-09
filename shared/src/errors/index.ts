/**
 * Canonical typed error classes for WORKSIGNAL.
 *
 * These are the single source of truth for the error types referenced
 * throughout the design (Onboarding_Service, Resume_Parser, Debate_Engine,
 * Master_Orchestrator, etc.). Other modules import these by name rather than
 * redefining them.
 *
 * Each error carries a stable machine-readable `code` so callers can branch
 * on error kind without relying on `instanceof` across module boundaries, and
 * an optional `details` payload for structured context (e.g. the offending
 * factors of a rejected priority ranking).
 */

/** Stable, machine-readable identifiers for each WorkSignal error kind. */
export type WorkSignalErrorCode =
  | 'REJECT'
  | 'RANKING'
  | 'VALIDATION'
  | 'PARSE_FAILURE'
  | 'INVALID_VERDICT';

/**
 * Base class for all WORKSIGNAL domain errors.
 *
 * Extends the native `Error` while restoring the prototype chain (required for
 * reliable `instanceof` checks when targeting ES5-class semantics) and capturing
 * a clean stack trace.
 */
export abstract class WorkSignalError extends Error {
  /** Machine-readable error kind. */
  public abstract readonly code: WorkSignalErrorCode;

  /** Optional structured context describing the failure. */
  public readonly details?: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    // Set the prototype explicitly so `instanceof` works when compiled down.
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = new.target.name;
    this.details = details;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, new.target);
    }
  }
}

/**
 * A user-supplied input was rejected by a hard rule before any processing.
 *
 * Used e.g. when a non-PDF resume upload is rejected (Requirement 2.3).
 */
export class RejectError extends WorkSignalError {
  public readonly code = 'REJECT' as const;
}

/**
 * A submitted priority ranking was not an exact permutation of the six
 * priority factors (Requirements 4.3, 4.4). `details` may carry the offending
 * (missing or duplicated) factors.
 */
export class RankingError extends WorkSignalError {
  public readonly code = 'RANKING' as const;
}

/**
 * A value failed validation (e.g. a non-positive minimum salary, Requirement
 * 5.3, or malformed non-negotiables).
 */
export class ValidationError extends WorkSignalError {
  public readonly code = 'VALIDATION' as const;
}

/**
 * The Resume_Parser could not extract a structured profile from a resume
 * (Requirement 2.4), so the user must be offered manual entry.
 */
export class ParseFailure extends WorkSignalError {
  public readonly code = 'PARSE_FAILURE' as const;
}

/**
 * A debate agent produced output that does not conform to its schema or has a
 * score outside 0–100 (Requirements 11.1–11.4). `details` may carry the raw,
 * non-conforming output for logging.
 */
export class InvalidVerdict extends WorkSignalError {
  public readonly code = 'INVALID_VERDICT' as const;
}

/** Type guard: is the given value a WorkSignal domain error? */
export function isWorkSignalError(value: unknown): value is WorkSignalError {
  return value instanceof WorkSignalError;
}
