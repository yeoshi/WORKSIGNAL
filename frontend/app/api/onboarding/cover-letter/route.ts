/**
 * POST /api/onboarding/cover-letter — Optional cover letter sample upload.
 */

import { NextRequest } from 'next/server';
import { S3Helper } from '@worksignal/shared';
import { getAuthenticatedUser, unauthorizedResponse } from '../../lib/auth';
import { extractPdfText } from '../../lib/extractPdfText';
import { createOnboardingServiceForRequest } from '../../lib/onboardingPersistence';
import {
  clearLocalUserFields,
  isLocalOnboardingEnabled,
  putLocalUser,
} from '../../lib/localOnboardingStore';
import { uploadResume } from '../../lib/resumeUpload';
import { getAwsRegion } from '../../lib/awsRegion';

const LOCAL_COVER_LETTER_PREFIX = 'local/cover-letters';
const MAX_SAMPLE_CHARS = 8_000;

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  try {
    const formData = await request.formData();
    const file = formData.get('cover_letter');

    if (!file || !(file instanceof File)) {
      return Response.json(
        { error: 'Bad Request', message: 'A cover letter file is required.' },
        { status: 400 },
      );
    }

    if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
      return Response.json(
        { error: 'Bad Request', message: 'Only PDF files are accepted.' },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let sampleText = '';
    try {
      sampleText = (await extractPdfText(buffer)).slice(0, MAX_SAMPLE_CHARS);
    } catch {
      return Response.json(
        { error: 'Bad Request', message: 'Could not read that PDF. Try another file.' },
        { status: 400 },
      );
    }

    if (!sampleText.trim()) {
      return Response.json(
        { error: 'Bad Request', message: 'That PDF appears to be empty.' },
        { status: 400 },
      );
    }

    if (isLocalOnboardingEnabled()) {
      const s3Key = `${LOCAL_COVER_LETTER_PREFIX}/${user.userId}/${file.name}`;
      putLocalUser(user.userId, {
        cover_letter_sample_s3_key: s3Key,
        cover_letter_sample_text: sampleText,
      });

      return Response.json({ ok: true, s3Key, sampleText });
    }

    const s3 = new S3Helper({
      bucket: process.env.WORKSIGNAL_S3_BUCKET ?? 'worksignal-documents',
      region: getAwsRegion(),
    });

    const result = await uploadResume(
      {
        s3,
        generateKey: (userId, pdf) => `cover-letters/${userId}/${pdf.filename}`,
      },
      user.userId,
      { bytes: new Uint8Array(buffer), filename: file.name, contentType: 'application/pdf' },
    );

    const service = await createOnboardingServiceForRequest();
    if ('setCoverLetterSample' in service) {
      await service.setCoverLetterSample(user.userId, result.s3Key, sampleText);
    }

    return Response.json({ ok: true, s3Key: result.s3Key, sampleText });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    const friendly = message.includes('security token') || message.includes('bucket')
      ? 'Cloud storage is unavailable. Set LOCAL_DEV=true in .env.local for local development.'
      : message;
    return Response.json({ error: 'Error', message: friendly }, { status: 500 });
  }
}

export async function DELETE() {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  if (isLocalOnboardingEnabled()) {
    clearLocalUserFields(user.userId, [
      'cover_letter_sample_s3_key',
      'cover_letter_sample_text',
    ]);
    return Response.json({ ok: true });
  }

  return Response.json(
    {
      error: 'Not Implemented',
      message: 'Cover letter removal is not available in this environment.',
    },
    { status: 501 },
  );
}
