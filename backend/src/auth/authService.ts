/**
 * Auth_Service — NextAuth.js Google OAuth sign-in (Task 11.1, Requirement 1).
 *
 * Implements the {@link AuthService} contract from `@worksignal/shared`:
 *
 *   - `beginSignIn()` builds the Google OAuth redirect requesting the scopes
 *     `openid email profile gmail.readonly` (Req 1.1).
 *   - `onCallback()` handles a successful OAuth callback: it creates or
 *     retrieves the Users record keyed by the Google subject identifier
 *     (Req 1.2), stores the user's email + display name (Req 1.3), encrypts and
 *     stores the Gmail OAuth token when the gmail.readonly scope was granted
 *     (Req 1.4), and records `inbox_monitoring_available = false` when the user
 *     declined that scope (Req 1.5).
 *   - On OAuth failure, {@link AuthService.onCallback} (or the explicit
 *     {@link AuthServiceImpl.onOAuthFailure}) raises an {@link AuthError} and
 *     creates **no** Users record (Req 1.6).
 *
 * External dependencies (the DynamoDB wrapper, the encryption secret, the
 * clock, and OAuth client configuration) are injected through the constructor
 * so the service is unit-testable without real AWS or network access.
 */

import {
  DynamoDBWrapper,
  encrypt,
  Logger,
  type AuthService,
  type GoogleProfile,
  type OAuthRedirect,
  type OAuthTokens,
  type SessionUser,
} from '@worksignal/shared';
import { AuthError } from './errors.js';

/** The Users table name (design.md → Data Models → Users). */
export const USERS_TABLE = 'Users';

/** Fully-qualified Gmail read-only scope requested at sign-in (Req 1.1, 1.4). */
export const GMAIL_READONLY_SCOPE =
  'https://www.googleapis.com/auth/gmail.readonly';

/**
 * The OAuth scopes WORKSIGNAL requests, in the order named by the design:
 * `openid email profile gmail.readonly` (Req 1.1).
 */
export const OAUTH_SCOPES: readonly string[] = [
  'openid',
  'email',
  'profile',
  GMAIL_READONLY_SCOPE,
];

/** Google's OAuth 2.0 authorization endpoint. */
const DEFAULT_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

/**
 * The subset of the Users record the Auth_Service owns and writes during
 * sign-in. Onboarding later populates the remaining profile/calibration
 * fields; this shape is intentionally a superset-free, write-time projection
 * so auth never clobbers data it does not own.
 */
export interface AuthUserRecord {
  /** Google OAuth `sub` — the Users table partition key (Req 1.2). */
  user_id: string;
  /** The user's email address (Req 1.3). */
  email: string;
  /** The user's display name (Req 1.3). */
  name: string;
  /** Encrypted Gmail OAuth token; present only when the scope was granted (Req 1.4). */
  gmail_oauth_token?: string;
  /** False when the user declined the Gmail scope (Req 1.5). */
  inbox_monitoring_available: boolean;
  /** ISO-8601 creation timestamp, set once on first sign-in. */
  created_at: string;
  /** ISO-8601 timestamp of the most recent sign-in/update. */
  updated_at: string;
  /**
   * Index signature so the record satisfies the DynamoDB wrapper's
   * `DynamoItem` (`Record<string, unknown>`) shape. Onboarding-owned fields
   * preserved across sign-ins also live under this signature.
   */
  [key: string]: unknown;
}

/** Injectable dependencies for {@link AuthServiceImpl}. */
export interface AuthServiceDeps {
  /** DynamoDB wrapper used to read/write the Users record. */
  db: DynamoDBWrapper;
  /** Secret used to encrypt the Gmail OAuth token at rest (Req 1.4). */
  encryptionSecret: string | Buffer;
  /** OAuth client id used to build the sign-in redirect (Req 1.1). */
  clientId?: string;
  /** OAuth redirect URI registered with Google. */
  redirectUri?: string;
  /** Override the Google authorization endpoint (useful in tests). */
  authorizeUrl?: string;
  /** Injectable clock for deterministic timestamps. Defaults to `Date`. */
  now?: () => Date;
  /** Optional structured logger. */
  logger?: Logger;
}

/**
 * Concrete {@link AuthService} implementation.
 *
 * All side-effecting collaborators are injected, so tests can supply a fake
 * DynamoDB wrapper, a fixed clock, and a known encryption secret.
 */
export class AuthServiceImpl implements AuthService {
  private readonly db: DynamoDBWrapper;
  private readonly encryptionSecret: string | Buffer;
  private readonly clientId?: string;
  private readonly redirectUri?: string;
  private readonly authorizeUrl: string;
  private readonly now: () => Date;
  private readonly logger?: Logger;

