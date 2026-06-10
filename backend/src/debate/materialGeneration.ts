/**
 * Application material generation (Task 14.2, Requirement 14).
 *
 * Implements the Debate_Engine's material-generation step: for an
 * apply-equivalent Master decision, produce the tailored application materials
 * — a customised resume stored in S3 and a cover letter stored with the
 * application record — that the review queue / Application_Sender consume.
 *
 * This module owns the internals behind the `GenerateMaterialsHook` the
 * in-process debate machine (`./debateMachine.ts`) calls for apply-equivalent
 * decisions; `createGenerateMaterials` returns a hook of exactly that shape:
 *
 *   (job, decision, user) => Promise<Materials>
 *
 * Behaviour (design.md — Debate_Engine "Material generation (14)"):
 *  - **14.1** Apply the Master's `resume_instructions` via Bedrock and store the
 *    resulting customised resume in S3, recording its key.
 *  - **14.2** Apply the Master's `cover_letter_angle` to produce the cover-letter
 *    text, returned with the materials so it is stored on the application record.
 *  - **14.3** WHERE the user's residency status is `need_sponsorship`, include
 *    the user's work-authorisation status in the generated cover letter.
 *  - **14.4 / 14.5** IF resume customisation fails OR storing the generated
 *    resume in S3 fails, fall back to the user's base resume and record
 *    `customisation_applied = false`.
 *  - **14.6** IF any material generation fails, still return materials with the
 *    available documents so the application can be queued for user review.
 *
 * Robustness: neither the resume nor the cover-letter path is allowed to throw.
 * Every failure degrades to a usable fallback (base resume, base cover letter)
 * so a `Materials` value is *always* produced and the application can be queued
 * for review (Req 14.6). The user can then edit the cover letter on the Job
 * Detail screen before sending (Req 15.4, 15.6).
 *
 * Testability: both Bedrock and S3 are injected, and the Bedrock call is routed
 * through the bounded-retry wrapper (`invokeWithBoundedRetry`, Req 22.1), so the
 * generator runs deterministically with no real AWS calls. The resume S3 key
 * builder and content type are injectable as well.
 */

import type {
  Job,
  Logger,
  MasterDecision,
  Materials,
  UserConfig,
} from '@worksignal/shared';
import {
  invokeWithBoundedRetry,
  type BackoffFn,
  type RateLimitPredicate,
  type SleepFn,
} from '../bedrock/invoke.js';
import type { GenerateMaterialsHook } from './debateMachine.js';

/* ------------------------------------------------------------------ *
 * Injectable collaborators
 * ------------------------------------------------------------------ */

/**
 * An injectable Bedrock text invocation. Given a fully-rendered prompt, resolves
 * to the model's raw completion text. Injected so the generator runs with no
 * real Bedrock calls in tests; production wiring supplies a function backed by
 * the Bedrock runtime client. Rate-limit retries are handled by the generator
 * via {@link invokeWithBoundedRetry}, so this should perform exactly one
 * underlying call per invocation.
 */
export type MaterialBedrockInvoke = (prompt: string) => Promise<string>;

/**
 * The minimal S3 surface the generator needs: store an object's bytes/text
 * under a key. Satisfied by `S3Helper` from `@worksignal/shared` (whose
 * `putObject(key, body, options?)` is structurally compatible) and trivially
 * faked in tests.
 */
export interface MaterialStore {
  putObject(
    key: string,
    body: string | Uint8Array | Buffer,
    options?: { contentType?: string },
  ): Promise<void>;
}

/* ------------------------------------------------------------------ *
 * Dependencies
 * ------------------------------------------------------------------ */

