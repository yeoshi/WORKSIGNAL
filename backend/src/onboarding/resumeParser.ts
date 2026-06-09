/**
 * Resume_Parser — Bedrock-backed structured-profile extraction (Req 2.2, 2.4).
 *
 * Implements the `ResumeParser` contract from `@worksignal/shared`:
 *
 *   parse(s3Key): Promise<ParsedProfile | ParseFailure>
 *
 * Behaviour (design.md — Resume_Parser):
 *   "Reads the PDF from S3, calls Bedrock with an extraction prompt, and
 *    validates the returned JSON. On failure it returns `ParseFailure` so the
 *    Onboarding_Service can prompt the user for manual entry (2.4)."
 *
 * The parser extracts the five `ParsedProfile` fields — `current_role`,
 * `years_experience`, `skills[]`, `education`, and `university` — from the
 * stored PDF. Any failure along the way (S3 read error, Bedrock error,
 * non-JSON output, JSON missing/ill-typed fields) resolves to a
 * {@link ParseFailure} rather than throwing, so the calling Onboarding_Service
 * can fall back to manual entry (Req 2.4).
 *
 * Testability: both the S3 read and the Bedrock invocation are injected, so the
 * parser can be exercised deterministically with no real AWS calls. The Bedrock
 * call is routed through the bounded-retry wrapper (`invokeWithBoundedRetry`,
 * Req 22.1) so rate-limit responses are retried a bounded number of times; a
 * persistent failure surfaces as a `ParseFailure`.
 */

import { ParseFailure, type ParsedProfile, type ResumeParser } from '@worksignal/shared';
import {
  invokeWithBoundedRetry,
  type RateLimitPredicate,
  type SleepFn,
} from '../bedrock/invoke.js';

/**
 * Minimal structural reader the parser needs from S3 — fetch an object's bytes
 * by key. Satisfied by `S3Helper` from `@worksignal/shared` (whose `getObject`
 * accepts an optional second `bucket` argument), and trivially faked in tests.
 */
export interface ResumePdfReader {
  getObject(key: string): Promise<Buffer | Uint8Array>;
}

/**
 * Performs a single Bedrock model call for the given prompt and resolves with
 * the model's raw text response. Injected so tests need no AWS SDK; production
 * wiring supplies a function backed by the Bedrock runtime client. Rate-limit
 * retries are handled by the parser via {@link invokeWithBoundedRetry}, so this
 * function should perform exactly one underlying call per invocation.
 */
export type BedrockTextInvoke = (prompt: string) => Promise<string>;

/** Construction dependencies for {@link ResumeParserImpl}. */
export interface ResumeParserDeps {
  /** Reads the uploaded PDF bytes from the private resumes bucket. */
  s3: ResumePdfReader;
  /** Performs the Bedrock extraction call and returns raw model text. */
  bedrockInvoke: BedrockTextInvoke;
  /**
   * Optional rate-limit predicate forwarded to the bounded-retry wrapper.
   * Defaults to the wrapper's built-in Bedrock throttling detector.
   */
  isRateLimit?: RateLimitPredicate;
  /** Optional sleep function (injected in tests to avoid real timers). */
  sleep?: SleepFn;
}

/**
 * Extraction prompt template. The model is instructed to return *only* a strict
 * JSON object with the five required fields, which the parser then validates.
 * The PDF bytes are supplied base64-encoded so the entire payload is a single
 * text prompt compatible with the injectable {@link BedrockTextInvoke}.
 */
function buildExtractionPrompt(pdfBase64: string): string {
  return [
    'You are a resume parser. Extract a structured profile from the resume PDF',
    'provided below (base64-encoded application/pdf).',
    '',
    'Return ONLY a single JSON object — no prose, no markdown — with exactly',
    'these keys:',
    '  - "current_role": string (most recent / current job title)',
    '  - "years_experience": number (total years of professional experience)',
    '  - "skills": array of strings',
    '  - "education": string (highest qualification)',
    '  - "university": string (institution name)',
    '',
    'If a field is unknown, use an empty string for string fields, 0 for',
    'years_experience, and an empty array for skills.',
    '',
    'Resume PDF (base64):',
    pdfBase64,
  ].join('\n');
}

