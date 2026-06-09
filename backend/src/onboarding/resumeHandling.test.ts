/**
 * Unit tests for resume handling (Task 11.5).
 *
 * Covers the two acceptance criteria this task targets, using injected fakes
 * (a fake S3 helper and a fake Bedrock text-invoke) so no real AWS calls are
 * made:
 *
 *   Requirement 2.3 — IF an uploaded file is not in PDF format, THEN THE
 *     Onboarding_Service SHALL reject the upload and return a message stating
 *     that only PDF files are accepted.
 *
 *   Requirement 2.4 — IF the Resume_Parser fails to extract a structured
 *     profile, THEN THE Onboarding_Service SHALL notify the User that parsing
 *     failed and SHALL allow the User to enter profile fields manually. The
 *     parser signals this by resolving to a `ParseFailure` (rather than
 *     throwing) so the caller can offer manual entry.
 *
 * These are example/edge-case unit tests that complement the property-based
 * tests elsewhere in the suite.
 */
import { describe, it, expect, vi } from 'vitest';
import { ParseFailure, RejectError, type PdfFile } from '@worksignal/shared';
import {
  uploadResume,
  isPdfUpload,
  PDF_ONLY_MESSAGE,
  RESUME_KEY_PREFIX,
  type ResumeUploadS3,
} from './resumeUpload.js';
import {
  createResumeParser,
  validateParsedProfile,
  type ResumePdfReader,
} from './resumeParser.js';

/* ------------------------------------------------------------------ *
 * Test fakes
 * ------------------------------------------------------------------ */

/** The `%PDF` magic-byte signature prefix shared by all conforming PDFs. */
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46];

/** Build a PdfFile whose bytes begin with the `%PDF` signature. */
function pdfFile(overrides: Partial<PdfFile> = {}): PdfFile {
  return {
    filename: 'resume.pdf',
    contentType: 'application/pdf',
    bytes: new Uint8Array([...PDF_MAGIC, 0x2d, 0x31, 0x2e, 0x37]), // %PDF-1.7
    ...overrides,
  };
}

/** A recording fake of the minimal S3 surface `uploadResume` needs. */
function fakeUploadS3(): ResumeUploadS3 & {
  calls: { key: string; body: Buffer; contentType?: string }[];
} {
  const calls: { key: string; body: Buffer; contentType?: string }[] = [];
  return {
    calls,
    async putObject(key, body, options) {
      calls.push({
        key,
        body: Buffer.from(body),
        ...(options?.contentType ? { contentType: options.contentType } : {}),
      });
    },
  };
}

/** A fake S3 reader for the parser that returns fixed bytes for any key. */
function fakeReader(bytes: Uint8Array | Buffer = Buffer.from('%PDF-1.7 fake')): ResumePdfReader {
  return {
    async getObject() {
      return bytes;
    },
  };
}

/* ------------------------------------------------------------------ *
 * Requirement 2.3 — non-PDF rejection / PDF acceptance (upload side)
 * ------------------------------------------------------------------ */

