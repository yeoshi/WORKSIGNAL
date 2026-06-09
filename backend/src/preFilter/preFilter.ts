/**
 * Pre_Filter — non-negotiable hard filter (Requirements 8 and 9).
 *
 * A **pure, deterministic** function that runs inside the debate Map state
 * *before* any agent debate. It evaluates a discovered job against a user's
 * non-negotiables and returns whether the job survives. A job passes **only**
 * when it violates none of the user's non-negotiables; otherwise it is
 * discarded with no user-visible record (Req 9.2) — an internal analytics log
 * entry may be emitted via an optional, injected logger.
 *
 * Deterministic checks (design §Pre_Filter); a job passes iff it violates none:
 *  1. Minimum salary — `salary_max >= non_negotiables.min_salary` (Req 9.1).
 *  2. Employment type — job type ∈ user's selected types (Req 9.1).
 *  3. Work arrangement — job arrangement compatible with the preference (Req 9.1).
 *  4. Location — Singapore, with the fully-remote SG-employer / SG-timezone
 *     exception (Req 8.1, 8.2).
 *  5. Custom dealbreakers — no configured dealbreaker matches the job (Req 9.1).
 *  6. EP salary floor — for `need_sponsorship`, `salary_max >= EP floor`
 *     (5600 general / 6200 financial services) (Req 9.3).
 *  7. EP sponsorship — for `need_sponsorship`, the listing must indicate EP
 *     sponsorship is available (Req 9.4).
 *
 * Safety-critical (Property 5): the function MUST NEVER return `pass: true`
 * for a job that violates any non-negotiable, including a salary exactly at the
 * EP floor boundary (equal-to-floor passes; strictly below fails).
 *
 * The function is pure and deterministic given its inputs; the optional logger
 * performs internal analytics logging only (a side effect that never affects
 * the returned result), satisfying "internal logging permitted" while keeping
 * "no user-visible record" (Req 9.2).
 */

import type {
  DiscoveredJob,
  FilterResult,
  Logger,
  NonNegotiableKey,
  UserConfig,
} from '@worksignal/shared';
import { deriveEpSalaryFloor } from '../onboarding/calibration.js';

/**
 * Normalise a free-text value for tolerant comparison: lower-cased with all
 * non-alphanumeric characters stripped. Example: `"Full Time"` → `"fulltime"`,
 * `"financial-services"` → `"financialservices"`.
 */
function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** A coarse classification of a job's work-arrangement free-text value. */
type WorkArrangementCategory = 'onsite' | 'hybrid' | 'fully_remote' | 'unknown';

/**
 * Classify a job's free-text `work_arrangement` into a coarse category. The job
 * field originates from external sources (MCF / Exa) and is therefore treated
 * as untrusted free text.
 */
function classifyJobArrangement(raw: string): WorkArrangementCategory {
  const n = normalise(raw);
  // Check fully-remote signals before "hybrid"/"office" so e.g. "fully remote"
  // is not mis-read; a bare "remote" is treated as fully remote.
  if (n.includes('fullyremote') || n === 'remote' || n.includes('workfromhome')) {
    return 'fully_remote';
  }
  if (n.includes('hybrid')) {
    return 'hybrid';
  }
  if (n.includes('onsite') || n.includes('inoffice') || n.includes('office')) {
    return 'onsite';
  }
  // A non-fully "remote" mention alongside other words (e.g. "remote hybrid")
  // is already handled above; anything else is unknown.
  if (n.includes('remote')) {
    return 'fully_remote';
  }
  return 'unknown';
}

/**
 * Is the job's employment type one of the user's selected non-negotiable types?
 * Comparison is tolerant of case and separators so external strings such as
 * `"Full Time"` match the `full_time` enum value.
 */
function employmentTypeAllowed(job: DiscoveredJob, user: UserConfig): boolean {
  const allowed = new Set(user.non_negotiables.employment_type.map(normalise));
  return allowed.has(normalise(job.employment_type));
}

/**
 * Is the job's work arrangement compatible with the user's preference (Req 9.1)?
 *  - `any` — every arrangement is compatible.
 *  - `fully_remote` — only fully-remote jobs are compatible.
 *  - `hybrid_remote` — hybrid or fully-remote jobs are compatible; onsite is not.
 *
 * Unknown / unclassifiable job arrangements are treated as incompatible with a
 * restrictive preference (fail-closed) so a violation is never passed.
 */
function workArrangementCompatible(job: DiscoveredJob, user: UserConfig): boolean {
  const preference = user.non_negotiables.work_arrangement;
  if (preference === 'any') {
    return true;
  }
  const category = classifyJobArrangement(job.work_arrangement);
  if (preference === 'fully_remote') {
    return category === 'fully_remote';
  }
  // preference === 'hybrid_remote'
  return category === 'hybrid' || category === 'fully_remote';
}

