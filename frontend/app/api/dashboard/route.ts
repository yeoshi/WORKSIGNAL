/**
 * GET /api/dashboard — Aggregate dashboard payload (Req 21.3, task 24.1).
 */

import { getAuthenticatedUser, unauthorizedResponse } from '../lib/auth';
import { DEMO_MODE, DEMO_DASHBOARD } from '../lib/demo';

export async function GET() {
    if (DEMO_MODE) return Response.json(DEMO_DASHBOARD);

    const user = await getAuthenticatedUser();
    if (!user) return unauthorizedResponse();

    return new Response(null, { status: 204 });
}
