/**
 * GET /api/pipeline/[applicationId]/debate — Get original debate for an application (Req 17.4).
 *
 * Authenticated BFF route that fronts the Application_Tracker.getDebate
 * operation. Returns the original agent verdicts and Master decision for a
 * specific application in the user's pipeline.
 */

import { NextRequest } from 'next/server';
import { getAuthenticatedUser, unauthorizedResponse } from '../../../lib/auth';
import type { Application } from '@worksignal/shared';

export async function GET(
    _request: NextRequest,
    { params }: { params: { applicationId: string } },
) {
    const user = await getAuthenticatedUser();
    if (!user) return unauthorizedResponse();

    try {
        const { applicationId } = params;
        const { createApplicationTracker } = await import('@worksignal/backend');
        const tracker = createApplicationTracker();

        // Verify the application belongs to this user by checking the list.
        // This is a security check — users can only view their own debates.
        const applications: Application[] = await tracker.list(user.userId);
        const app = applications.find((a: Application) => a.application_id === applicationId);

        if (!app) {
            return Response.json(
                { error: 'Not Found', message: 'Application not found.' },
                { status: 404 },
            );
        }

        const debate = await tracker.getDebate(applicationId);
        return Response.json(debate);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Internal server error';
        const status = message.includes('not found') ? 404 : 500;
        return Response.json({ error: 'Error', message }, { status });
    }
}