/**
 * Strip an optional Markdown code fence (```json ... ```), returning the inner
 * payload. Bedrock models often wrap JSON in fences despite instructions.
 */
function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fence && fence[1] !== undefined ? fence[1].trim() : trimmed;
}

/**
 * Validate and normalise a raw parsed JSON value into a {@link ParsedProfile}.
 * Returns `null` when the value is not an object or any required field is
 * missing or of the wrong type. Exported for unit testing (task 11.5).
 *
 * Field rules:
 *  - `current_role`, `education`, `university`: must be strings.
 *  - `years_experience`: must be a finite, non-negative number.
 *  - `skills`: must be an array of strings.
 */
export function validateParsedProfile(raw: unknown): ParsedProfile | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return null;
  }
  const obj = raw as Record<string, unknown>;

  const { current_role, years_experience, skills, education, university } = obj;

  if (typeof current_role !== 'string') return null;
  if (typeof education !== 'string') return null;
  if (typeof university !== 'string') return null;

  if (
    typeof years_experience !== 'number' ||
    !Number.isFinite(years_experience) ||
    years_experience < 0
  ) {
    return null;
  }

  if (!Array.isArray(skills) || !skills.every((s) => typeof s === 'string')) {
    return null;
  }

  return {
    current_role,
    years_experience,
    skills: skills as string[],
    education,
    university,
  };
}

/**
 * Concrete Resume_Parser. Reads the PDF from S3, calls Bedrock with an
 * extraction prompt (via the bounded-retry wrapper), validates the returned
 * JSON, and resolves to a {@link ParsedProfile} or a {@link ParseFailure}.
 */
export class ResumeParserImpl implements ResumeParser {
  private readonly s3: ResumePdfReader;
  private readonly bedrockInvoke: BedrockTextInvoke;
  private readonly isRateLimit?: RateLimitPredicate;
  private readonly sleep?: SleepFn;

  constructor(deps: ResumeParserDeps) {
    this.s3 = deps.s3;
    this.bedrockInvoke = deps.bedrockInvoke;
    this.isRateLimit = deps.isRateLimit;
    this.sleep = deps.sleep;
  }

  async parse(s3Key: string): Promise<ParsedProfile | ParseFailure> {
    // 1) Read the PDF bytes from S3.
    let pdfBase64: string;
    try {
      const bytes = await this.s3.getObject(s3Key);
      pdfBase64 = Buffer.from(bytes).toString('base64');
    } catch (error) {
      return new ParseFailure('Failed to read resume PDF from S3', {
        s3Key,
        cause: error,
      });
    }

    // 2) Call Bedrock for extraction, retrying bounded times on rate limits.
    let rawText: string;
    try {
      rawText = await invokeWithBoundedRetry<string>({
        invoke: () => this.bedrockInvoke(buildExtractionPrompt(pdfBase64)),
        ...(this.isRateLimit ? { isRateLimit: this.isRateLimit } : {}),
        ...(this.sleep ? { sleep: this.sleep } : {}),
      });
    } catch (error) {
      return new ParseFailure('Bedrock resume extraction failed', {
        s3Key,
        cause: error,
      });
    }

    // 3) Parse the model output as JSON.
    let parsed: unknown;
    try {
      parsed = JSON.parse(stripCodeFence(rawText));
    } catch (error) {
      return new ParseFailure('Bedrock returned non-JSON resume output', {
        s3Key,
        rawText,
        cause: error,
      });
    }

    // 4) Validate the JSON has all required, well-typed fields.
    const profile = validateParsedProfile(parsed);
    if (profile === null) {
      return new ParseFailure('Parsed resume profile failed schema validation', {
        s3Key,
        parsed,
      });
    }

    return profile;
  }
}

/** Convenience factory mirroring the {@link ResumeParserImpl} constructor. */
export function createResumeParser(deps: ResumeParserDeps): ResumeParserImpl {
  return new ResumeParserImpl(deps);
}
