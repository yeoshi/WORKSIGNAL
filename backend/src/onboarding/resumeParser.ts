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

import {
  ParseFailure,
  type EducationEntry,
  type HonorAwardEntry,
  type LanguageProficiency,
  type LanguageSkillEntry,
  type ParsedProfile,
  type ProjectEntry,
  type ResumeBasicInfo,
  type ResumeParser,
  type SnsLinkEntry,
  type SnsPlatform,
  type WorkExperienceEntry,
  type WorkSampleEntry,
} from '@worksignal/shared';
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
    'Return ONLY a single JSON object — no prose, no markdown — with these keys:',
    '  - "current_role": string (most recent / current job title)',
    '  - "years_experience": number (total years of professional experience)',
    '  - "skills": array of strings',
    '  - "education": string (highest qualification)',
    '  - "university": string (institution name)',
    '  - "basic_info": { "full_name", "mobile", "email", "preferred_location" }',
    '  - "education_history": [{ "school", "faculty", "degree", "field_of_study", "start", "end" }]',
    '  - "work_experience": [{ "company", "title", "start", "end", "description" }]',
    '  - "internships": [{ "company", "title", "start", "end", "description" }]',
    '  - "projects": [{ "project_name", "title", "start", "end", "url", "description" }]',
    '  - "work_samples": [{ "url", "description" }]',
    '  - "honors_awards": [{ "title", "date", "description" }]',
    '  - "languages": [{ "language", "proficiency" }]',
    '  - "self_introduction": string',
    '  - "sns_links": [{ "platform", "url" }] where platform is linkedin|github|portfolio|twitter|other',
    '',
    'Use YYYY-MM for dates, "Present" for ongoing roles, and set preferred_location to',
    '"Singapore" when the resume is Singapore-based. Route internship titles to',
    '"internships". If a field is unknown, use empty strings, 0, or empty arrays.',
    '',
    'Resumes use varied layouts. Recognise all of these work-entry formats:',
    '  - Pipe: "Company | Title Month YYYY - Present"',
    '  - Comma: "Title, Company, LocationMonth YYYY - Present" (location may be glued to the date)',
    '  - Block: title on line 1, company on line 2, "Month YYYY - Present" on line 3',
    '  - At-company: "Month YYYY - Month YYYY Title at Company"',
    '  - Title-of: "CoFounder | Founding Engineer of CallBridge July YYYY - Present"',
    'Section headings may differ (EXPERIENCE, WORK EXPERIENCE, KEY SKILLS, PROFILE).',
    'Names may be ALL CAPS; phones may use "HP:" or 8-digit Singapore numbers.',
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

function isStringRecord(
  value: unknown,
  keys: string[],
): value is Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return keys.every((key) => typeof record[key] === 'string');
}

function parseBasicInfo(value: unknown): ResumeBasicInfo | undefined {
  if (
    !isStringRecord(value, ['full_name', 'mobile', 'email', 'preferred_location'])
  ) {
    return undefined;
  }
  return value;
}

function parseWorkEntries(value: unknown): WorkExperienceEntry[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const entries: WorkExperienceEntry[] = [];
  for (const item of value) {
    if (!isStringRecord(item, ['company', 'title', 'start', 'end', 'description'])) {
      return undefined;
    }
    entries.push(item);
  }
  return entries;
}

function parseEducationHistory(value: unknown): EducationEntry[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const entries: EducationEntry[] = [];
  for (const item of value) {
    if (
      !isStringRecord(item, [
        'school',
        'faculty',
        'degree',
        'field_of_study',
        'start',
        'end',
      ])
    ) {
      return undefined;
    }
    entries.push(item);
  }
  return entries;
}

function parseProjects(value: unknown): ProjectEntry[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const entries: ProjectEntry[] = [];
  for (const item of value) {
    if (
      !isStringRecord(item, [
        'project_name',
        'title',
        'start',
        'end',
        'url',
        'description',
      ])
    ) {
      return undefined;
    }
    entries.push(item);
  }
  return entries;
}

