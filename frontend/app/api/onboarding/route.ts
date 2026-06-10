/**
 * GET/PUT /api/onboarding — Read and edit onboarding state (Req 5.4, 5.5).
 */

import { NextRequest } from 'next/server';
import { getAuthenticatedUser, unauthorizedResponse } from '../lib/auth';
import { DEMO_MODE, DEMO_USER } from '../lib/demo';
import { createOnboardingServiceForRequest, loadOnboardingUser } from '../lib/onboardingPersistence';
import { seedDemoOnboardingUser } from '../lib/demoOnboardingSeed';

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  try {
    let record = await loadOnboardingUser(user.userId);

    if (!record && DEMO_MODE && user.userId === DEMO_USER.userId) {
      record = seedDemoOnboardingUser(user.userId) as Record<string, unknown>;
    }

    if (!record) {
      return new Response(null, { status: 204 });
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
    const service = await createOnboardingServiceForRequest();

    if ('editOnboarding' in service) {
      const state = await service.editOnboarding(user.userId, patch);
      return Response.json(state);
    }

    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message.includes('ranking') || message.includes('salary') || message.includes('career_switcher') ? 400 : 500;
    return Response.json({ error: 'Error', message }, { status });
  }
}