  constructor(deps: AuthServiceDeps) {
    this.db = deps.db;
    this.encryptionSecret = deps.encryptionSecret;
    this.clientId = deps.clientId;
    this.redirectUri = deps.redirectUri;
    this.authorizeUrl = deps.authorizeUrl ?? DEFAULT_AUTHORIZE_URL;
    this.now = deps.now ?? (() => new Date());
    this.logger = deps.logger;
  }

  /**
   * Begin sign-in: build the Google OAuth redirect requesting
   * `openid email profile gmail.readonly` (Req 1.1).
   *
   * `access_type=offline` + `prompt=consent` request a refresh token so the
   * Gmail_Monitor can poll the inbox over time; `include_granted_scopes`
   * lets Google return only the scopes the user actually granted, which is how
   * a declined Gmail scope surfaces (Req 1.5).
   */
  beginSignIn(): OAuthRedirect {
    const params = new URLSearchParams({
      response_type: 'code',
      scope: OAUTH_SCOPES.join(' '),
      access_type: 'offline',
      include_granted_scopes: 'true',
      prompt: 'consent',
    });
    if (this.clientId !== undefined) {
      params.set('client_id', this.clientId);
    }
    if (this.redirectUri !== undefined) {
      params.set('redirect_uri', this.redirectUri);
    }
    return {
      url: `${this.authorizeUrl}?${params.toString()}`,
      scopes: [...OAUTH_SCOPES],
    };
  }

  /**
   * Handle a successful Google OAuth callback (Req 1.2–1.5).
   *
   * Steps:
   *   1. Validate the profile carries a subject identifier and email; a
   *      missing field is treated as a failed authentication and raises an
   *      {@link AuthError} *before* any write (Req 1.6).
   *   2. Retrieve any existing Users record by `sub` so first-sign-in metadata
   *      (`created_at`) and onboarding-owned fields are preserved (Req 1.2).
   *   3. Store email + display name (Req 1.3).
   *   4. When the Gmail scope was granted, encrypt the refresh (or access)
   *      token and store it; mark inbox monitoring available (Req 1.4).
   *   5. When the Gmail scope was declined, mark inbox monitoring unavailable
   *      and leave any previously stored token untouched (Req 1.5).
   */
  async onCallback(
    profile: GoogleProfile,
    tokens: OAuthTokens,
  ): Promise<SessionUser> {
    const sub = profile?.sub?.trim();
    if (!sub) {
      throw new AuthError(
        'missing_subject',
        'Authentication failed: OAuth profile is missing a subject identifier.',
      );
    }
    const email = profile.email?.trim();
    if (!email) {
      throw new AuthError(
        'missing_email',
        'Authentication failed: OAuth profile is missing an email address.',
      );
    }

    const nowIso = this.now().toISOString();
    const existing = await this.db.get<AuthUserRecord>(USERS_TABLE, {
      user_id: sub,
    });

    const inboxMonitoringAvailable = tokens.gmailScopeGranted === true;

    // Start from any existing record so onboarding-owned fields survive.
    const record: AuthUserRecord = {
      ...(existing ?? {}),
      user_id: sub,
      email,
      name: profile.name ?? existing?.name ?? '',
      inbox_monitoring_available: inboxMonitoringAvailable,
      created_at: existing?.created_at ?? nowIso,
      updated_at: nowIso,
    };

    if (inboxMonitoringAvailable) {
      // Prefer the long-lived refresh token; fall back to the access token.
      const tokenToStore = tokens.refreshToken ?? tokens.accessToken;
      if (tokenToStore) {
        record.gmail_oauth_token = encrypt(tokenToStore, this.encryptionSecret);
      }
    }
    // When declined (Req 1.5) we keep any previously stored token but report
    // monitoring as unavailable; no new token is written.

    await this.db.put(USERS_TABLE, record);

    this.logger?.info('OAuth sign-in completed', {
      userId: sub,
      isNewUser: existing === undefined,
      inboxMonitoringAvailable,
    });

    return {
      userId: sub,
      email,
      name: record.name,
      inboxMonitoringAvailable,
    };
  }

  /**
   * Explicit OAuth-failure entry point (Req 1.6).
   *
   * NextAuth routes a provider error (user denied access, invalid grant, etc.)
   * here. It logs the failure and raises an {@link AuthError}; no Users record
   * is created or modified.
   */
  onOAuthFailure(reason: string): never {
    this.logger?.warn('OAuth authentication failed', { reason });
    throw new AuthError(
      'oauth_failed',
      `Authentication failed: ${reason}`,
      { reason },
    );
  }
}

/** Convenience factory mirroring the {@link AuthServiceImpl} constructor. */
export function createAuthService(deps: AuthServiceDeps): AuthServiceImpl {
  return new AuthServiceImpl(deps);
}
