/**
 * Application status enum + creation-path state machine (Application_Tracker /
 * Application_Sender).
 *
 * Pure, deterministic logic for the *initial* status assigned to an Application
 * record at creation time, plus the canonical set of valid statuses used for
 * validation everywhere downstream.
 *
 * Design reference: design.md — Application_Sender (Req 16.5/16.7/16.8) and
 * Application_Tracker (Req 17.3). The status type itself is owned by
 * `@worksignal/shared` (`ApplicationStatus`); this module is the single source
 * of truth for *which* status a freshly created application starts in based on
 * the path that created it.
 *
 * Requirements:
 *  - 16.5: a successfully sent email creates a record with status `sent`.
 *  - 16.7: a no-employer-email redirect creates a record with status
 *          `redirected_external`.
 *  - 16.8: an SES bounce sets the status to `delivery_failed`.
 *  - 17.3: the pipeline represents each Application status as exactly one valid
 *          enum value.
 *
 * Correctness property (Property 13): *for all* creation paths (and, with the
 * downstream update logic in task 7.3, all update sequences) the resulting
 * status is always exactly one valid `ApplicationStatus` enum value. This
 * module guarantees the creation-path half of that property: the input is an
 * exhaustive discriminated union, so `deriveInitialStatus` is a total function
 * that always returns a member of {@link VALID_APPLICATION_STATUSES}.
 */
import {
  APPLICATION_STATUSES,
  type ApplicationStatus,
} from '@worksignal/shared';

/**
 * The canonical set of valid application statuses.
 *
 * Backed by `@worksignal/shared`'s `APPLICATION_STATUSES`, exposed here as a
 * `ReadonlySet` for O(1) membership checks. Constraining every status to this
 * set is the basis of Requirement 17.3 / Property 13.
 */
export const VALID_APPLICATION_STATUSES: ReadonlySet<ApplicationStatus> =
  new Set(APPLICATION_STATUSES);

/**
 * Type guard: is the given value a valid {@link ApplicationStatus}?
 *
 * Accepts `unknown` so callers at trust boundaries (persisted records, external
 * input) can validate raw values safely (Req 17.3).
 *
 * @param value - The candidate status value.
 * @returns `true` iff `value` is exactly one of the valid enum members.
 */
export function isValidApplicationStatus(
  value: unknown,
): value is ApplicationStatus {
  return (
    typeof value === 'string' &&
    VALID_APPLICATION_STATUSES.has(value as ApplicationStatus)
  );
}

/**
 * The path by which an Application record is created.
 *
 * This is an exhaustive discriminated union so that {@link deriveInitialStatus}
 * is a total function — every creation path maps to exactly one status, which
 * is what makes the creation-path half of Property 13 hold by construction.
 *
 *  - `employer_email`: an employer contact email existed and the application
 *    email was sent successfully via SES → `sent` (Req 16.5).
 *  - `no_employer_email`: no employer contact email existed, so the user was
 *    redirected to the external listing → `redirected_external` (Req 16.7).
 *  - `bounce`: an application email was sent but SES reported a bounce →
 *    `delivery_failed` (Req 16.8).
 */
export type ApplicationCreationPath =
  | { kind: 'employer_email' }
  | { kind: 'no_employer_email' }
  | { kind: 'bounce' };

/** The discriminant values of {@link ApplicationCreationPath}. */
export type ApplicationCreationPathKind = ApplicationCreationPath['kind'];

/**
 * Map from each creation-path kind to the initial application status.
 *
 * Declared `satisfies` a total record over every path kind so the compiler
 * rejects any missing or stray path, keeping this mapping exhaustive.
 */
const INITIAL_STATUS_BY_PATH = {
  employer_email: 'sent',
  no_employer_email: 'redirected_external',
  bounce: 'delivery_failed',
} as const satisfies Record<ApplicationCreationPathKind, ApplicationStatus>;

/**
 * Derive the initial status for a newly created Application record from the
 * path that created it.
 *
 * Total and deterministic: every {@link ApplicationCreationPath} maps to
 * exactly one valid {@link ApplicationStatus} (Req 16.5/16.7/16.8, Property 13).
 *
 *  - employer email present + sent → `sent`
 *  - no employer email (redirect)  → `redirected_external`
 *  - bounce reported by SES        → `delivery_failed`
 *
 * @param path - The creation path for the application.
 * @returns The initial {@link ApplicationStatus} for that path.
 */
export function deriveInitialStatus(
  path: ApplicationCreationPath,
): ApplicationStatus {
  return INITIAL_STATUS_BY_PATH[path.kind];
}
