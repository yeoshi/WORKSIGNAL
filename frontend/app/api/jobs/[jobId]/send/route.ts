/**
 * POST /api/jobs/[jobId]/send — Send application (Req 16).
 *
 * Authenticated BFF route that triggers the Application_Sender for a job.
 * Accepts an optional `coverLetter` field in the body — if present, the
 * edited text is used verbatim (Req 15.6).
 */

import { NextRequest } from 'next/server';
import { getAuthenticatedUser, unauthorizedResponse } from '../../../lib/auth';

export async function POST(
    request: NextRequest,
    { params }: { params: { jobId: string } },
) {
    const user = await getAuthenticatedUser();
    if (!user) return unauthorizedResponse();

    try {
        const { jobId } = params;
        const body = await request.json().catch(() => ({}));
        const { coverLetter } = body as { coverLetter?: string };

        const { DynamoDBWrapper } = await import('@worksignal/shared');
        const db = new DynamoDBWrapper();

        // Verify the job exists and belongs to this user.
        const job = await db.get('Jobs', { job_id: jobId });
        if (!job || job.user_id !== user.userId) {
            return Response.json(
                { error: 'Not Found', message: 'Job not found.' },
                { status: 404 },
            );
        }

        // Find the application record or verdict for this job.
        const verdictItems = await db.query('AgentVerdicts', {
            IndexName: 'job_id-user_id-index',
            KeyConditionExpression: 'job_id = :j AND user_id = :u',
            ExpressionAttributeValues: { ':j': jobId, ':u': user.userId },
        });

        const verdict = verdictItems[0];
        if (!verdict) {
            return Response.json(
                { error: 'Not Found', message: 'No debate found for this job.' },
                { status: 404 },
            );
        }

        // Build a send context and invoke the Application_Sender.
        const { createApplicationSender } = await import('@worksignal/backend');
        const sender = createApplicationSender({
            loadContext: async () => ({
                user_id: user.userId,
                job_id: jobId,
                verdict_id: String(verdict.verdict_id ?? ''),
                company: String(job.company ?? ''),
                role_title: String(job.role_title ?? ''),
                user_email: user.email ?? '',
                employer_email: (job.employer_email as string) ?? null,
                source_url: String(job.source_url ?? ''),
                customised_resume_s3_key: String(verdict.customised_resume_s3_key ?? ''),
                customisation_applied: Boolean(verdict.customisation_applied ?? false),
                cover_letter_text: String(verdict.cover_letter_text ?? ''),
            }),
        });

        const result = await sender.send(
            String(verdict.verdict_id ?? jobId),
            coverLetter,
        );

        return Response.json({ ok: true, result });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Internal server error';
        return Response.json({ error: 'Error', message }, { status: 500 });
    }
}
