/**
 * Network_Agent application-count trigger (Requirement 20.1).
 *
 * Pure, deterministic logic — no I/O. The Network_Agent is a background flow
 * that surfaces networking connections for a company once the user has shown
 * sustained interest in that company by applying to it more than once.
 *
 * Design reference: design.md — Network_Agent: "Triggered when a user sends
 * **two or more applications to the same company** (20.1)." The
 * `NetworkAgent.onCompanyInterest` contract in `@worksignal/shared` is wired to
 * this trigger in task 18.2; this module is the single source of truth for
 * *whether* the trigger fires for a given company.
 *
 * Requirement:
 *  - 20.1: WHEN a User sends two or more applications to the same company, THE
 *          Network_Agent SHALL be triggered for that company.
 *
 * Correctness property (Property 19): for *all* sets of applications and for
 * *all* companies, the Network_Agent triggers for a company iff the number of
 * applications the user has sent to that company is at least
 * {@link NETWORK_TRIGGER_THRESHOLD} (2). The 2-application boundary is the edge
 * exercised most heavily by the property test (task 8.6).
 *
 * Company identity: applications denormalise the company name as a free-text
 * string (see `Application.company`). To count "the same company" robustly the
 * trigger groups by a normalised key (trimmed, case-insensitive) so that
 * "Acme", "acme" and " Acme " are treated as one company. The original display
 * spelling is preserved in {@link companiesTriggeringNetworkAgent} output.
 */

import type { Application } from '@worksignal/shared';

/**
 * The number of applications to a single company at or above which the
 * Network_Agent is triggered for that company (Req 20.1).
 */
export const NETWORK_TRIGGER_THRESHOLD = 2 as const;

/**
 * The minimal shape this module needs from an application: just the company it
 * was sent to. Tied to the shared {@link Application} type so callers can pass
 * full application records, and property tests can pass minimal objects.
 */
export type ApplicationCompanyRef = Pick<Application, 'company'>;

/**
 * Normalise a company name into a stable grouping key: trimmed and lower-cased
 * so that differences in surrounding whitespace or letter case do not split one
 * company into several. Deterministic and total over any string.
 */
function normaliseCompany(company: string): string {
  return company.trim().toLowerCase();
}

/**
 * Count how many of the given applications were sent to `company`.
 *
 * Companies are compared by their normalised key (see {@link normaliseCompany})
 * so case and surrounding whitespace do not matter. Pure and total: an empty
 * application list yields `0`.
 *
 * @param applications - The user's applications.
 * @param company - The company to count applications for.
 * @returns The number of applications addressed to that company.
 */
export function countApplicationsByCompany(
  applications: readonly ApplicationCompanyRef[],
  company: string,
): number {
  const target = normaliseCompany(company);
  let count = 0;
  for (const application of applications) {
    if (normaliseCompany(application.company) === target) {
      count += 1;
    }
  }
  return count;
}

/**
 * Decide whether the Network_Agent should be triggered for `company` (Req 20.1,
 * Property 19).
 *
 * Returns `true` iff the user has sent at least
 * {@link NETWORK_TRIGGER_THRESHOLD} applications to that company. This is the
 * exact 2-application boundary: one application does not trigger; two or more
 * do.
 *
 * @param applications - The user's applications.
 * @param company - The company to evaluate.
 * @returns `true` iff the application count for the company meets the threshold.
 */
export function shouldTriggerNetworkAgent(
  applications: readonly ApplicationCompanyRef[],
  company: string,
): boolean {
  return (
    countApplicationsByCompany(applications, company) >=
    NETWORK_TRIGGER_THRESHOLD
  );
}

/**
 * Compute every company for which the Network_Agent should be triggered across
 * the user's applications (Req 20.1).
 *
 * Applications are grouped by normalised company key; a company qualifies iff
 * its group has at least {@link NETWORK_TRIGGER_THRESHOLD} applications. The
 * returned list uses each company's first-seen display spelling and is sorted
 * alphabetically (by normalised key) so the result is deterministic regardless
 * of input order.
 *
 * @param applications - The user's applications.
 * @returns The display names of all companies meeting the trigger threshold.
 */
export function companiesTriggeringNetworkAgent(
  applications: readonly ApplicationCompanyRef[],
): string[] {
  /** Per normalised key: the first-seen display name and the running count. */
  const groups = new Map<string, { display: string; count: number }>();
  for (const application of applications) {
    const key = normaliseCompany(application.company);
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      groups.set(key, { display: application.company, count: 1 });
    }
  }

  return [...groups.entries()]
    .filter(([, group]) => group.count >= NETWORK_TRIGGER_THRESHOLD)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, group]) => group.display);
}
