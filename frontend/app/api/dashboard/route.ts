/**
 * GET /api/dashboard — Aggregate dashboard payload (Req 21.3, task 24.1).
 *
 * Returns the agent status, action-needed items, pipeline summary,
 * growth/network cards, intelligence summary, and relaxation suggestions.
 */

import { getAuthenticatedUser, unauthorizedResponse } from '../lib/auth';
import { DEMO_MODE, DEMO_DASHBOARD } from '../lib/demo';

export async function GET() {
    if (DEMO_MODE) return Response.json(DEMO_DASHBOARD);

    const user = await getAuthenticatedUser();
    if (!user) return unauthorizedResponse();

    // In production this would aggregate data from multiple backend services.
    return Response.json({
        agent_status: {
            scanning: false,
            last_scan_at: null,
            next_scan_at: null,
            jobs_in_review: 0,
        },
        action_needed: [],
        pipeline: { total: 0, by_status: {} },
        growth: [],
        network: [],
        intelligence: { callback_rate: null, latest_recalibration: null },
        relaxation_suggestions: [],
    });
}
