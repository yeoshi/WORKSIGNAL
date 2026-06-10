/**
 * POST /api/onboarding/resume-details — Confirm parsed or manual resume profile.
 */

import { NextRequest } from 'next/server';
import type { ParsedProfile } from '@worksignal/shared';
import { getAuthenticatedUser, unauthorizedResponse } from '../../lib/auth';
import { createOnboardingServiceForRequest } from '../../lib/onboardingPersistence';

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  try {
    const body = (await request.json()) as ParsedProfile & {
      resume_s3_key?: string;
    };

    if (typeof body.years_experience !== 'number' || body.years_experience < 0) {
      return Response.json(
        { error: 'Bad Request', message: 'Years of experience must be zero or more.' },
        { status: 400 },
      );
    }

    const profile: ParsedProfile = {
      current_role: body.current_role?.trim() ?? '',
      years_experience: body.years_experience,
      skills: Array.isArray(body.skills) ? body.skills : [],
      education: body.education?.trim() ?? '',
      university: body.university?.trim() ?? '',
      basic_info: body.basic_info && typeof body.basic_info === 'object' ? body.basic_info : undefined,
      education_history: Array.isArray(body.education_history) ? body.education_history : [],
      work_experience: Array.isArray(body.work_experience) ? body.work_experience : [],
      internships: Array.isArray(body.internships) ? body.internships : [],
      projects: Array.isArray(body.projects) ? body.projects : [],
      work_samples: Array.isArray(body.work_samples) ? body.work_samples : [],
      honors_awards: Array.isArray(body.honors_awards) ? body.honors_awards : [],
      languages: Array.isArray(body.languages) ? body.languages : [],
      self_introduction: typeof body.self_introduction === 'string' ? body.self_introduction : '',
      sns_links: Array.isArray(body.sns_links) ? body.sns_links : [],
    };

    const service = await createOnboardingServiceForRequest();
    await service.confirmResumeProfile(user.userId, profile, body.resume_s3_key);

    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return Response.json({ error: 'Error', message }, { status: 500 });
  }
}
