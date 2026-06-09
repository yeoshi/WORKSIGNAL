/**
 * GET/PUT /api/onboarding — Read and edit onboarding state (Req 5.4, 5.5).
 *
 * GET: Returns the current onboarding state for the authenticated user.
 * PUT: Applies a partial edit and returns the resulting fully-stamped state,
 *      ensuring the most recently saved onboarding is the source of truth.
 */

import { NextRequest } from 'next/server';
import { getAuthenticatedUser, unauthorizedResponse } from '../lib/auth';

export async function GET() {
    const user = await getAuthenticatedUser();
    if (!user) return unauthorizedResponse();

    try {
        const { DynamoDBWrapper } = await import('@worksignal/shared');
        const db = new DynamoDBWrapper();
        const record = await db.get('Users', { user_id: user.userId });

        if (!record) {
            return Response.json(null, { status: 204 });
        }

        return Response.json(record);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Internal server error';
        return Response.json({ error: 'Error', message }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    const user = await getAuthenticatedUser();
    if (!user) return unauthorizedResponse();

    try {
        const patch = await request.json();

        const { createOnboardingService } = await import('@worksignal/backend');
        const { DynamoDBWrapper } = await import('@worksignal/shared');
        const service = createOnboardingService({ db: new DynamoDBWrapper() });

        const state = await service.editOnboarding(user.userId, patch);
        return Response.json(state);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Internal server error';
        const status = message.includes('ranking') || message.includes('salary') || message.includes('career_switcher') ? 400 : 500;
        return Response.json({ error: 'Error', message }, { status });
    }
}
