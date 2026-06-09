/**
 * Property-based test for reply role disambiguation (task 7.6).
 *
 * Feature: worksignal, Property 15: Reply role disambiguation is correct
 * Validates: Requirements 18.3
 *
 * Requirement 18.3: WHERE a User has more than one sent Application to the same
 * company, THE Gmail_Monitor SHALL determine which specific Application a reply
 * corresponds to using the role title referenced in the reply, the thread
 * identifier, and the application thread the reply belongs to.
 *
 * Property 15 (as stated for this task): given two or more applications to the
 * same company that differ by role title, and a reply that clearly references
 * one of those role titles, `disambiguateReply` attributes the reply to the
 * application whose role title the reply references.
 *
 * Generators construct a same-company set of applications with token-disjoint
 * role titles and a reply that references exactly one of them verbatim, so the
 * referenced application is the unambiguous correct attribution. A second case
 * additionally assigns a *conflicting* thread id to a non-referenced
 * application, proving the role-title reference is the primary signal
 * (Req 18.3 / design.md Gmail_Monitor).
 *
 * fast-check, minimum 100 iterations.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { Application, InboundEmail } from '@worksignal/shared';
import { disambiguateReply } from './roleDisambiguation.js';

// --- Fixed, collision-free vocabularies -------------------------------------

/**
 * Role titles whose tokens are pairwise disjoint. Because no two titles share a
 * token, a reply that references one title verbatim gives that title full token
 * coverage and every other candidate zero coverage — making the referenced
 * application the unambiguous correct attribution.
 */
const ROLE_TITLES = [
  'Backend Engineer',
  'Frontend Designer',
  'Product Manager',
  'Data Scientist',
  'Marketing Strategist',
  'Financial Analyst',
  'Security Architect',
  'Mobile Developer',
] as const;

/** Company names that contain none of the role-title tokens above. */
const COMPANIES = ['Acme', 'Globex', 'Initech', 'Umbrella', 'Hooli', 'Vandelay'] as const;

/**
 * Boilerplate words used as reply "noise". None collide with any role-title or
 * company token, so they cannot accidentally lend coverage to a non-referenced
 * candidate.
 */
const NOISE_WORDS = [
  'thank',
  'you',
  'we',
  'will',
  'review',
  'get',
  'back',
  'soon',
  'regards',
  'hiring',
  'best',
  'cheers',
] as const;

// --- Helpers ----------------------------------------------------------------

/** Build a fully-populated Application with sensible defaults plus overrides. */
function makeApplication(overrides: Partial<Application>): Application {
  return {
    application_id: 'app-default',
    user_id: 'user-1',
    job_id: 'job-1',
    verdict_id: 'verdict-1',
    company: 'Acme',
    role_title: 'Backend Engineer',
    customised_resume_s3_key: 's3://resume',
    customisation_applied: true,
    cover_letter_text: 'cover',
    sent_at: '2024-01-01T00:00:00.000Z',
    recipient_email: 'hr@acme.example',
    email_thread_id: null,
    status: 'sent',
    redirect_source_url: null,
    redirected_at: null,
    status_updated_at: '2024-01-01T00:00:00.000Z',
    classification_confidence: 0,
    ...overrides,
  };
}

// --- Generators -------------------------------------------------------------

const companyArb = fc.constantFrom(...COMPANIES);

/** A short run of collision-free noise words. */
const noiseArb = fc
  .array(fc.constantFrom(...NOISE_WORDS), { minLength: 0, maxLength: 6 })
  .map((ws) => ws.join(' '));

/**
 * A disambiguation scenario: a same-company set of >=2 applications with
 * token-disjoint role titles, one designated target the reply references, and
 * the surrounding reply text.
 */
const scenarioArb = fc
  .record({
    company: companyArb,
    titles: fc.uniqueArray(fc.constantFrom(...ROLE_TITLES), {
      minLength: 2,
      maxLength: ROLE_TITLES.length,
    }),
    leadNoise: noiseArb,
    trailNoise: noiseArb,
    threadId: fc.string({ minLength: 1 }),
    // Distinguishes the reply position: whether the title appears in subject too.
    inSubject: fc.boolean(),
  })
  .chain((base) =>
    fc.record({
      base: fc.constant(base),
      targetIndex: fc.integer({ min: 0, max: base.titles.length - 1 }),
      // A non-target index used to plant a conflicting thread id.
      decoyOffset: fc.integer({ min: 1, max: base.titles.length - 1 }),
    }),
  )
  .map(({ base, targetIndex, decoyOffset }) => {
    const targetTitle = base.titles[targetIndex]!;
    const decoyIndex = (targetIndex + decoyOffset) % base.titles.length;

    const applications: Application[] = base.titles.map((title, i) =>
      makeApplication({
        application_id: `app-${i}`,
        company: base.company,
        role_title: title,
      }),
    );

    const subject = base.inSubject
      ? `Re: Your application for the ${targetTitle} position`
      : 'Re: Your recent application';
    const body = `${base.leadNoise} Thank you for applying for the ${targetTitle} role at ${base.company}. ${base.trailNoise}`;

    const email: InboundEmail = {
      message_id: 'msg-1',
      thread_id: base.threadId,
      sender_email: `careers@${base.company.toLowerCase()}.example`,
      sender_domain: `${base.company.toLowerCase()}.example`,
      subject,
      body,
      received_at: '2024-01-02T00:00:00.000Z',
    };

    return {
      email,
      applications,
      targetId: `app-${targetIndex}`,
      decoyId: `app-${decoyIndex}`,
    };
  });

// --- Property 15 ------------------------------------------------------------

describe('Feature: worksignal, Property 15: Reply role disambiguation is correct', () => {
  it('attributes the reply to the application whose role title the reply references [Validates: Requirements 18.3]', () => {
    fc.assert(
      fc.property(scenarioArb, ({ email, applications, targetId }) => {
        const result = disambiguateReply(email, applications);
        expect(result.matched).toBe(true);
        if (result.matched) {
          expect(result.applicationId).toBe(targetId);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('role-title reference wins even when a different application carries the matching thread id [Validates: Requirements 18.3]', () => {
    fc.assert(
      fc.property(scenarioArb, ({ email, applications, targetId, decoyId }) => {
        // Plant the reply's thread id on a NON-referenced application; the
        // referenced role title must still decide the attribution.
        const apps = applications.map((app) =>
          app.application_id === decoyId
            ? { ...app, email_thread_id: email.thread_id }
            : app,
        );
        const result = disambiguateReply(email, apps);
        expect(result.matched).toBe(true);
        if (result.matched) {
          expect(result.applicationId).toBe(targetId);
        }
      }),
      { numRuns: 200 },
    );
  });
});