/** Construction dependencies for {@link createGenerateMaterials}. */
export interface GenerateMaterialsDeps {
  /** Performs the Bedrock generation call and returns raw model text (required). */
  bedrock: MaterialBedrockInvoke;
  /** Stores the generated customised resume in the private bucket (required). */
  s3: MaterialStore;
  /** Optional structured logger for recording fallbacks (Req 14.4-14.6). */
  logger?: Logger;
  /**
   * Builds the S3 key the customised resume is stored under. Defaults to
   * {@link defaultCustomisedResumeKey} (`generated-resumes/{user_id}/{job_id}.txt`).
   */
  resumeKeyFor?: (user: UserConfig, job: Job) => string;
  /** Content type for the stored customised resume. Defaults to `text/plain`. */
  resumeContentType?: string;
  /** Delay function between retries; defaults to a real timer in the wrapper. */
  sleep?: SleepFn;
  /** Rate-limit predicate; defaults to the wrapper's Bedrock throttling check. */
  isRateLimit?: RateLimitPredicate;
  /** Requested retry budget; clamped to the hard cap of three by the wrapper. */
  maxRetries?: number;
  /** Base backoff delay in ms; defaults to the wrapper's default. */
  baseDelayMs?: number;
  /** Backoff schedule; defaults to exponential in the wrapper. */
  backoff?: BackoffFn;
}

/* ------------------------------------------------------------------ *
 * Key + content defaults
 * ------------------------------------------------------------------ */

/** Default S3 key for a generated customised resume. */
export function defaultCustomisedResumeKey(user: UserConfig, job: Job): string {
  return `generated-resumes/${user.user_id}/${job.job_id}.txt`;
}

const DEFAULT_RESUME_CONTENT_TYPE = 'text/plain';

/* ------------------------------------------------------------------ *
 * Prompt builders
 * ------------------------------------------------------------------ */

/**
 * Render the customised-resume prompt: the base resume reference plus the
 * Master's resume customisation instructions (Req 14.1). Untrusted job text is
 * passed only as data.
 */
function buildResumePrompt(
  job: Job,
  instructions: string,
  user: UserConfig,
): string {
  return [
    'You are an expert resume writer. Produce a customised resume tailored to',
    'the job below by applying the provided customisation instructions to the',
    "candidate's background. Return ONLY the finished resume text — no",
    'commentary, no markdown fences.',
    '',
    `CANDIDATE: ${user.name}`,
    `CURRENT ROLE: ${user.profile.current_role}`,
    `YEARS OF EXPERIENCE: ${user.profile.years_experience}`,
    `SKILLS: ${user.profile.skills.join(', ')}`,
    `EDUCATION: ${user.profile.education} (${user.profile.university})`,
    '',
    `TARGET JOB: ${job.role_title} at ${job.company}`,
    'JOB DESCRIPTION:',
    job.jd_text,
    '',
    'CUSTOMISATION INSTRUCTIONS:',
    instructions,
  ].join('\n');
}

/**
 * Render the cover-letter prompt: the Master's cover-letter angle, plus — for
 * `need_sponsorship` users — an explicit instruction to state the candidate's
 * work-authorisation status (Req 14.2, 14.3).
 */
function buildCoverLetterPrompt(
  job: Job,
  angle: string,
  user: UserConfig,
): string {
  const lines = [
    'You are an expert cover-letter writer. Write a concise, compelling cover',
    'letter for the job below, built around the provided angle. Return ONLY the',
    'cover-letter text — no commentary, no markdown fences.',
    '',
    `CANDIDATE: ${user.name}`,
    `TARGET JOB: ${job.role_title} at ${job.company}`,
    'JOB DESCRIPTION:',
    job.jd_text,
    '',
    'COVER-LETTER ANGLE:',
    angle,
  ];
  if (user.cover_letter_sample_text?.trim()) {
    lines.push(
      '',
      'WRITING STYLE SAMPLE (match this candidate\'s tone, voice, and level of formality —',
      'do not copy sentences verbatim):',
      user.cover_letter_sample_text.trim(),
    );
  }
  if (requiresWorkAuthorisationStatement(user)) {
    lines.push(
      '',
      'IMPORTANT: The candidate requires Employment Pass (EP) sponsorship to',
      'work in Singapore. Clearly and positively state this work-authorisation',
      'status within the letter.',
    );
  }
  return lines.join('\n');
}

/* ------------------------------------------------------------------ *
 * Deterministic fallbacks (never call Bedrock or S3)
 * ------------------------------------------------------------------ */

