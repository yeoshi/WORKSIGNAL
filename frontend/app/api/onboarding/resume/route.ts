/**
 * POST /api/onboarding/resume — Upload resume PDF (Req 2.1, 2.3).
 */

import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import type { ParsedProfile } from '@worksignal/shared';
import { getAuthenticatedUser, unauthorizedResponse } from '../../lib/auth';
import {
  clearLocalUserFields,
  isLocalOnboardingEnabled,
  putLocalUser,
} from '../../lib/localOnboardingStore';
import { parseResumePdfLocally } from '../../lib/localResumeParser';
import { getAwsRegion } from '../../lib/awsRegion';

const LOCAL_RESUME_PREFIX = 'local/resumes';

export const runtime = 'nodejs';

function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_') || 'resume.pdf';
}

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

    const { uploadResume } = await import(
      '@worksignal/backend/src/onboarding/resumeUpload.js'
    );
    const { DynamoDBWrapper, S3Helper } = await import('@worksignal/shared');

    const bucket = process.env.WORKSIGNAL_S3_BUCKET ?? 'worksignal-documents';
    const buffer = Buffer.from(await file.arrayBuffer());
    const s3 = new S3Helper({
      bucket,
      region: getAwsRegion(),
    });

    const result = await uploadResume(
      {
        s3,
        generateKey: (uid, f) =>
          `resumes/${uid}/${randomUUID()}/${safeFilename(f.filename)}`,
      },
      user.userId,
      { bytes: new Uint8Array(buffer), filename: file.name, contentType: 'application/pdf' },
    );

    console.log(
      `[resume-upload] ✓ uploaded to s3://${bucket}/${result.s3Key} (user=${user.userId}, file=${file.name}, size=${buffer.byteLength}B)`,
    );

    const db = new DynamoDBWrapper();
    await db.update('Users', { user_id: user.userId }, {
      UpdateExpression: 'SET resume_s3_key = :key, updated_at = :ts',
      ExpressionAttributeValues: {
        ':key': result.s3Key,
        ':ts': new Date().toISOString(),
      },
    });

    console.log(
      `[resume-upload] ✓ persisted resume_s3_key to Users table (user=${user.userId})`,
    );

    let profile: ParsedProfile | null = await parseResumePdfLocally(buffer);
    let parseFailed = profile === null;

    if (!profile) {
      try {
        const { createResumeParser } = await import(
          '@worksignal/backend/src/onboarding/resumeParser.js'
        );
        const { createBedrockTextInvoke } = await import('../../lib/bedrockTextInvoke');
        const parser = createResumeParser({
          s3,
          bedrockInvoke: createBedrockTextInvoke(),
        });
        const parsed = await parser.parse(result.s3Key);
        if ('current_role' in parsed) {
          profile = parsed;
          parseFailed = false;
        } else {
          console.warn(
            '[resume-upload] Bedrock parse returned ParseFailure:',
            (parsed as { message?: string }).message ?? parsed,
          );
        }
      } catch (error) {
        console.warn('[resume-upload] Resume parsing failed:', error);
        parseFailed = true;
      }
    } else {
      console.log(
        `[resume-upload] ✓ parsed locally (user=${user.userId}, role=${profile.current_role})`,
      );
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
