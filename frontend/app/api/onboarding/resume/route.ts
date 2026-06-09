/**
 * POST /api/onboarding/resume — Upload resume PDF (Req 2.1, 2.3).
 *
 * Authenticated BFF route that fronts the resume upload + parse pipeline.
 * Accepts a multipart form with a `resume` field containing the PDF file.
 */

import { NextRequest } from 'next/server';
import { getAuthenticatedUser, unauthorizedResponse } from '../../lib/auth';

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

        const buffer = Buffer.from(await file.arrayBuffer());
        const s3 = new S3Helper({ bucket: process.env.WORKSIGNAL_S3_BUCKET ?? 'worksignal-documents' });
        const result = await uploadResume(
            { s3 },
            user.userId,
            { bytes: new Uint8Array(buffer), filename: file.name, contentType: 'application/pdf' },
        );

        return Response.json({ ok: true, s3Key: result.s3Key });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Internal server error';
        return Response.json({ error: 'Error', message }, { status: 500 });
    }
}
