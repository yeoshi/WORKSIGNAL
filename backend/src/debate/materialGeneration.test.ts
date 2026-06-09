/**
 * Unit tests for application material-generation fallbacks (Task 14.3).
 *
 * Feature: worksignal
 * Validates: Requirements 14.4, 14.5, 14.6 (with 14.1, 14.2, 14.3 boundary
 * coverage on the happy path).
 *
 * `generateMaterials` (and the `createGenerateMaterials` hook) must never throw:
 * every Bedrock or S3 failure degrades to a usable fallback so a `Materials`
 * value is always produced and the application can still be queued for review.
 *
 * These are example-based unit tests with injected fakes:
 *  - a fake Bedrock invoke that returns canned text or can be made to throw
 *    (globally, or only for the resume / cover-letter prompt);
 *  - a fake `MaterialStore` whose `putObject` can be made to throw.
 *
 * Coverage:
 *  1. Happy path — Bedrock customises the resume, it is stored in S3,
 *     `customisation_applied = true`; the cover letter is built from the angle;
 *     for `need_sponsorship` the cover letter states the work-authorisation
 *     status (Req 14.1, 14.2, 14.3).
 *  2. Resume customisation (Bedrock) failure → base-resume fallback,
 *     `customisation_applied = false` (Req 14.4).
 *  3. S3 `putObject` failure → base-resume fallback,
 *     `customisation_applied = false` (Req 14.5).
 *  4. Any generation failure (cover-letter Bedrock throws) still returns usable
 *     `Materials` with a base cover letter so the app can be queued (Req 14.6).
 */

import { describe, it, expect } from 'vitest';
import type {
  Job,
  MasterDecision,
  ResidencyStatus,
  UserConfig,
} from '@worksignal/shared';
import {
  createGenerateMaterials,
  defaultCustomisedResumeKey,
  generateMaterials,
  type MaterialBedrockInvoke,
  type MaterialStore,
} from './materialGeneration.js';

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

const BASE_RESUME_KEY = 'resumes/user-1/base.pdf';

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    job_id: 'job-1',
    user_id: 'user-1',
    company: 'Acme Pte Ltd',
    role_title: 'Software Engineer',
    salary_min: 6000,
    salary_max: 9000,
    jd_text: 'Build delightful products with a small team.',
    posted_at: '2024-01-01T00:00:00.000Z',
    source_url: 'https://example.com/jobs/1',
    employer_email: 'hiring@acme.example',
    employment_type: 'full_time',
    work_arrangement: 'hybrid',
    location: 'Singapore',
    ep_sponsorship_signal: false,
    mcf_listing_days: 3,
    scanned_at: '2024-01-02T00:00:00.000Z',
    ...overrides,
  };
}