/** Does the job's location indicate Singapore (employer SG-based / SG timezone)? */
function isSingaporeLocation(location: string): boolean {
  return normalise(location).includes('singapore');
}

/**
 * Location check covering Req 8.1 and the fully-remote exception (Req 8.2).
 *
 * A fully-remote job is retained only when the employer is Singapore-based or
 * the role specifies a Singapore time zone; with the available job fields this
 * SG signal is carried by the `location` value referencing Singapore. A
 * non-remote job must be located in Singapore. In both cases the job is
 * acceptable iff its location indicates Singapore.
 */
function locationAcceptable(job: DiscoveredJob): boolean {
  return isSingaporeLocation(job.location);
}

/**
 * Does any configured custom dealbreaker match the job (Req 9.1)? Matching is a
 * case-insensitive substring search across the job's company, role title, and
 * job-description text. Empty / whitespace-only dealbreakers are ignored so they
 * never match every job.
 */
function customDealbreakerMatched(job: DiscoveredJob, user: UserConfig): boolean {
  const haystack = `${job.company}\n${job.role_title}\n${job.jd_text}`.toLowerCase();
  return user.non_negotiables.custom.some((dealbreaker) => {
    const needle = dealbreaker.trim().toLowerCase();
    return needle.length > 0 && haystack.includes(needle);
  });
}

/** Options for {@link preFilter}. */
export interface PreFilterOptions {
  /**
   * Optional structured logger for internal discarded-job analytics (Req 9.2).
   * Logging is a side effect only; it never affects the returned result, so the
   * function remains deterministic given its inputs.
   */
  logger?: Logger;
}

/**
 * Evaluate a discovered job against a user's non-negotiables (Req 8, 9).
 *
 * @param job - The discovered job (untrusted external fields).
 * @param user - The user configuration (latest source-of-truth onboarding).
 * @param options - Optional internal analytics logger.
 * @returns `{ pass: true }` when the job violates no non-negotiable; otherwise
 *   `{ pass: false, violated }` listing every violated non-negotiable key, in a
 *   deterministic order.
 */
export function preFilter(
  job: DiscoveredJob,
  user: UserConfig,
  options: PreFilterOptions = {},
): FilterResult {
  const violated: NonNegotiableKey[] = [];
  const nn = user.non_negotiables;

  // 1. Minimum salary (Req 9.1): the job's ceiling must reach the user's floor.
  if (job.salary_max < nn.min_salary) {
    violated.push('min_salary');
  }

  // 2. Employment type (Req 9.1).
  if (!employmentTypeAllowed(job, user)) {
    violated.push('employment_type');
  }

  // 3. Work arrangement (Req 9.1).
  if (!workArrangementCompatible(job, user)) {
    violated.push('work_arrangement');
  }

  // 4. Singapore location, incl. fully-remote exception (Req 8.1, 8.2).
  if (!locationAcceptable(job)) {
    violated.push('location');
  }

  // 5. Custom dealbreakers (Req 9.1).
  if (customDealbreakerMatched(job, user)) {
    violated.push('custom');
  }

  // 6 & 7. Employment Pass guardrails for sponsorship-requiring users (Req 9.3, 9.4).
  if (user.residency_status === 'need_sponsorship') {
    // EP salary floor: 5600 general / 6200 financial services. Equal-to-floor
    // passes; strictly below the floor is a violation (boundary-safe).
    const epFloor = deriveEpSalaryFloor(
      user.residency_status,
      user.profile.target_industries,
    );
    if (epFloor !== null && job.salary_max < epFloor) {
      violated.push('ep_salary_floor');
    }

    // EP sponsorship must be available on the listing.
    if (!job.ep_sponsorship_signal) {
      violated.push('ep_sponsorship');
    }
  }

  if (violated.length > 0) {
    // Internal analytics only — no user-visible record (Req 9.2).
    options.logger?.info('pre_filter.discarded', {
      job_id: job.job_id,
      user_id: user.user_id,
      violated,
    });
    return { pass: false, violated };
  }

  return { pass: true };
}

/**
 * Construct a {@link PreFilter}-conforming object whose `evaluate` runs
 * {@link preFilter}. An optional logger is captured for internal discarded-job
 * analytics (Req 9.2); the resulting `evaluate` keeps the design's
 * `(job, user) => FilterResult` signature.
 */
export function createPreFilter(logger?: Logger): {
  evaluate(job: DiscoveredJob, user: UserConfig): FilterResult;
} {
  return {
    evaluate: (job, user) => preFilter(job, user, { logger }),
  };
}