describe('uploadResume — PDF validation and storage (Req 2.1, 2.3)', () => {
  it('stores a valid %PDF upload and returns its S3 key', async () => {
    const s3 = fakeUploadS3();
    const file = pdfFile();

    const result = await uploadResume({ s3 }, 'user-1', file);

    expect(result.s3Key).toMatch(new RegExp(`^${RESUME_KEY_PREFIX}/user-1/.*\\.pdf$`));
    // The bytes were written exactly once, with the PDF content type.
    expect(s3.calls).toHaveLength(1);
    expect(s3.calls[0]?.key).toBe(result.s3Key);
    expect(Array.from(s3.calls[0]!.body.subarray(0, 4))).toEqual(PDF_MAGIC);
    expect(s3.calls[0]?.contentType).toBe('application/pdf');
  });

  it('uses an injected key generator when provided', async () => {
    const s3 = fakeUploadS3();
    const result = await uploadResume(
      { s3, generateKey: () => 'resumes/custom/key.pdf' },
      'user-1',
      pdfFile(),
    );
    expect(result.s3Key).toBe('resumes/custom/key.pdf');
    expect(s3.calls[0]?.key).toBe('resumes/custom/key.pdf');
  });

  it('rejects an upload with a non-PDF content type with the PDF-only message', async () => {
    const s3 = fakeUploadS3();
    // Magic bytes look like a PDF but the declared content type contradicts it.
    const file = pdfFile({ contentType: 'image/png', filename: 'resume.png' });

    await expect(uploadResume({ s3 }, 'user-1', file)).rejects.toThrowError(
      RejectError,
    );
    await expect(uploadResume({ s3 }, 'user-1', file)).rejects.toThrowError(
      PDF_ONLY_MESSAGE,
    );
    // Nothing is stored on rejection.
    expect(s3.calls).toHaveLength(0);
  });

  it('rejects an upload missing the %PDF magic bytes even with a PDF content type', async () => {
    const s3 = fakeUploadS3();
    const file = pdfFile({ bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) }); // PNG header

    await expect(uploadResume({ s3 }, 'user-1', file)).rejects.toThrowError(
      RejectError,
    );
    expect(s3.calls).toHaveLength(0);
  });

  it('carries rejection context (filename, contentType) in the RejectError', async () => {
    const s3 = fakeUploadS3();
    const file = pdfFile({ contentType: 'text/plain', filename: 'cv.txt' });

    try {
      await uploadResume({ s3 }, 'user-1', file);
      expect.unreachable('expected uploadResume to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(RejectError);
      const reject = error as RejectError;
      expect(reject.code).toBe('REJECT');
      expect(reject.message).toBe(PDF_ONLY_MESSAGE);
      expect(reject.details).toMatchObject({
        filename: 'cv.txt',
        contentType: 'text/plain',
      });
    }
  });

  it('isPdfUpload accepts real PDF bytes and rejects non-PDF inputs', () => {
    expect(isPdfUpload(pdfFile())).toBe(true);
    // Empty content type is permitted when the magic bytes are present.
    expect(isPdfUpload(pdfFile({ contentType: '' }))).toBe(true);
    expect(isPdfUpload(pdfFile({ contentType: 'application/octet-stream' }))).toBe(
      false,
    );
    expect(isPdfUpload(pdfFile({ bytes: new Uint8Array([0x00, 0x01]) }))).toBe(
      false,
    );
  });
});

/* ------------------------------------------------------------------ *
 * Requirement 2.4 — parse-failure manual-entry fallback (parser side)
 * ------------------------------------------------------------------ */

