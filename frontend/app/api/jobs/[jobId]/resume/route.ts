/**
 * POST /api/jobs/[jobId]/resume — Upload a custom resume for a specific job.
 *
 * Stores under resumes/customised/{userId}/{jobId}/{uuid}.pdf and saves
 * the key to AgentVerdicts.customised_resume_s3_key so the job card
 * shows the tailored resume immediately.
 */

import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { getAuthenticatedUser, unauthorizedResponse } from '../../../lib/auth';

export async function POST(
    request: NextRequest,
    { params }: { params: { jobId: string } },
) {
    const user = await getAuthenticatedUser();
    if (!user) return unauthorizedResponse();

    const { jobId } = params;

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

        const { DynamoDBWrapper, S3Helper } = await import('@/app/api/lib/aws');
        const db = new DynamoDBWrapper();

        // Verify job belongs to this user.
        const job = await db.get('Jobs', { job_id: jobId });
        if (!job || job.user_id !== user.userId) {
            return Response.json({ error: 'Not Found', message: 'Job not found.' }, { status: 404 });
        }

        const bucket = process.env.WORKSIGNAL_S3_BUCKET ?? 'worksignal-documents';
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_') || 'resume.pdf';
        const s3Key = `resumes/customised/${user.userId}/${jobId}/${randomUUID()}/${safeName}`;

        const buffer = Buffer.from(await file.arrayBuffer());
        const s3 = new S3Helper({ bucket });
        await s3.putObject(s3Key, buffer, { contentType: 'application/pdf' });

        console.log(`[job-resume-upload] ✓ uploaded custom resume s3://${bucket}/${s3Key} (user=${user.userId}, job=${jobId}, file=${file.name}, size=${buffer.byteLength}B)`);

        // Save key to AgentVerdicts so the job card shows it immediately.
        const verdictItems = await db.query('AgentVerdicts', {
            IndexName: 'job_id-user_id-index',
            KeyConditionExpression: 'job_id = :j AND user_id = :u',
            ExpressionAttributeValues: { ':j': jobId, ':u': user.userId },
        });

        const verdictItem = verdictItems[0];
        if (verdictItem?.verdict_id) {
            await db.update('AgentVerdicts', { verdict_id: verdictItem.verdict_id }, {
                UpdateExpression: 'SET customised_resume_s3_key = :key, updated_at = :ts',
                ExpressionAttributeValues: {
                    ':key': s3Key,
                    ':ts': new Date().toISOString(),
                },
            });
            console.log(`[job-resume-upload] ✓ persisted customised_resume_s3_key to AgentVerdicts (verdict=${verdictItem.verdict_id as string})`);
        } else {
            console.log(`[job-resume-upload] ℹ no AgentVerdicts record yet for job=${jobId} — key stored in S3 only`);
        }

        // Return a fresh pre-signed URL so the UI can show it immediately.
        const resumeUrl = await s3.getPresignedUrl(s3Key);

        return Response.json({ ok: true, s3Key, resumeUrl });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Internal server error';
        console.error(`[job-resume-upload] ✗ error for job=${jobId}:`, message);
        return Response.json({ error: 'Error', message }, { status: 500 });
    }
}
