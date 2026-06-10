/**
 * POST /api/jobs/[jobId]/skip — Skip/save application (Req 13).
 *
 * Authenticated BFF route that records a user's skip/save decision for a job.
 * This is the "I've reviewed it, I'll pass" action from the Job Detail screen.
 */

import { NextRequest } from 'next/server';
import { getAuthenticatedUser, unauthorizedResponse } from '../../../lib/auth';
import { DEMO_MODE } from '../../../lib/demo';

export async function POST(
    _request: NextRequest,
    { params }: { params: { jobId: string } },
) {
    const user = await getAuthenticatedUser();
    if (!user) return unauthorizedResponse();

    if (DEMO_MODE) {
        return Response.json({ ok: true, decision: 'skipped' });
    }

    try {
        const { jobId } = params;
        const { DynamoDBWrapper } = await import('@/app/api/lib/aws');
        const db = new DynamoDBWrapper();

        // Verify the job exists and belongs to this user.
        const job = await db.get('Jobs', { job_id: jobId });
        if (!job || job.user_id !== user.userId) {
            return Response.json(
                { error: 'Not Found', message: 'Job not found.' },
                { status: 404 },
            );
        }

        // Record the user's skip decision on the job record.
        await db.update('Jobs', { job_id: jobId }, {
            UpdateExpression: 'SET user_decision = :d, decision_at = :t',
            ExpressionAttributeValues: {
                ':d': 'skipped',
                ':t': new Date().toISOString(),
            },
        });

        return Response.json({ ok: true, decision: 'skipped' });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Internal server error';
        return Response.json({ error: 'Error', message }, { status: 500 });
    }
}
