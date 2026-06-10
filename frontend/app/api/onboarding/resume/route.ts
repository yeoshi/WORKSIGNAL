/**
 * POST /api/onboarding/resume — Upload resume PDF (Req 2.1, 2.3).
 */

import { NextRequest } from 'next/server';
import type { ParsedProfile } from '@worksignal/shared';
import { getAuthenticatedUser, unauthorizedResponse } from '../../lib/auth';
import {
  clearLocalUserFields,
  isLocalOnboardingEnabled,
  putLocalUser,
} from '../../lib/localOnboardingStore';
import { parseResumePdfLocally } from '../../lib/localResumeParser';

const LOCAL_RESUME_PREFIX = 'local/resumes';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  try {
    const formData = await request.formData();
    const file = formData.get('resume');

    if (!file || !(file instanceof File)) {
      return Response.json(
        { error: 'Bad Request', message: 'A resume file is required.' },
        { status: 400 },
      );
    }

    if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
      return Response.json(
        { error: 'Bad Request', message: 'Only PDF files are accepted.' },
        { status: 400 },
      );
    }

    if (isLocalOnboardingEnabled()) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const s3Key = `${LOCAL_RESUME_PREFIX}/${user.userId}/${file.name}`;
      putLocalUser(user.userId, { resume_s3_key: s3Key });

      const profile = await parseResumePdfLocally(buffer);

      return Response.json({
        ok: true,
        s3Key,
        profile,
        parseFailed: profile === null,
      });
    }

    const { uploadResume } = await import('@worksignal/backend');
    const { S3Helper } = await import('@worksignal/shared');

    const buffer = Buffer.from(await file.arrayBuffer());
    const s3 = new S3Helper({
      bucket: process.env.WORKSIGNAL_S3_BUCKET ?? 'worksignal-documents',
      region: process.env.WORKSIGNAL_S3_REGION ?? 'ap-southeast-1',
    });

    const result = await uploadResume(
      { s3 },
      user.userId,
      { bytes: new Uint8Array(buffer), filename: file.name, contentType: 'application/pdf' },
    );

    let profile: ParsedProfile | null = null;
    let parseFailed = false;

    try {
      const { createResumeParser } = await import('@worksignal/backend');
      const parser = createResumeParser({ s3 });
      const parsed = await parser.parse(result.s3Key);
      if ('current_role' in parsed) {
        profile = parsed;
      } else {
        parseFailed = true;
      }
    } catch {
      parseFailed = true;
    }

    return Response.json({
      ok: true,
      s3Key: result.s3Key,
      profile,
      parseFailed,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    const friendly = message.includes('security token') || message.includes('bucket')
      ? 'Cloud storage is unavailable. Set LOCAL_DEV=true in .env.local for local development, or use Enter details manually.'
      : message;
    return Response.json({ error: 'Error', message: friendly }, { status: 500 });
  }
}

export async function DELETE() {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  if (isLocalOnboardingEnabled()) {
    clearLocalUserFields(user.userId, ['resume_s3_key']);
    return Response.json({ ok: true });
  }

  return Response.json(
    { error: 'Not Implemented', message: 'Resume removal is not available in this environment.' },
    { status: 501 },
  );
}
