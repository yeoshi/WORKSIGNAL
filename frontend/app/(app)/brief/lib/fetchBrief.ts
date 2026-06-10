/**
 * Weekly Brief data loading (Req 21.5).
 *
 * Fetches the most recent recalibration log entry from the `/api/brief`
 * BFF endpoint (wired in task 24.1). Tolerates endpoint absence gracefully,
 * returning `null` for an empty state rather than throwing.
 */

import type { RecalibrationLogEntry } from '@/app/types/shared';
import type { BriefGrowthActivity, BriefNetworkActivity } from './briefTypes';

/** Relative BFF endpoint serving the authenticated user's weekly brief. */
export const BRIEF_ENDPOINT = '/api/brief';

/**
 * View-model for the Weekly Brief screen.
 *
 * Wraps the {@link RecalibrationLogEntry} from the most recent recalibration.
 */
export type WeeklyBrief = RecalibrationLogEntry & {
    growth_activities?: BriefGrowthActivity[];
    network_activities?: BriefNetworkActivity[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object';
}

/**
 * Normalise a decoded `/api/brief` body into a {@link WeeklyBrief}.
 *
 * Tolerates envelopes like `{ brief: {...} }` or the raw entry itself.
 * Returns `null` when there is no brief to show.
 */
export function normalizeBriefResponse(body: unknown): WeeklyBrief | null {
    if (!isRecord(body)) {
        return null;
    }

    // Wrapped: { brief: {...} }
    if (isRecord(body.brief)) {
        return normalizeBriefResponse(body.brief);
    }

    // Validate as a RecalibrationLogEntry — must have metrics and agent_performance
    if (
        isRecord(body.metrics) &&
        typeof (body.metrics as Record<string, unknown>).applications_sent === 'number' &&
        typeof (body.metrics as Record<string, unknown>).callbacks === 'number' &&
        typeof (body.metrics as Record<string, unknown>).callback_rate === 'number' &&
        isRecord(body.agent_performance)
    ) {
        const brief = body as unknown as WeeklyBrief;
        if (!Array.isArray(brief.growth_activities)) {
            brief.growth_activities = [];
        }
        if (!Array.isArray(brief.network_activities)) {
            brief.network_activities = [];
        }
        return brief;
    }

    return null;
}

/**
 * Fetch the most recent weekly brief from the BFF endpoint.
 *
 * Resolves to `null` when no brief exists yet (endpoint absent or no
 * recalibration has run). Throws only on unexpected server errors.
 */
export async function fetchBriefOnce(signal?: AbortSignal): Promise<WeeklyBrief | null> {
    let response: Response;
    try {
        response = await fetch(BRIEF_ENDPOINT, {
            headers: { Accept: 'application/json' },
            signal,
        });
    } catch (error) {
        // Network failure (e.g. endpoint not wired yet) — treat as "no brief".
        if (error instanceof DOMException && error.name === 'AbortError') {
            throw error;
        }
        return null;
    }

    // No brief available yet.
    if (response.status === 404 || response.status === 204) {
        return null;
    }

    if (!response.ok) {
        throw new Error(`Brief request failed with status ${response.status}`);
    }

    const body: unknown = await response.json().catch(() => null);
    return normalizeBriefResponse(body);
}
