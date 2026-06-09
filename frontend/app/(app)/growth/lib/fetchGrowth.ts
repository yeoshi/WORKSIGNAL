/**
 * Growth Roadmap data loading (Req 19.5).
 *
 * The Growth Roadmap view reads the authenticated user's current skill-gap
 * roadmap from the relative `/api/growth` BFF endpoint (wired in task 24.1).
 * Until that endpoint exists the view must tolerate its absence gracefully,
 * so this loader maps "no roadmap yet" responses (404 / 204 / empty body) to
 * `null` rather than throwing, letting the page render an empty state.
 *
 * The parsing/normalisation is intentionally decoupled from React so it can be
 * unit / component tested in isolation: `fetchGrowthOnce` accepts an optional
 * `AbortSignal`, and `normalizeGrowthResponse` is a pure function over the
 * decoded body.
 */

import type { SkillGapRoadmap } from '@worksignal/shared';

/** Relative BFF endpoint serving the authenticated user's growth roadmap. */
export const GROWTH_ENDPOINT = '/api/growth';

/**
 * View-model for the Growth Roadmap screen.
 *
 * Combines the identified skill gap (Req 19.5) with the four-week
 * {@link SkillGapRoadmap} produced by the Growth_Agent. `times_flagged`
 * mirrors the SkillGaps table column and is shown as supporting context when
 * the endpoint provides it.
 */
export interface GrowthRoadmap {
  /** The identified skill gap, e.g. "Kubernetes". */
  skill: string;
  /** How many distinct jobs flagged the gap (Req 19.1), when available. */
  times_flagged?: number;
  /** The four-week plan plus projected improvement and events (Req 19.3/19.4). */
  roadmap: SkillGapRoadmap;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function isRoadmap(value: unknown): value is SkillGapRoadmap {
  return (
    isRecord(value) &&
    Array.isArray(value.weeks) &&
    typeof value.projected_match_improvement === 'string'
  );
}

/**
 * Normalise a decoded `/api/growth` body into a {@link GrowthRoadmap}.
 *
 * Tolerates several plausible envelopes so the view is resilient to the exact
 * BFF shape chosen in task 24.1:
 *  - the SkillGaps record itself: `{ skill, times_flagged, roadmap }`
 *  - a wrapped record: `{ skillGap: { skill, roadmap } }`
 *  - a bare roadmap: `{ weeks, projected_match_improvement }`
 *
 * Returns `null` when there is no roadmap to show (empty/`null` body), which
 * the page renders as an empty state rather than an error.
 */
export function normalizeGrowthResponse(body: unknown): GrowthRoadmap | null {
  if (!isRecord(body)) {
    return null;
  }

  // Wrapped: { skillGap: {...} }
  if (isRecord(body.skillGap)) {
    return normalizeGrowthResponse(body.skillGap);
  }

  // Record with a nested roadmap: { skill, times_flagged, roadmap }
  if (isRoadmap(body.roadmap)) {
    const skill = typeof body.skill === 'string' ? body.skill : 'Identified skill gap';
    const result: GrowthRoadmap = { skill, roadmap: body.roadmap };
    if (typeof body.times_flagged === 'number') {
      result.times_flagged = body.times_flagged;
    }
    return result;
  }

  // Bare roadmap body.
  if (isRoadmap(body)) {
    const skill = typeof body.skill === 'string' ? body.skill : 'Identified skill gap';
    return { skill, roadmap: body };
  }

  return null;
}

/**
 * Fetch the current growth roadmap once from the BFF endpoint.
 *
 * Resolves to `null` when no roadmap exists yet (endpoint absent or no gap
 * flagged). Throws only on unexpected server errors so the caller can show a
 * retry affordance.
 */
export async function fetchGrowthOnce(signal?: AbortSignal): Promise<GrowthRoadmap | null> {
  let response: Response;
  try {
    response = await fetch(GROWTH_ENDPOINT, {
      headers: { Accept: 'application/json' },
      signal,
    });
  } catch (error) {
    // Network failure (e.g. endpoint not wired yet) — treat as "no roadmap".
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    return null;
  }

  // No roadmap available yet.
  if (response.status === 404 || response.status === 204) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Growth request failed with status ${response.status}`);
  }

  const body: unknown = await response.json().catch(() => null);
  return normalizeGrowthResponse(body);
}
