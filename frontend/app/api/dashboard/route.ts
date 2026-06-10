/**
 * GET /api/dashboard — Aggregate dashboard payload (Req 21.3, task 24.1).
 */

import { getAuthenticatedUser, unauthorizedResponse } from '../lib/auth';
import { getApiBaseUrl } from '../lib/apiGateway';
import { DEMO_MODE, DEMO_DASHBOARD } from '../lib/demo';

export async function GET(request: Request) {
    if (DEMO_MODE) return Response.json(DEMO_DASHBOARD);

    const user = await getAuthenticatedUser();
    if (!user) return unauthorizedResponse();

    try {
        const res = await fetch(`${getApiBaseUrl()}/dashboard`, {
            headers: {
                cookie: request.headers.get('cookie') ?? '',
            },
        });
        const data = await res.json();
        return Response.json(data, { status: res.status });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Internal server error';
        return Response.json({ error: 'Error', message }, { status: 500 });
    }
}
