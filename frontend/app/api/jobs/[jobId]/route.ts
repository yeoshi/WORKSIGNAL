/**
 * GET /api/jobs/[jobId] — Job detail with debate verdicts and materials (Req 15).
 *
 * Authenticated BFF route that assembles the Job Detail hero screen payload:
 * the job record, debate verdicts from all four agents, Master decision summary,
 * customised resume preview URL, and cover-letter text.
 */

import { NextRequest } from 'next/server';
import { getAuthenticatedUser, unauthorizedResponse } from '../../lib/auth';
import { DEMO_MODE, DEMO_JOB_DETAIL } from '../../lib/demo';

export async function GET(
    _request: NextRequest,
    { params }: { params: { jobId: string } },
) {
    if (DEMO_MODE) return Response.json({ ...DEMO_JOB_DETAIL, job: { ...DEMO_JOB_DETAIL.job, job_id: params.jobId } });

    const user = await getAuthenticatedUser();
    if (!user) return unauthorizedResponse();

    try {
        const { jobId } = params;
        const { DynamoDBWrapper } = await import('@worksignal/shared');
        const db = new DynamoDBWrapper();

        // Load the job record.
        const job = await db.get('Jobs', { job_id: jobId });
        if (!job) {
            return Response.json(
                { error: 'Not Found', message: 'Job not found.' },
                { status: 404 },
            );
        }

        // Verify the job belongs to this user.
        if (job.user_id !== user.userId) {
            return Response.json(
                { error: 'Not Found', message: 'Job not found.' },
                { status: 404 },
            );
        }

        // Load the debate verdicts for this job + user.
        const verdictItems = await db.query('AgentVerdicts', {
            IndexName: 'job_id-user_id-index',
            KeyConditionExpression: 'job_id = :j AND user_id = :u',
            ExpressionAttributeValues: { ':j': jobId, ':u': user.userId },
        });

        const verdictItem = verdictItems[0] ?? null;

        // Assemble the Job Detail payload.
        const response = {
            job: {
                job_id: job.job_id,
                company: job.company,
                role_title: job.role_title,
                salary_min: job.salary_min,
                salary_max: job.salary_max,
                posted_at: job.posted_at,
                source_url: job.source_url,
                employer_email: job.employer_email,
                jd_text: job.jd_text,
            },
            debate: verdictItem
                ? {
                    ambition: verdictItem.ambition ?? null,
                    realism: verdictItem.realism ?? null,
                    risk: verdictItem.risk ?? null,
                    opportunity: verdictItem.opportunity ?? null,
                }
                : null,
            masterDecision: verdictItem?.master_decision ?? null,
            coverLetterText: verdictItem?.cover_letter_text ?? '',
            resumeUrl: null as string | null,
        };

        // Generate a pre-signed URL for the resume if available.
        if (verdictItem?.customised_resume_s3_key) {
            try {
                const { S3Helper } = await import('@worksignal/shared');
                const s3 = new S3Helper({ bucket: process.env.WORKSIGNAL_S3_BUCKET ?? 'worksignal-documents' });
                response.resumeUrl = await s3.getPresignedUrl(
                    verdictItem.customised_resume_s3_key as string,
                );
            } catch {
                // Resume URL generation failed — continue without it.
                response.resumeUrl = null;
            }
        }

        return Response.json(response);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Internal server error';
        return Response.json({ error: 'Error', message }, { status: 500 });
    }
}