describe('ResumeParser — parse and parse-failure fallback (Req 2.2, 2.4)', () => {
  const validProfileJson = JSON.stringify({
    current_role: 'Software Engineer',
    years_experience: 3,
    skills: ['TypeScript', 'AWS'],
    education: 'BSc Computer Science',
    university: 'NUS',
  });

  it('returns a ParsedProfile when Bedrock yields valid JSON', async () => {
    const parser = createResumeParser({
      s3: fakeReader(),
      bedrockInvoke: async () => validProfileJson,
      sleep: async () => {},
    });

    const result = await parser.parse('resumes/user-1/abc.pdf');

    expect(result).not.toBeInstanceOf(ParseFailure);
    expect(result).toEqual({
      current_role: 'Software Engineer',
      years_experience: 3,
      skills: ['TypeScript', 'AWS'],
      education: 'BSc Computer Science',
      university: 'NUS',
    });
  });

  it('unwraps a markdown-fenced JSON response', async () => {
    const parser = createResumeParser({
      s3: fakeReader(),
      bedrockInvoke: async () => '```json\n' + validProfileJson + '\n```',
      sleep: async () => {},
    });

    const result = await parser.parse('k');
    expect(result).not.toBeInstanceOf(ParseFailure);
  });

  it('returns ParseFailure (not a throw) when Bedrock returns non-JSON', async () => {
    const parser = createResumeParser({
      s3: fakeReader(),
      bedrockInvoke: async () => 'Sorry, I could not read that resume.',
      sleep: async () => {},
    });

    const result = await parser.parse('k');
    expect(result).toBeInstanceOf(ParseFailure);
    expect((result as ParseFailure).code).toBe('PARSE_FAILURE');
  });

  it('returns ParseFailure when the JSON is missing required fields', async () => {
    const parser = createResumeParser({
      s3: fakeReader(),
      // Missing `university` and `education`.
      bedrockInvoke: async () =>
        JSON.stringify({ current_role: 'Dev', years_experience: 2, skills: [] }),
      sleep: async () => {},
    });

    const result = await parser.parse('k');
    expect(result).toBeInstanceOf(ParseFailure);
  });

  it('returns ParseFailure when a field has the wrong type', async () => {
    const parser = createResumeParser({
      s3: fakeReader(),
      // years_experience as a string instead of a number.
      bedrockInvoke: async () =>
        JSON.stringify({
          current_role: 'Dev',
          years_experience: 'three',
          skills: ['x'],
          education: 'BSc',
          university: 'NUS',
        }),
      sleep: async () => {},
    });

    const result = await parser.parse('k');
    expect(result).toBeInstanceOf(ParseFailure);
  });

  it('returns ParseFailure when reading the PDF from S3 fails', async () => {
    const failingReader: ResumePdfReader = {
      async getObject() {
        throw new Error('S3 unavailable');
      },
    };
    const bedrockInvoke = vi.fn(async () => validProfileJson);

    const parser = createResumeParser({
      s3: failingReader,
      bedrockInvoke,
      sleep: async () => {},
    });

    const result = await parser.parse('k');
    expect(result).toBeInstanceOf(ParseFailure);
    expect((result as ParseFailure).message).toMatch(/read resume pdf/i);
    // Bedrock is never called when the S3 read fails.
    expect(bedrockInvoke).not.toHaveBeenCalled();
  });

  it('returns ParseFailure when the Bedrock call errors (non-rate-limit)', async () => {
    const bedrockInvoke = vi.fn(async (): Promise<string> => {
      throw new Error('model invocation error');
    });
    const parser = createResumeParser({
      s3: fakeReader(),
      bedrockInvoke,
      sleep: async () => {},
    });

    const result = await parser.parse('k');
    expect(result).toBeInstanceOf(ParseFailure);
    expect((result as ParseFailure).message).toMatch(/bedrock/i);
    // Non-rate-limit errors are not retried: exactly one call.
    expect(bedrockInvoke).toHaveBeenCalledTimes(1);
  });

  it('surfaces ParseFailure after exhausting bounded retries on persistent rate limits', async () => {
    const rateLimit = { name: 'ThrottlingException', $metadata: { httpStatusCode: 429 } };
    const bedrockInvoke = vi.fn(async (): Promise<string> => {
      throw rateLimit;
    });
    const parser = createResumeParser({
      s3: fakeReader(),
      bedrockInvoke,
      sleep: async () => {},
    });

    const result = await parser.parse('k');
    expect(result).toBeInstanceOf(ParseFailure);
    // Initial attempt + 3 bounded retries = 4 underlying calls.
    expect(bedrockInvoke).toHaveBeenCalledTimes(4);
  });
});

/* ------------------------------------------------------------------ *
 * validateParsedProfile — direct unit coverage
 * ------------------------------------------------------------------ */

describe('validateParsedProfile', () => {
  const valid = {
    current_role: 'Engineer',
    years_experience: 0,
    skills: [],
    education: 'BSc',
    university: 'NUS',
  };

  it('accepts a well-formed profile (including zero experience / empty skills)', () => {
    expect(validateParsedProfile(valid)).toEqual(valid);
  });

  it('rejects non-object inputs', () => {
    expect(validateParsedProfile(null)).toBeNull();
    expect(validateParsedProfile('x')).toBeNull();
    expect(validateParsedProfile([valid])).toBeNull();
  });

  it('rejects negative or non-finite years_experience', () => {
    expect(validateParsedProfile({ ...valid, years_experience: -1 })).toBeNull();
    expect(
      validateParsedProfile({ ...valid, years_experience: Number.NaN }),
    ).toBeNull();
    expect(
      validateParsedProfile({ ...valid, years_experience: Number.POSITIVE_INFINITY }),
    ).toBeNull();
  });

  it('rejects a skills array containing non-strings', () => {
    expect(validateParsedProfile({ ...valid, skills: ['ok', 3] })).toBeNull();
  });
});
