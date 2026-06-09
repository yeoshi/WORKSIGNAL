/**
 * POST /api/onboarding/targets — Persist targets, ranking, non-negotiables (Req 4, 5).
 *
 * Authenticated BFF route that fronts the Onboarding_Service.setTargets,
 * setPriorityRanking, and setNonNegotiables APIs with validation.
 */

import { NextRequest } from 'next/server';
import { getAuthenticatedUser, unauthorizedResponse } from '../../lib/auth';
import type { NonNegotiables, PriorityFactor } from '@worksignal/shared';

interface TargetsPayload {
    target_roles: string[];
    target_industries: string[];
    dream_companies: string[];
    priority_ranking: PriorityFactor[];
    non_negotiables: NonNegotiables;
}

export async function POST(request: NextRequest) {
    const user = await getAuthenticatedUser();
    if (!user) return unauthorizedResponse();

    try {
        const body = (await request.json()) as TargetsPayload;

        const { createOnboardingService } = await import('@worksignal/backend');
        const { DynamoDBWrapper } = await import('@worksignal/shared');
        const service = createOnboardingService({ db: new DynamoDBWrapper() });

        // Set targets (Req 4.1).
        await service.setTargets(
            user.userId,
            body.target_roles ?? [],
            body.target_industries ?? [],
            body.dream_companies ?? [],
        );

        // Set priority ranking (Req 4.2-4.4).
        if (body.priority_ranking) {
            const rankResult = await service.setPriorityRanking(
                user.userId,
                body.priority_ranking,
            );
            if (rankResult) {
                // RankingError — return the validation error.
                return Response.json(
                    { error: 'Validation', message: rankResult.message },
                    { status: 400 },
                );
            }
        }

        // Set non-negotiables (Req 5.1-5.3).
        if (body.non_negotiables) {
            const nnResult = await service.setNonNegotiables(
                user.userId,
                body.non_negotiables,
            );
            if (nnResult) {
                // ValidationError — return the validation error.
                return Response.json(
                    { error: 'Validation', message: nnResult.message },
                    { status: 400 },
                );
            }
        }

        return Response.json({ ok: true });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Internal server error';
        const status = message.includes('ranking') || message.includes('salary') ? 400 : 500;
        return Response.json({ error: 'Error', message }, { status });
    }
}
