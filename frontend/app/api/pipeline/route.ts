/**
 * GET /api/pipeline — List user's applications (Req 17).
 *
 * Authenticated BFF route that fronts the Application_Tracker.list operation.
 * Returns the user's applications for the Pipeline view (company, role, send
 * date, status — Req 17.1).
 */

import { getAuthenticatedUser, unauthorizedResponse } from '../lib/auth';

export async function GET() {
    const user = await getAuthenticatedUser();
    if (!user) return unauthorizedResponse();

    try {
        const { createApplicationTracker } = await import('@worksignal/backend');
        const tracker = createApplicationTracker();

        const applications = await tracker.list(user.userId);
        return Response.json(applications);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Internal server error';
        return Response.json({ error: 'Error', message }, { status: 500 });
    }
}
