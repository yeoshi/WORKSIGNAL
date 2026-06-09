/**
 * Resume upload — PDF validation and private-S3 storage (Task 11.3).
 *
 * Implements the storage side of the Onboarding_Service `uploadResume`
 * contract (design "Onboarding_Service", Requirements 2.1 and 2.3):
 *
 *   2.1  WHEN a User uploads a resume file in PDF format, THE Onboarding_Service
 *        SHALL store the file in a private S3 bucket and record the S3 key in
 *        the User record.
 *   2.3  IF an uploaded file is not in PDF format, THEN THE Onboarding_Service
 *        SHALL reject the upload and return a message stating that only PDF
 *        files are accepted.
 *
 * The upload is validated as a PDF by **both** the declared content type and
 * the file's leading magic bytes (`%PDF`). The magic-byte check is the
 * authoritative signal — a file is only stored when its bytes actually begin
 * with the PDF signature — while a contradicting content type (e.g. an image
 * type) is also grounds for rejection. Anything that fails either check is
 * rejected with a {@link RejectError} carrying the "only PDF files are
 * accepted" message (2.3).
 *
 * On a valid PDF the bytes are written under the `resumes/` prefix of the
 * private bucket and the resulting S3 key is returned (2.1). The
 * {@link S3Helper} dependency is injected so this module is unit-testable
 * without touching AWS (Task 11.5).
 *
 * NOTE: recording the S3 key in the Users record is handled by the
 * Onboarding_Service persistence wiring (Task 11.6); this module returns the
 * key for that caller to persist.
 */

import { randomUUID } from 'node:crypto';
import { RejectError, type PdfFile, type S3Helper } from '@worksignal/shared';

/** S3 key prefix under which all resumes are stored in the private bucket. */
export const RESUME_KEY_PREFIX = 'resumes';

/** User-facing rejection message for non-PDF uploads (Requirement 2.3). */
export const PDF_ONLY_MESSAGE = 'Only PDF files are accepted.';

/** The canonical PDF content type. */
const PDF_CONTENT_TYPE = 'application/pdf';

/**
 * The PDF magic-byte signature: the ASCII characters `%PDF` (`0x25 0x50 0x44
 * 0x46`) that begin every conforming PDF document.
 */
const PDF_MAGIC_BYTES = [0x25, 0x50, 0x44, 0x46] as const;

/**
 * The subset of {@link S3Helper} this module needs. Declaring the dependency
 * structurally keeps the function injectable: tests can pass a lightweight
 * fake exposing only `putObject`.
 */
export type ResumeUploadS3 = Pick<S3Helper, 'putObject'>;

/** Generates the S3 key a resume is stored under (injectable for tests). */
export type ResumeKeyGenerator = (userId: string, file: PdfFile) => string;

/** Dependencies for {@link uploadResume}. */
export interface ResumeUploadDeps {
  /** Pre-configured S3 helper bound to the private resumes bucket. */
  s3: ResumeUploadS3;
  /**
   * Optional override for the stored S3 key. Defaults to
   * {@link defaultResumeKey} (`resumes/<userId>/<uuid>.pdf`).
   */
  generateKey?: ResumeKeyGenerator;
}

/** Normalise a content type for comparison (lower-case, strip parameters). */
function normaliseContentType(contentType: string | undefined): string {
  if (!contentType) {
    return '';
  }
  // Drop any `; charset=...` style parameters and surrounding whitespace.
  return contentType.split(';')[0]?.trim().toLowerCase() ?? '';
}

/** Whether a declared content type is the PDF type. */
function isPdfContentType(contentType: string | undefined): boolean {
  return normaliseContentType(contentType) === PDF_CONTENT_TYPE;
}

/** Whether the byte sequence begins with the `%PDF` magic signature. */
function hasPdfMagicBytes(bytes: Uint8Array | undefined): boolean {
  if (!bytes || bytes.length < PDF_MAGIC_BYTES.length) {
    return false;
  }
  for (let i = 0; i < PDF_MAGIC_BYTES.length; i += 1) {
    if (bytes[i] !== PDF_MAGIC_BYTES[i]) {
      return false;
    }
  }
  return true;
}

/**
 * Determine whether an uploaded file is a valid PDF.
 *
 * A file is a PDF iff its bytes begin with the `%PDF` magic signature AND its
 * declared content type does not contradict that (an explicitly non-PDF
 * content type is rejected; an absent/empty content type is permitted when the
 * magic bytes are present).
 */
export function isPdfUpload(file: PdfFile): boolean {
  if (!hasPdfMagicBytes(file.bytes)) {
    return false;
  }
  // A present content type must be the PDF type; absent is acceptable.
  if (file.contentType && !isPdfContentType(file.contentType)) {
    return false;
  }
  return true;
}

/** Default key generator: `resumes/<userId>/<uuid>.pdf`. */
export function defaultResumeKey(userId: string): string {
  return `${RESUME_KEY_PREFIX}/${userId}/${randomUUID()}.pdf`;
}

/**
 * Validate and store an uploaded resume.
 *
 * @throws {@link RejectError} when the upload is not a PDF (Requirement 2.3).
 * @returns The S3 key the resume was stored under (Requirement 2.1). The
 *          caller (Onboarding_Service) records this key in the User record.
 */
export async function uploadResume(
  deps: ResumeUploadDeps,
  userId: string,
  file: PdfFile,
): Promise<{ s3Key: string }> {
  if (!isPdfUpload(file)) {
    throw new RejectError(PDF_ONLY_MESSAGE, {
      filename: file.filename,
      contentType: file.contentType,
    });
  }

  const s3Key = (deps.generateKey ?? ((uid) => defaultResumeKey(uid)))(
    userId,
    file,
  );

  await deps.s3.putObject(s3Key, Buffer.from(file.bytes), {
    contentType: PDF_CONTENT_TYPE,
  });

  return { s3Key };
}