function parseWorkSamples(value: unknown): WorkSampleEntry[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const entries: WorkSampleEntry[] = [];
  for (const item of value) {
    if (!isStringRecord(item, ['url', 'description'])) return undefined;
    entries.push(item);
  }
  return entries;
}

function parseHonors(value: unknown): HonorAwardEntry[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const entries: HonorAwardEntry[] = [];
  for (const item of value) {
    if (!isStringRecord(item, ['title', 'date', 'description'])) return undefined;
    entries.push(item);
  }
  return entries;
}

const LANGUAGE_PROFICIENCIES = new Set<LanguageProficiency>([
  'native_or_bilingual',
  'professional_working',
  'limited_working',
  'elementary',
]);

function parseLanguages(value: unknown): LanguageSkillEntry[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const entries: LanguageSkillEntry[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      return undefined;
    }
    const record = item as Record<string, unknown>;
    if (typeof record.language !== 'string') return undefined;
    if (!LANGUAGE_PROFICIENCIES.has(record.proficiency as LanguageProficiency)) {
      return undefined;
    }
    entries.push({
      language: record.language,
      proficiency: record.proficiency as LanguageProficiency,
    });
  }
  return entries;
}

const SNS_PLATFORMS = new Set<SnsPlatform>([
  'linkedin',
  'github',
  'portfolio',
  'twitter',
  'other',
]);

function parseSnsLinks(value: unknown): SnsLinkEntry[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const entries: SnsLinkEntry[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      return undefined;
    }
    const record = item as Record<string, unknown>;
    if (typeof record.url !== 'string') return undefined;
    if (!SNS_PLATFORMS.has(record.platform as SnsPlatform)) return undefined;
    entries.push({
      platform: record.platform as SnsPlatform,
      url: record.url,
    });
  }
  return entries;
}

/**
 * Validate and normalise a raw parsed JSON value into a {@link ParsedProfile}.
 * Returns `null` when the value is not an object or any required field is
 * missing or of the wrong type. Exported for unit testing (task 11.5).
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

  const basicInfo = parseBasicInfo(obj.basic_info);
  if (obj.basic_info !== undefined && basicInfo === undefined) return null;

  const educationHistory = parseEducationHistory(obj.education_history);
  if (obj.education_history !== undefined && educationHistory === undefined) {
    return null;
  }

  const workExperience = parseWorkEntries(obj.work_experience);
  if (obj.work_experience !== undefined && workExperience === undefined) {
    return null;
  }

  const internships = parseWorkEntries(obj.internships);
  if (obj.internships !== undefined && internships === undefined) return null;

  const projects = parseProjects(obj.projects);
  if (obj.projects !== undefined && projects === undefined) return null;

  const workSamples = parseWorkSamples(obj.work_samples);
  if (obj.work_samples !== undefined && workSamples === undefined) return null;

  const honorsAwards = parseHonors(obj.honors_awards);
  if (obj.honors_awards !== undefined && honorsAwards === undefined) return null;

  const languages = parseLanguages(obj.languages);
  if (obj.languages !== undefined && languages === undefined) return null;

  const snsLinks = parseSnsLinks(obj.sns_links);
  if (obj.sns_links !== undefined && snsLinks === undefined) return null;

  if (obj.self_introduction !== undefined && typeof obj.self_introduction !== 'string') {
    return null;
  }

  return {
    current_role,
    years_experience,
    skills: skills as string[],
    education,
    university,
    ...(basicInfo ? { basic_info: basicInfo } : {}),
    ...(educationHistory ? { education_history: educationHistory } : {}),
    ...(workExperience ? { work_experience: workExperience } : {}),
    ...(internships ? { internships } : {}),
    ...(projects ? { projects } : {}),
    ...(workSamples ? { work_samples: workSamples } : {}),
    ...(honorsAwards ? { honors_awards: honorsAwards } : {}),
    ...(languages ? { languages } : {}),
    ...(typeof obj.self_introduction === 'string'
      ? { self_introduction: obj.self_introduction }
      : {}),
    ...(snsLinks ? { sns_links: snsLinks } : {}),
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