/** A minimal, deterministic base cover letter used when generation fails (Req 14.6). */
function baseCoverLetter(job: Job, user: UserConfig): string {
  return [
    `Dear ${job.company} Hiring Team,`,
    '',
    `I am writing to express my strong interest in the ${job.role_title} role at ${job.company}.`,
    `With my background as ${user.profile.current_role}, I believe I can contribute meaningfully to your team.`,
    '',
    'Thank you for your consideration. I would welcome the opportunity to discuss my application further.',
    '',
    'Best regards,',
    user.name,
  ].join('\n');
}

/** Whether a work-authorisation statement must be injected (Req 14.3). */
function requiresWorkAuthorisationStatement(user: UserConfig): boolean {
  return user.residency_status === 'need_sponsorship';
}

/** The deterministic work-authorisation sentence for `need_sponsorship` users. */
function workAuthorisationStatement(): string {
  return (
    'Please note that I currently require Employment Pass (EP) sponsorship to ' +
    'work in Singapore.'
  );
}

/**
 * Guarantee the cover-letter text states the user's work-authorisation status
 * for `need_sponsorship` users (Req 14.3). If the generated text already
 * mentions sponsorship / an Employment Pass / work authorisation, it is left
 * unchanged; otherwise the deterministic statement is appended so the status is
 * always present regardless of what the model returned.
 */
function ensureWorkAuthorisation(text: string, user: UserConfig): string {
  if (!requiresWorkAuthorisationStatement(user)) {
    return text;
  }
  const lower = text.toLowerCase();
  const alreadyStated =
    lower.includes('employment pass') ||
    lower.includes('sponsorship') ||
    lower.includes('work authorisation') ||
    lower.includes('work authorization');
  if (alreadyStated) {
    return text;
  }
  const trimmed = text.replace(/\s+$/, '');
  return `${trimmed}\n\n${workAuthorisationStatement()}`;
}

/* ------------------------------------------------------------------ *
 * Resume + cover-letter generation
 * ------------------------------------------------------------------ */

/** Result of attempting to produce the customised resume. */
interface ResumeOutcome {
  /** The S3 key the application's resume lives at (customised, or base fallback). */
  key: string;
  /** False when the base resume was used as a fallback (Req 14.4, 14.5). */
  applied: boolean;
}

/**
 * Build the customised resume: apply the Master's `resume_instructions` via
 * Bedrock and store the result in S3 (Req 14.1). On a customisation failure
 * (Req 14.4) or an S3 storage failure (Req 14.5), fall back to the user's base
 * resume and record `customisation_applied = false`. Never throws.
 */
async function buildCustomisedResume(
  job: Job,
  decision: MasterDecision,
  user: UserConfig,
  deps: GenerateMaterialsDeps,
): Promise<ResumeOutcome> {
  const baseKey = user.resume_s3_key ?? '';
  const instructions = decision.resume_instructions;

  // No instructions to apply → use the base resume (no customisation).
  if (instructions === undefined || instructions.trim() === '') {
    deps.logger?.info('material_generation.resume_no_instructions', {
      job_id: job.job_id,
      user_id: user.user_id,
    });
    return { key: baseKey, applied: false };
  }

  // 1) Apply the resume instructions via Bedrock (Req 14.1).
  let resumeText: string;
  try {
    resumeText = await invokeWithBoundedRetry<string>({
      invoke: () => deps.bedrock(buildResumePrompt(job, instructions, user)),
      sleep: deps.sleep,
      isRateLimit: deps.isRateLimit,
      maxRetries: deps.maxRetries,
      baseDelayMs: deps.baseDelayMs,
      backoff: deps.backoff,
    });
  } catch (error) {
    // Customisation failed → base-resume fallback (Req 14.4).
    deps.logger?.warn('material_generation.resume_customisation_failed', {
      job_id: job.job_id,
      user_id: user.user_id,
      cause: error,
    });
    return { key: baseKey, applied: false };
  }

  // 2) Store the customised resume in S3 (Req 14.1).
  const key = (deps.resumeKeyFor ?? defaultCustomisedResumeKey)(user, job);
  try {
    await deps.s3.putObject(key, resumeText, {
      contentType: deps.resumeContentType ?? DEFAULT_RESUME_CONTENT_TYPE,
    });
  } catch (error) {
    // S3 storage failed → base-resume fallback (Req 14.5).
    deps.logger?.warn('material_generation.resume_s3_failed', {
      job_id: job.job_id,
      user_id: user.user_id,
      key,
      cause: error,
    });
    return { key: baseKey, applied: false };
  }

  return { key, applied: true };
}

