import type { JobDetailData } from '../components/jobDetailTypes';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

/**
 * Normalise API responses into the JobDetailData shape expected by the UI.
 * Tolerates legacy demo field names (`debate`, `masterDecision`, `coverLetterText`).
 */
export function normalizeJobDetail(body: unknown): JobDetailData | null {
  if (!isRecord(body) || !isRecord(body.job)) return null;

  const verdicts =
    body.verdicts ?? body.debate ?? {};
  const decision = body.decision ?? body.masterDecision;
  const coverLetter =
    (typeof body.coverLetter === 'string' && body.coverLetter) ||
    (typeof body.coverLetterText === 'string' && body.coverLetterText) ||
    (isRecord(body.materials) &&
    typeof body.materials.cover_letter_text === 'string'
      ? body.materials.cover_letter_text
      : '');

  const materials =
    isRecord(body.materials) && typeof body.materials.resume_s3_key === 'string'
      ? body.materials
      : {
          resume_s3_key: 'demo/resume.pdf',
          cover_letter_text: coverLetter,
          customisation_applied: true,
        };

  if (!decision || !isRecord(decision)) return null;

  return {
    job: body.job as JobDetailData['job'],
    verdicts: verdicts as JobDetailData['verdicts'],
    decision: decision as JobDetailData['decision'],
    materials: materials as JobDetailData['materials'],
    coverLetter,
  };
}
