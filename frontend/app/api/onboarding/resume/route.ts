/**
 * POST /api/onboarding/resume — Upload resume PDF (Req 2.1, 2.3).
 *
 * Authenticated BFF route that fronts the resume upload + parse pipeline.
 * Accepts a multipart form with a `resume` field containing the PDF file.
 */

import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { getAuthenticatedUser, unauthorizedResponse } from '../../lib/auth';

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

        // Validate PDF type (Req 2.3).
        if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
            return Response.json(
                { error: 'Bad Request', message: 'Only PDF files are accepted.' },
                { status: 400 },
            );
        }

        // In monorepo mode, call the backend resume upload service directly.
        // The uploadResume function requires S3 deps; use the S3Helper from shared.
        const { uploadResume } = await import('@worksignal/backend');
        const { S3Helper } = await import('@worksignal/shared');

        const bucket = process.env.WORKSIGNAL_S3_BUCKET ?? 'worksignal-documents';
        const buffer = Buffer.from(await file.arrayBuffer());
        const s3 = new S3Helper({ bucket });
        const result = await uploadResume(
            {
                s3,
                // Key ends with the original filename so resumeFileName() can display it.
                generateKey: (uid, f) =>
                    `resumes/${uid}/${randomUUID()}/${safeFilename(f.filename)}`,
            },
            user.userId,
            { bytes: new Uint8Array(buffer), filename: file.name, contentType: 'application/pdf' },
        );

        console.log(`[resume-upload] ✓ uploaded to s3://${bucket}/${result.s3Key} (user=${user.userId}, file=${file.name}, size=${buffer.byteLength}B)`);

        // Persist the S3 key to the Users record so it is available on every job card.
        const { DynamoDBWrapper } = await import('@worksignal/shared');
        const db = new DynamoDBWrapper();
        await db.update('Users', { user_id: user.userId }, {
            UpdateExpression: 'SET resume_s3_key = :key, updated_at = :ts',
            ExpressionAttributeValues: {
                ':key': result.s3Key,
                ':ts': new Date().toISOString(),
            },
        });

        console.log(`[resume-upload] ✓ persisted resume_s3_key to Users table (user=${user.userId})`);

        return Response.json({ ok: true, s3Key: result.s3Key });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Internal server error';
        return Response.json({ error: 'Error', message }, { status: 500 });
    }
}
