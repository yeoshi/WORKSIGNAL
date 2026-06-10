/**
 * POST /api/jobs/[jobId]/send — Send application (Req 16).
 */

import { NextRequest } from 'next/server';
import { getAuthenticatedUser, unauthorizedResponse } from '../../../lib/auth';
import { getApiBaseUrl } from '../../../lib/apiGateway';
import { DEMO_MODE } from '../../../lib/demo';

export async function POST(
    request: NextRequest,
    { params }: { params: { jobId: string } },
) {
    const user = await getAuthenticatedUser();
    if (!user) return unauthorizedResponse();

    if (DEMO_MODE) {
        return Response.json({ ok: true, result: { status: 'sent' } });
    }

    try {
        const { jobId } = params;
        const body = await request.json().catch(() => ({}));

        const res = await fetch(`${getApiBaseUrl()}/jobs/${encodeURIComponent(jobId)}/send`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                cookie: request.headers.get('cookie') ?? '',
            },
            body: JSON.stringify(body),
        });
        const data = await res.json();
        return Response.json(data, { status: res.status });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Internal server error';
        return Response.json({ error: 'Error', message }, { status: 500 });
    }
}
