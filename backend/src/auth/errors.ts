/**
 * Typed error for the Auth_Service (Requirement 1.6).
 *
 * When Google OAuth authentication fails, the Auth_Service must return an
 * authentication-error message and must NOT create a Users record. This error
 * is thrown on any failed/invalid callback so the caller can surface a sign-in
 * failure to the user; crucially it is raised *before* any persistence occurs.
 */

/** Stable, machine-readable reasons an authentication attempt can fail. */
export type AuthErrorReason =
  /** The OAuth provider reported an error (user denied, invalid grant, etc.). */
  | 'oauth_failed'
  /** The callback profile was missing a Google subject identifier. */
  | 'missing_subject'
  /** The callback profile was missing the user's email address. */
  | 'missing_email';

/**
 * An authentication failure. Carries a machine-readable {@link AuthErrorReason}
 * so callers can branch without string-matching the message.
 */
export class AuthError extends Error {
  /** Machine-readable error kind for the auth domain. */
  public readonly code = 'AUTH' as const;

  /** The specific reason authentication failed. */
  public readonly reason: AuthErrorReason;

  /** Optional structured context describing the failure. */
  public readonly details?: unknown;

  constructor(reason: AuthErrorReason, message: string, details?: unknown) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = new.target.name;
    this.reason = reason;
    this.details = details;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, new.target);
    }
  }
}

/** Type guard: is the given value an {@link AuthError}? */
export function isAuthError(value: unknown): value is AuthError {
  return value instanceof AuthError;
}
