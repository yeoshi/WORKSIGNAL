/**
 * GET /api/pipeline/[applicationId]/debate — Get original debate for an application (Req 17.4).
 */

import { NextRequest } from 'next/server';
import { getAuthenticatedUser, unauthorizedResponse } from '../../../lib/auth';
import { getApiBaseUrl } from '../../../lib/apiGateway';

export async function GET(
    request: NextRequest,
    { params }: { params: { applicationId: string } },
) {
    const user = await getAuthenticatedUser();
    if (!user) return unauthorizedResponse();

    try {
        const { applicationId } = params;
        const res = await fetch(
            `${getApiBaseUrl()}/pipeline/${encodeURIComponent(applicationId)}/debate`,
            {
                headers: {
                    cookie: request.headers.get('cookie') ?? '',
                },
            },
        );
        const data = await res.json();
        return Response.json(data, { status: res.status });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Internal server error';
        const status = message.includes('not found') ? 404 : 500;
        return Response.json({ error: 'Error', message }, { status });
    }
}
