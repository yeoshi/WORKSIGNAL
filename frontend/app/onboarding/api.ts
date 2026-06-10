/**
 * Onboarding BFF/API client.
 *
 * Thin wrappers around the authenticated Next.js API routes that front the
 * Auth_Service and Onboarding_Service. Those routes are wired in task 24.1;
 * until then these helpers call the relative endpoints and tolerate their
 * absence (network error / 404 / non-2xx) by resolving to a soft failure
 * result instead of throwing, so the flow remains usable end-to-end during
 * development.
 *
 * Endpoints (relative, same-origin):
 * - POST /api/auth/google           — begin Google OAuth (gmail.readonly) (Req 1.1)
 * - POST /api/onboarding/resume      — upload resume PDF (Req 2.1)
 * - POST /api/onboarding/profile     — career stage + residency + switch (Req 3)
 * - POST /api/onboarding/targets     — targets, ranking, non-negotiables (Req 4, 5)
 */
import type {
  CareerStage,
  NonNegotiables,
  ParsedProfile,
  PriorityFactor,
  ResidencyStatus,
} from '@worksignal/shared';
import type { OnboardingRecord } from './lib/onboardingStatus';

/** Result of an onboarding API call that tolerates the route being absent. */
export type ApiResult<T = undefined> =
  | { readonly ok: true; readonly data?: T }
  | { readonly ok: false; readonly message: string; readonly pending?: boolean };

/**
 * Perform a JSON POST and normalise the outcome into an {@link ApiResult}.
 * A missing route (network error or 404) resolves to `{ ok: false, pending:
 * true }` so callers can treat it as "not wired yet" rather than a hard error.
 */
async function postJson<T>(
  url: string,
  body: unknown,
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.status === 404) {
      return { ok: false, pending: true, message: 'Endpoint not available yet.' };
    }
    if (!res.ok) {
      const message = await safeErrorMessage(res);
      return { ok: false, message };
    }
    const data = (await safeJson(res)) as T | undefined;
    return { ok: true, data };
  } catch {
    // Route not wired / offline — treat as pending rather than fatal.
    return { ok: false, pending: true, message: 'Endpoint not available yet.' };
  }
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return undefined;
  }
}

async function safeErrorMessage(res: Response): Promise<string> {
  const body = (await safeJson(res)) as { message?: string } | undefined;
  return body?.message ?? `Request failed (${res.status}).`;
}

/**
 * Begin Google OAuth sign-in requesting the `gmail.readonly` scope (Req 1.1).
 * Real implementation will redirect via NextAuth; this is a tolerant
 * placeholder until the auth route lands.
 */
export async function beginGoogleSignIn(): Promise<ApiResult> {
  return postJson('/api/auth/google', {
    scopes: ['openid', 'email', 'profile', 'gmail.readonly'],
  });
}

export interface ResumeUploadData {
  s3Key?: string;
  profile?: ParsedProfile | null;
  parseFailed?: boolean;
}

export interface CoverLetterUploadData {
  s3Key?: string;
  sampleText?: string;
}

/** Upload an optional cover letter sample PDF for tone matching. */
export async function uploadCoverLetter(
  file: File,
): Promise<ApiResult<CoverLetterUploadData>> {
  try {
    const form = new FormData();
    form.append('cover_letter', file);
    const res = await fetch('/api/onboarding/cover-letter', {
      method: 'POST',
      body: form,
    });
    if (res.status === 404) {
      return {
        ok: false,
        pending: true,
        message: 'Cover letter upload API is unavailable. Restart the dev server and try again.',
      };
    }
    if (!res.ok) {
      return { ok: false, message: await safeErrorMessage(res) };
    }
    const data = (await safeJson(res)) as CoverLetterUploadData | undefined;
    return { ok: true, data };
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Network error';
    return {
      ok: false,
      pending: true,
      message: `Could not reach the server (${detail}). Is the dev server running?`,
    };
  }
}

/** Remove the stored resume PDF for the authenticated user. */
export async function removeResume(): Promise<ApiResult> {
  try {
    const res = await fetch('/api/onboarding/resume', { method: 'DELETE' });
    if (res.status === 404) {
      return { ok: false, pending: true, message: 'Endpoint not available yet.' };
    }
    if (!res.ok) {
      return { ok: false, message: await safeErrorMessage(res) };
    }
    return { ok: true };
  } catch {
    return { ok: false, pending: true, message: 'Endpoint not available yet.' };
  }
}

/** Remove the stored cover letter sample for the authenticated user. */
export async function removeCoverLetter(): Promise<ApiResult> {
  try {
    const res = await fetch('/api/onboarding/cover-letter', { method: 'DELETE' });
    if (res.status === 404) {
      return { ok: false, pending: true, message: 'Endpoint not available yet.' };
    }
    if (!res.ok) {
      return { ok: false, message: await safeErrorMessage(res) };
    }
    return { ok: true };
  } catch {
    return { ok: false, pending: true, message: 'Endpoint not available yet.' };
  }
}

/** Upload a resume PDF to the Onboarding_Service (Req 2.1). */
export async function uploadResume(
  file: File,
): Promise<ApiResult<ResumeUploadData>> {
  try {
    const form = new FormData();
    form.append('resume', file);
    const res = await fetch('/api/onboarding/resume', {
      method: 'POST',
      body: form,
    });
    if (res.status === 404) {
      return {
        ok: false,
        pending: true,
        message: 'Resume upload API is unavailable. Restart the dev server and try again.',
      };
    }
    if (!res.ok) {
      return { ok: false, message: await safeErrorMessage(res) };
    }
    const data = (await safeJson(res)) as ResumeUploadData | undefined;
    return { ok: true, data };
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Network error';
    return {
      ok: false,
      pending: true,
      message: `Could not reach the server (${detail}). Is the dev server running?`,
    };
  }
}

/** Confirm parsed or manual resume profile (Req 2.2, 2.4). */
export type ResumeProfilePayload = ParsedProfile & { resume_s3_key?: string };

export async function saveResumeProfile(
  payload: ResumeProfilePayload,
): Promise<ApiResult> {
  return postJson('/api/onboarding/resume-details', payload);
}

/** Persist career stage, residency, and optional switch context (Req 3). */
export interface ProfilePayload {
  career_stage: CareerStage;
  residency_status: ResidencyStatus;
  career_switch_context?: { from: string; to: string };
}

export async function saveCareerProfile(
  payload: ProfilePayload,
): Promise<ApiResult> {
  return postJson('/api/onboarding/profile', payload);
}

/** Persist targets, priority ranking, and non-negotiables (Req 4, 5). */
export interface TargetsPayload {
  target_roles: string[];
  target_industries: string[];
  dream_companies: string[];
  priority_ranking: PriorityFactor[];
  non_negotiables: NonNegotiables;
}

export async function saveTargets(payload: TargetsPayload): Promise<ApiResult> {
  return postJson('/api/onboarding/targets', payload);
}

/** Fetch the current onboarding state for the authenticated user. */
export async function fetchOnboardingState(): Promise<OnboardingRecord | null> {
  try {
    const res = await fetch('/api/onboarding', {
      headers: { Accept: 'application/json' },
    });

    if (res.status === 204 || res.status === 404) {
      return null;
    }

    if (!res.ok) {
      return null;
    }

    return (await res.json()) as OnboardingRecord;
  } catch {
    return null;
  }
}

export type { OnboardingRecord };
