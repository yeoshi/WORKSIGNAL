/**
 * POST /api/onboarding/profile — Persist career stage + residency (Req 3).
 *
 * Authenticated BFF route that fronts the Onboarding_Service.setCareerProfile
 * and calibration derivation (Req 6.1-6.4).
 */

import { NextRequest } from 'next/server';
import { getAuthenticatedUser, unauthorizedResponse } from '../../lib/auth';
import type { CareerStage, ResidencyStatus } from '@worksignal/shared';

export async function POST(request: NextRequest) {
    const user = await getAuthenticatedUser();
    if (!user) return unauthorizedResponse();

    try {
        const body = await request.json();
        const {
            career_stage,
            residency_status,
            career_switch_context,
        } = body as {
            career_stage: CareerStage;
            residency_status: ResidencyStatus;
            career_switch_context?: { from: string; to: string };
        };

        if (!career_stage || !residency_status) {
            return Response.json(
                { error: 'Bad Request', message: 'career_stage and residency_status are required.' },
                { status: 400 },
            );
        }

        // In monorepo mode, import and call the backend service directly.
        const { createOnboardingService } = await import('@worksignal/backend');
        const { DynamoDBWrapper } = await import('@worksignal/shared');
        const service = createOnboardingService({ db: new DynamoDBWrapper() });

        await service.setCareerProfile(
            user.userId,
            career_stage,
            residency_status,
            career_switch_context,
        );

        return Response.json({ ok: true });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Internal server error';
        const status = message.includes('career_switcher') ? 400 : 500;
        return Response.json({ error: 'Error', message }, { status });
    }
}
