/**
 * GET /api/profile — Fetch the current user's profile including resume status.
 */

import { getAuthenticatedUser, unauthorizedResponse } from '../lib/auth';

export async function GET() {
    const user = await getAuthenticatedUser();
    if (!user) return unauthorizedResponse();

    try {
        const { DynamoDBWrapper, S3Helper } = await import('@worksignal/shared');
        const db = new DynamoDBWrapper();

        const record = await db.get('Users', { user_id: user.userId });

        const resumeS3Key = (record?.resume_s3_key as string | undefined) ?? null;
        let resumeUrl: string | null = null;

        if (resumeS3Key) {
            const bucket = process.env.WORKSIGNAL_S3_BUCKET ?? 'worksignal-documents';
            const s3 = new S3Helper({ bucket });
            try {
                resumeUrl = await s3.getPresignedUrl(resumeS3Key);
            } catch {
                // Key may not exist yet; safe to ignore
            }
        }

        return Response.json({
            userId: user.userId,
            email: user.email ?? null,
            name: record?.name ?? null,
            resumeS3Key,
            resumeUrl,
            careerStage: record?.career_stage ?? null,
            residencyStatus: record?.residency_status ?? null,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Internal server error';
        return Response.json({ error: 'Error', message }, { status: 500 });
    }
}
