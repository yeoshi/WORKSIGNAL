/**
 * POST /api/onboarding/profile — Persist career stage + residency (Req 3).
 */

import { NextRequest } from 'next/server';
import { getAuthenticatedUser, unauthorizedResponse } from '../../lib/auth';
import { createOnboardingServiceForRequest } from '../../lib/onboardingPersistence';
import type { CareerStage, ResidencyStatus } from '@worksignal/shared';

function friendlyError(message: string): string {
  if (message.includes('security token') || message.includes('ExpiredToken')) {
    return 'Your session storage is unavailable. Set LOCAL_DEV=true in .env.local for local development.';
  }
  return message;
}

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

    const service = await createOnboardingServiceForRequest();
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
    return Response.json(
      { error: 'Error', message: friendlyError(message) },
      { status },
    );
  }
}
