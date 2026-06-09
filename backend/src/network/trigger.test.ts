/**
 * Property-based and unit tests for the Network_Agent application-count trigger
 * (task 8.6, Req 20.1).
 *
 * Feature: worksignal, Property 19: Network_Agent triggers on two applications.
 * Validates: Requirements 20.1
 *
 * Property 19 states that, for *all* sets of applications and *all* companies,
 * `shouldTriggerNetworkAgent` returns `true` for a company iff the user has sent
 * at least NETWORK_TRIGGER_THRESHOLD (2) applications to that company. The
 * generators below deliberately exercise the 2-application boundary by pinning
 * an exact application count (0, 1, 2, 3+) for a target company while adding
 * unrelated "noise" applications to other companies that must never affect the
 * decision.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { Application } from '@worksignal/shared';
import {
  shouldTriggerNetworkAgent,
  countApplicationsByCompany,
  NETWORK_TRIGGER_THRESHOLD,
} from './trigger.js';

/** Minimum fast-check iterations required by the spec for property tests. */
const NUM_RUNS = 200;

/* --- Helpers -------------------------------------------------------------- */

/**
 * Mirror of the trigger's internal company normalisation (trimmed,
 * case-insensitive). Used only to keep generated "noise" companies provably
 * distinct from the target so the boundary count stays exact.
 */
function normalise(company: string): string {
  return company.trim().toLowerCase();
}

/**
 * Build a full {@link Application} from just a company name. The trigger only
 * reads `company`, but we construct the complete shared type so the test
 * exercises real `Application` records (per task 8.6).
 */
function appForCompany(company: string): Application {
  return {
    application_id: 'app',
    user_id: 'user',
    job_id: 'job',
    verdict_id: 'verdict',
    company,
    role_title: 'Engineer',
    customised_resume_s3_key: 'key',
    customisation_applied: true,
    cover_letter_text: '',
    sent_at: '2024-01-01T00:00:00.000Z',
    recipient_email: null,
    email_thread_id: null,
    status: 'sent',
    redirect_source_url: null,
    redirected_at: null,
    status_updated_at: '2024-01-01T00:00:00.000Z',
    classification_confidence: 0,
  };
}

/* --- Generators ----------------------------------------------------------- */

/** Arbitrary free-text company names, including case/whitespace variation. */
const companyArb: fc.Arbitrary<string> = fc.oneof(
  fc.string(),
  // Bias toward realistic, short company tokens with surrounding whitespace and
  // mixed case so normalisation equivalence is exercised.
  fc
    .tuple(
      fc.constantFrom('', ' ', '  '),
      fc.constantFrom('Acme', 'acme', 'ACME', 'Globex', 'Initech', 'Umbrella'),
      fc.constantFrom('', ' ', '\t'),
    )
    .map(([pre, name, post]) => `${pre}${name}${post}`),
);

/**
 * A scenario that pins the application count for a single target company to an
 * exact value spanning the 2-application boundary (0, 1, 2, 3, 4, 5), plus
 * "noise" applications to companies that are provably distinct from the target.
 * The target copies vary in case/whitespace to confirm they still count as one
 * company.
 */
const boundaryScenarioArb = fc
  .record({
    target: companyArb.filter((c) => normalise(c).length > 0),
    count: fc.integer({ min: 0, max: 5 }),
    casingSeeds: fc.array(fc.integer({ min: 0, max: 2 }), {
      minLength: 0,
      maxLength: 5,
    }),
    noise: fc.array(companyArb, { minLength: 0, maxLength: 8 }),
  })
  .map(({ target, count, casingSeeds, noise }) => {
    const targetKey = normalise(target);

    // `count` copies of the target, each with an equivalent (normalised) name.
    const decorate = (seed: number, base: string): string => {
      const trimmed = base.trim();
      switch (seed % 3) {
        case 0:
          return trimmed.toUpperCase();
        case 1:
          return `  ${trimmed.toLowerCase()} `;
        default:
          return trimmed;
      }
    };
    const targetApps = Array.from({ length: count }, (_, i) =>
      appForCompany(decorate(casingSeeds[i] ?? 0, target)),
    );

    // Noise must never normalise to the target key, or it would change `count`.
    const noiseApps = noise
      .filter((c) => normalise(c) !== targetKey)
      .map(appForCompany);

    // Interleave deterministically so input order does not matter.
    const applications: Application[] = [];
    const max = Math.max(targetApps.length, noiseApps.length);
    for (let i = 0; i < max; i += 1) {
      if (i < noiseApps.length) applications.push(noiseApps[i]!);
      if (i < targetApps.length) applications.push(targetApps[i]!);
    }

    return { applications, company: target, count };
  });

/* --- Property 19 ---------------------------------------------------------- */

describe('Feature: worksignal, Property 19: Network_Agent triggers on two applications', () => {
  it('triggers for a company iff the count of applications to it is >= 2 [Validates: Requirements 20.1]', () => {
    fc.assert(
      fc.property(
        fc.array(companyArb, { minLength: 0, maxLength: 20 }),
        companyArb,
        (companies, company) => {
          const applications = companies.map(appForCompany);
          const count = countApplicationsByCompany(applications, company);
          expect(shouldTriggerNetworkAgent(applications, company)).toBe(
            count >= NETWORK_TRIGGER_THRESHOLD,
          );
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('respects the exact 2-application boundary: 0/1 do not trigger, 2+ do [Validates: Requirements 20.1]', () => {
    fc.assert(
      fc.property(boundaryScenarioArb, ({ applications, company, count }) => {
        // Noise never alters the target's count.
        expect(countApplicationsByCompany(applications, company)).toBe(count);
        expect(shouldTriggerNetworkAgent(applications, company)).toBe(
          count >= 2,
        );
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('exercises each boundary value explicitly (0, 1, 2, 3)', () => {
    const base: Record<number, boolean> = { 0: false, 1: false, 2: true, 3: true };
    for (const [n, expected] of Object.entries(base)) {
      const apps = Array.from({ length: Number(n) }, () =>
        appForCompany('Acme'),
      );
      expect(shouldTriggerNetworkAgent(apps, 'Acme')).toBe(expected);
    }
  });
});
