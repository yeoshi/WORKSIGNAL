/**
 * POST /api/jobs/[jobId]/mark-sent — Confirm external application sent.
 *
 * Used when the user applies via the employer's site and clicks "Done sending".
 */

import { NextRequest } from 'next/server';
import { DynamoDBWrapper } from '@worksignal/shared';
import { getAuthenticatedUser, unauthorizedResponse } from '../../../lib/auth';
import { DEMO_MODE } from '../../../lib/demo';

export async function POST(
    _request: NextRequest,
    { params }: { params: { jobId: string } },
) {
    const user = await getAuthenticatedUser();
    if (!user) return unauthorizedResponse();

    if (DEMO_MODE) {
        return Response.json({ ok: true, status: 'sent' });
    }

    try {
        const { jobId } = params;
        const db = new DynamoDBWrapper();

        const job = await db.get('Jobs', { job_id: jobId });
        if (!job || job.user_id !== user.userId) {
            return Response.json(
                { error: 'Not Found', message: 'Job not found.' },
                { status: 404 },
            );
        }

        const now = new Date().toISOString();
        await db.update('Jobs', { job_id: jobId }, {
            UpdateExpression: 'SET user_decision = :d, decision_at = :t',
            ExpressionAttributeValues: {
                ':d': 'sent',
                ':t': now,
            },
        });

        return Response.json({ ok: true, status: 'sent' });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Internal server error';
        return Response.json({ error: 'Error', message }, { status: 500 });
    }
}