function makeUser(
  residency: ResidencyStatus = 'citizen',
  overrides: Partial<UserConfig> = {},
): UserConfig {
  return {
    user_id: 'user-1',
    email: 'jane@example.com',
    name: 'Jane Tan',
    resume_s3_key: BASE_RESUME_KEY,
    career_stage: 'mid_career',
    residency_status: residency,
    profile: {
      current_role: 'Software Engineer',
      years_experience: 4,
      skills: ['TypeScript', 'AWS', 'React'],
      education: 'BSc Computer Science',
      university: 'NUS',
      target_roles: ['Senior Software Engineer'],
      target_industries: ['Technology'],
      dream_companies: ['Acme Pte Ltd'],
      priority_ranking: [
        'growth',
        'salary',
        'balance',
        'brand',
        'purpose',
        'stability',
      ],
    },
    non_negotiables: {
      min_salary: 5000,
      employment_type: ['full_time'],
      work_arrangement: 'any',
      custom: [],
      ep_sponsorship_required: residency === 'need_sponsorship',
    },
    agent_weights: {
      ambition_threshold: 70,
      realism_threshold: 80,
      risk_max_acceptable: 70,
      opportunity_urgency_boost: true,
    },
    inbox_monitoring_available: true,
    onboarding_version: 1,
    updated_at: '2024-01-01T00:00:00.000Z',
    created_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeDecision(overrides: Partial<MasterDecision> = {}): MasterDecision {
  return {
    decision: 'apply_consensus',
    summary: 'Strong match across all agents.',
    resume_instructions:
      'Emphasise TypeScript and AWS experience; quantify impact.',
    cover_letter_angle:
      'Lead with enthusiasm for the product and the small-team culture.',
    agents_for: ['ambition', 'realism', 'risk', 'opportunity'],
    agents_against: [],
    user_action_required: false,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ *
 * Fake collaborators
 * ------------------------------------------------------------------ */

const CUSTOMISED_RESUME_TEXT = 'CUSTOMISED RESUME — tailored for Acme.';
const GENERATED_COVER_LETTER = 'Generated cover letter built from the angle.';

interface BedrockCall {
  prompt: string;
}

/**
 * Build a fake Bedrock invoke. By default it returns the customised resume for
 * a resume prompt and the generated cover letter for a cover-letter prompt
 * (the two prompts are distinguished by a marker the production prompt builders
 * embed). `failOn` makes the relevant prompt(s) throw.
 */
function makeFakeBedrock(opts: {
  failOn?: 'resume' | 'coverLetter' | 'all';
  calls?: BedrockCall[];
} = {}): MaterialBedrockInvoke {
  const calls = opts.calls;
  return async (prompt: string): Promise<string> => {
    calls?.push({ prompt });
    const isResume = prompt.includes('expert resume writer');
    const isCoverLetter = prompt.includes('expert cover-letter writer');

    if (opts.failOn === 'all') {
      throw new Error('bedrock unavailable');
    }
    if (opts.failOn === 'resume' && isResume) {
      throw new Error('resume customisation failed');
    }
    if (opts.failOn === 'coverLetter' && isCoverLetter) {
      throw new Error('cover-letter generation failed');
    }

    if (isResume) return CUSTOMISED_RESUME_TEXT;
    if (isCoverLetter) return GENERATED_COVER_LETTER;
    return 'unexpected prompt';
  };
}

interface StoredObject {
  key: string;
  body: string | Uint8Array | Buffer;
  contentType?: string;
}

/** A fake MaterialStore that records writes, or throws when `fail` is set. */
function makeFakeStore(opts: { fail?: boolean; stored?: StoredObject[] } = {}): MaterialStore {
  const stored = opts.stored;
  return {
    async putObject(key, body, options): Promise<void> {
      if (opts.fail) {
        throw new Error('s3 putObject failed');
      }
      stored?.push({ key, body, contentType: options?.contentType });
    },
  };
}

/* ------------------------------------------------------------------ *
 * 1. Happy path (Req 14.1, 14.2, 14.3)
 * ------------------------------------------------------------------ */

describe('generateMaterials — happy path (Req 14.1, 14.2, 14.3)', () => {
  it('customises the resume, stores it in S3, and records customisation_applied=true', async () => {
    const job = makeJob();
    const user = makeUser('citizen');
    const decision = makeDecision();
    const stored: StoredObject[] = [];

    const materials = await generateMaterials(job, decision, user, {
      bedrock: makeFakeBedrock(),
      s3: makeFakeStore({ stored }),
    });

    const expectedKey = defaultCustomisedResumeKey(user, job);
    expect(materials.customisation_applied).toBe(true);
    expect(materials.resume_s3_key).toBe(expectedKey);

    // The customised resume text was stored in S3 under the generated key.
    expect(stored).toHaveLength(1);
    const object = stored[0];
    if (object === undefined) throw new Error('expected one stored object');
    expect(object.key).toBe(expectedKey);
    expect(object.body).toBe(CUSTOMISED_RESUME_TEXT);
    expect(object.contentType).toBe('text/plain');
  });

  it('builds the cover letter from the Master angle (Req 14.2)', async () => {
    const materials = await generateMaterials(
      makeJob(),
      makeDecision(),
      makeUser('citizen'),
      { bedrock: makeFakeBedrock(), s3: makeFakeStore() },
    );

    expect(materials.cover_letter_text).toBe(GENERATED_COVER_LETTER);
  });

  it('includes the work-authorisation statement for need_sponsorship users (Req 14.3)', async () => {
    const materials = await generateMaterials(
      makeJob(),
      makeDecision(),
      makeUser('need_sponsorship'),
      { bedrock: makeFakeBedrock(), s3: makeFakeStore() },
    );

    // The generated text does not mention sponsorship, so the deterministic
    // work-authorisation statement must have been appended.
    const lower = materials.cover_letter_text.toLowerCase();
    expect(
      lower.includes('employment pass') || lower.includes('sponsorship'),
    ).toBe(true);
    // The generated body is preserved alongside the appended statement.
    expect(materials.cover_letter_text).toContain(GENERATED_COVER_LETTER);
  });

  it('passes the resume prompt with sponsorship instruction through Bedrock for need_sponsorship', async () => {
    const calls: BedrockCall[] = [];
    await generateMaterials(
      makeJob(),
      makeDecision(),
      makeUser('need_sponsorship'),
      { bedrock: makeFakeBedrock({ calls }), s3: makeFakeStore() },
    );

    const coverLetterCall = calls.find((c) =>
      c.prompt.includes('expert cover-letter writer'),
    );
    expect(coverLetterCall).toBeDefined();
    // Req 14.3: the cover-letter prompt instructs the model to state EP status.
    expect(coverLetterCall?.prompt).toContain('Employment Pass');
  });
});

/* ------------------------------------------------------------------ *
 * 2. Resume customisation (Bedrock) failure → base-resume fallback (Req 14.4)
 * ------------------------------------------------------------------ */

describe('generateMaterials — resume customisation failure (Req 14.4)', () => {
  it('falls back to the base resume and records customisation_applied=false', async () => {
    const user = makeUser('citizen');
    const stored: StoredObject[] = [];

    const materials = await generateMaterials(makeJob(), makeDecision(), user, {
      bedrock: makeFakeBedrock({ failOn: 'resume' }),
      s3: makeFakeStore({ stored }),
    });

    expect(materials.customisation_applied).toBe(false);
    expect(materials.resume_s3_key).toBe(BASE_RESUME_KEY);
    // Customisation failed before any S3 write, so nothing was stored.
    expect(stored).toHaveLength(0);
    // The cover letter is unaffected by the resume failure (Req 14.2).
    expect(materials.cover_letter_text).toBe(GENERATED_COVER_LETTER);
  });

  it('does not throw when resume customisation fails', async () => {
    await expect(
      generateMaterials(makeJob(), makeDecision(), makeUser('citizen'), {
        bedrock: makeFakeBedrock({ failOn: 'resume' }),
        s3: makeFakeStore(),
      }),
    ).resolves.toBeDefined();
  });
});

/* ------------------------------------------------------------------ *
 * 3. S3 storage failure → base-resume fallback (Req 14.5)
 * ------------------------------------------------------------------ */

describe('generateMaterials — S3 storage failure (Req 14.5)', () => {
  it('falls back to the base resume and records customisation_applied=false', async () => {
    const user = makeUser('citizen');

    const materials = await generateMaterials(makeJob(), makeDecision(), user, {
      bedrock: makeFakeBedrock(),
      s3: makeFakeStore({ fail: true }),
    });

    expect(materials.customisation_applied).toBe(false);
    expect(materials.resume_s3_key).toBe(BASE_RESUME_KEY);
    // The cover letter still succeeds even though the resume store failed.
    expect(materials.cover_letter_text).toBe(GENERATED_COVER_LETTER);
  });

  it('does not throw when S3 putObject fails', async () => {
    await expect(
      generateMaterials(makeJob(), makeDecision(), makeUser('citizen'), {
        bedrock: makeFakeBedrock(),
        s3: makeFakeStore({ fail: true }),
      }),
    ).resolves.toBeDefined();
  });
});

/* ------------------------------------------------------------------ *
 * 4. Any generation failure still returns usable Materials (Req 14.6)
 * ------------------------------------------------------------------ */

describe('generateMaterials — still queue-able on any failure (Req 14.6)', () => {
  it('returns a base cover letter when cover-letter generation fails', async () => {
    const job = makeJob();
    const user = makeUser('citizen');

    const materials = await generateMaterials(job, makeDecision(), user, {
      bedrock: makeFakeBedrock({ failOn: 'coverLetter' }),
      s3: makeFakeStore(),
    });

    // A usable, non-empty cover letter is still produced (deterministic base).
    expect(materials.cover_letter_text.length).toBeGreaterThan(0);
    expect(materials.cover_letter_text).not.toBe(GENERATED_COVER_LETTER);
    expect(materials.cover_letter_text).toContain(job.company);
    expect(materials.cover_letter_text).toContain(user.name);
    // The resume path still succeeded independently.
    expect(materials.customisation_applied).toBe(true);
  });

  it('returns usable Materials even when both Bedrock paths fail', async () => {
    const user = makeUser('citizen');

    const materials = await generateMaterials(makeJob(), makeDecision(), user, {
      bedrock: makeFakeBedrock({ failOn: 'all' }),
      s3: makeFakeStore(),
    });

    // Resume falls back to base (Req 14.4); cover letter falls back to base (Req 14.6).
    expect(materials.customisation_applied).toBe(false);
    expect(materials.resume_s3_key).toBe(BASE_RESUME_KEY);
    expect(materials.cover_letter_text.length).toBeGreaterThan(0);
  });

  it('still injects the work-authorisation statement on the base cover letter for need_sponsorship (Req 14.3 + 14.6)', async () => {
    const materials = await generateMaterials(
      makeJob(),
      makeDecision(),
      makeUser('need_sponsorship'),
      { bedrock: makeFakeBedrock({ failOn: 'all' }), s3: makeFakeStore() },
    );

    const lower = materials.cover_letter_text.toLowerCase();
    expect(
      lower.includes('employment pass') || lower.includes('sponsorship'),
    ).toBe(true);
  });

  it('never throws even when both Bedrock and S3 fail', async () => {
    await expect(
      generateMaterials(makeJob(), makeDecision(), makeUser('need_sponsorship'), {
        bedrock: makeFakeBedrock({ failOn: 'all' }),
        s3: makeFakeStore({ fail: true }),
      }),
    ).resolves.toBeDefined();
  });
});

/* ------------------------------------------------------------------ *
 * createGenerateMaterials hook wiring
 * ------------------------------------------------------------------ */

describe('createGenerateMaterials — hook shape', () => {
  it('produces a (job, decision, user) => Promise<Materials> hook with the same fallback behaviour', async () => {
    const hook = createGenerateMaterials({
      bedrock: makeFakeBedrock({ failOn: 'resume' }),
      s3: makeFakeStore(),
    });

    const materials = await hook(makeJob(), makeDecision(), makeUser('citizen'));
    expect(materials.customisation_applied).toBe(false);
    expect(materials.resume_s3_key).toBe(BASE_RESUME_KEY);
  });
});
