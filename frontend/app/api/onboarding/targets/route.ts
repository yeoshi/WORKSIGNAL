/**
 * POST /api/onboarding/targets — Persist targets, ranking, non-negotiables (Req 4, 5).
 */

import { NextRequest } from 'next/server';
import { getAuthenticatedUser, unauthorizedResponse } from '../../lib/auth';
import { createOnboardingServiceForRequest } from '../../lib/onboardingPersistence';
import type { NonNegotiables, PriorityFactor } from '@worksignal/shared';

interface TargetsPayload {
  target_roles: string[];
  target_industries: string[];
  dream_companies: string[];
  priority_ranking: PriorityFactor[];
  non_negotiables: NonNegotiables;
}

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
    const body = (await request.json()) as TargetsPayload;
    const service = await createOnboardingServiceForRequest();

    await service.setTargets(
      user.userId,
      body.target_roles ?? [],
      body.target_industries ?? [],
      body.dream_companies ?? [],
    );

    if (body.priority_ranking) {
      const rankResult = await service.setPriorityRanking(user.userId, body.priority_ranking);
      if (rankResult) {
        return Response.json(
          { error: 'Validation', message: rankResult.message },
          { status: 400 },
        );
      }
    }

    if (body.non_negotiables) {
      const nnResult = await service.setNonNegotiables(user.userId, body.non_negotiables);
      if (nnResult) {
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
    return Response.json(
      { error: 'Error', message: friendlyError(message) },
      { status },
    );
  }
}