/**
 * Build the cover letter: apply the Master's `cover_letter_angle` via Bedrock
 * (Req 14.2), injecting the user's work-authorisation status for
 * `need_sponsorship` users (Req 14.3). On any generation failure, fall back to
 * a deterministic base cover letter so an editable document is still available
 * for review (Req 14.6). Never throws.
 */
async function buildCoverLetter(
  job: Job,
  decision: MasterDecision,
  user: UserConfig,
  deps: GenerateMaterialsDeps,
): Promise<string> {
  const angle = decision.cover_letter_angle;
  let text: string;

  if (angle === undefined || angle.trim() === '') {
    // No angle to apply → deterministic base cover letter (Req 14.6).
    text = baseCoverLetter(job, user);
  } else {
    try {
      text = await invokeWithBoundedRetry<string>({
        invoke: () => deps.bedrock(buildCoverLetterPrompt(job, angle, user)),
        sleep: deps.sleep,
        isRateLimit: deps.isRateLimit,
        maxRetries: deps.maxRetries,
        baseDelayMs: deps.baseDelayMs,
        backoff: deps.backoff,
      });
    } catch (error) {
      // Generation failed → still produce an available document (Req 14.6).
      deps.logger?.warn('material_generation.cover_letter_failed', {
        job_id: job.job_id,
        user_id: user.user_id,
        cause: error,
      });
      text = baseCoverLetter(job, user);
    }
  }

  // Guarantee the work-authorisation status is present for sponsorship users (Req 14.3).
  return ensureWorkAuthorisation(text, user);
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

/**
 * Generate the application materials for an apply-equivalent decision (Req 14).
 *
 * Produces a {@link Materials} value:
 *  - `resume_s3_key`: the customised resume's S3 key (Req 14.1), or the user's
 *    base resume key when customisation or storage failed (Req 14.4, 14.5).
 *  - `cover_letter_text`: the cover letter built from the Master's angle
 *    (Req 14.2), with the work-authorisation status injected for
 *    `need_sponsorship` users (Req 14.3), or a base cover letter on failure
 *    (Req 14.6).
 *  - `customisation_applied`: `false` whenever a base-resume fallback was used
 *    (Req 14.4, 14.5).
 *
 * This function never throws: every failure degrades to a usable fallback so a
 * `Materials` value is always returned and the application can be queued for
 * user review (Req 14.6).
 *
 * @param job - The job the materials are for.
 * @param decision - The resolved Master decision carrying the resume
 *   instructions and cover-letter angle (Req 12.7).
 * @param user - The user the materials are tailored for.
 * @param deps - Injectable Bedrock + S3 collaborators and tuning knobs.
 */
export async function generateMaterials(
  job: Job,
  decision: MasterDecision,
  user: UserConfig,
  deps: GenerateMaterialsDeps,
): Promise<Materials> {
  const [resume, coverLetterText] = await Promise.all([
    buildCustomisedResume(job, decision, user, deps),
    buildCoverLetter(job, decision, user, deps),
  ]);

  return {
    resume_s3_key: resume.key,
    cover_letter_text: coverLetterText,
    customisation_applied: resume.applied,
  };
}

/**
 * Build a {@link GenerateMaterialsHook} bound to the given Bedrock + S3
 * dependencies, matching the `(job, decision, user) => Promise<Materials>` shape
 * the in-process debate machine (`./debateMachine.ts`) invokes for
 * apply-equivalent decisions. This is the primary wiring entry point for
 * material generation (Req 14).
 */
export function createGenerateMaterials(
  deps: GenerateMaterialsDeps,
): GenerateMaterialsHook {
  return (job, decision, user) => generateMaterials(job, decision, user, deps);
}
