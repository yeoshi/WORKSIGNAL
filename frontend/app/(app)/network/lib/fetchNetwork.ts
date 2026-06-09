/**
 * Network Suggestions data loading (Req 20.5).
 *
 * The Network Suggestions view reads the authenticated user's current network
 * suggestion set from the relative `/api/network` BFF endpoint (wired in task
 * 24.1). Until that endpoint exists the view must tolerate its absence
 * gracefully, so this loader maps "no suggestions yet" responses (404 / 204 /
 * empty body) to `null` rather than throwing, letting the page render an empty
 * state.
 *
 * The parsing/normalisation is decoupled from React so it can be unit /
 * component tested in isolation.
 */

import type { NetworkSuggestionSet } from '@worksignal/shared';

/** Relative BFF endpoint serving the authenticated user's network suggestions. */
export const NETWORK_ENDPOINT = '/api/network';

/**
 * View-model for the Network Suggestions screen.
 *
 * Combines the target company, application count, connection suggestions, and
 * upcoming events. The `application_count` field is the number of applications
 * that triggered the Network_Agent for this company (≥2, Req 20.1).
 */
export interface NetworkData {
    /** Target company name. */
    company: string;
    /** Number of applications sent to this company (≥2, Req 20.1). */
    application_count: number;
    /** The full suggestion set from the Network_Agent. */
    suggestionSet: NetworkSuggestionSet;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object';
}

function isSuggestionSet(value: unknown): value is NetworkSuggestionSet {
    return (
        isRecord(value) &&
        typeof value.company === 'string' &&
        Array.isArray(value.suggestions) &&
        Array.isArray(value.upcoming_events)
    );
}

/**
 * Normalise a decoded `/api/network` body into a {@link NetworkData}.
 *
 * Tolerates several plausible envelopes so the view is resilient to the exact
 * BFF shape chosen in task 24.1:
 *  - a wrapped record: `{ network: { company, suggestions, upcoming_events } }`
 *  - a direct NetworkSuggestionSet with optional `application_count`
 *
 * Returns `null` when there is no data to show, which the page renders as an
 * empty state rather than an error.
 */
export function normalizeNetworkResponse(body: unknown): NetworkData | null {
    if (!isRecord(body)) {
        return null;
    }

    // Wrapped: { network: {...} }
    if (isRecord(body.network) && isSuggestionSet(body.network)) {
        const appCount =
            typeof body.application_count === 'number' ? body.application_count : 2;
        return {
            company: body.network.company,
            application_count: appCount,
            suggestionSet: body.network as NetworkSuggestionSet,
        };
    }

    // Direct NetworkSuggestionSet (possibly with extra fields).
    if (isSuggestionSet(body)) {
        const appCount =
            typeof body.application_count === 'number'
                ? (body.application_count as number)
                : 2;
        return {
            company: body.company,
            application_count: appCount,
            suggestionSet: body as NetworkSuggestionSet,
        };
    }

    return null;
}

/**
 * Fetch the current network suggestions once from the BFF endpoint.
 *
 * Resolves to `null` when no suggestions exist yet (endpoint absent or trigger
 * not met). Throws only on unexpected server errors so the caller can show a
 * retry affordance.
 */
export async function fetchNetworkOnce(
    signal?: AbortSignal,
    company?: string,
): Promise<NetworkData | null> {
    const endpoint = company
        ? `${NETWORK_ENDPOINT}?company=${encodeURIComponent(company)}`
        : NETWORK_ENDPOINT;

    let response: Response;
    try {
        response = await fetch(endpoint, {
            headers: { Accept: 'application/json' },
            signal,
        });
    } catch (error) {
        // Network failure (e.g. endpoint not wired yet) — treat as "no data".
        if (error instanceof DOMException && error.name === 'AbortError') {
            throw error;
        }
        return null;
    }

    // No suggestions available yet.
    if (response.status === 404 || response.status === 204) {
        return null;
    }

    if (!response.ok) {
        throw new Error(`Network request failed with status ${response.status}`);
    }

    const body: unknown = await response.json().catch(() => null);
    return normalizeNetworkResponse(body);
}
