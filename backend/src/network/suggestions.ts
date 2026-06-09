/**
 * Network_Agent suggestion cap and ordering (Network_Agent background flow).
 *
 * Pure, deterministic logic that takes the candidate connection suggestions
 * discovered for a company and produces the final, user-facing shortlist:
 * **at most three** suggestions, ordered **alumni first, community members
 * second, cold contacts last**.
 *
 * Design reference: design.md — Network_Agent (`buildSuggestions`, Req 20.3).
 * The Network_Agent searches Exa for people, alumni, community members, and
 * events; this module is the single source of truth for how the resulting
 * candidate set is ordered and capped before being stored / surfaced.
 *
 * Requirements:
 *  - 20.3: WHEN the Network_Agent produces connection suggestions, THE
 *          Network_Agent SHALL provide at most three suggestions and SHALL
 *          order them with alumni first, community members second, and cold
 *          contacts last.
 *
 * Correctness property (Property 18): *for all* candidate suggestion sets, the
 * returned list (a) has length at most {@link NETWORK_SUGGESTION_CAP}, (b) is a
 * subsequence-by-tier such that every alumni precedes every community member
 * and every community member precedes every cold contact, and (c) contains only
 * suggestions drawn from the input. The cap is applied **after** ordering, so
 * higher-priority tiers are never starved by lower-priority candidates.
 */

import type { NetworkConnectionType, NetworkSuggestion } from '@worksignal/shared';

/**
 * The maximum number of connection suggestions the Network_Agent surfaces for a
 * company (Req 20.3).
 */
export const NETWORK_SUGGESTION_CAP = 3;

/**
 * Priority rank for each connection tier: alumni first, community second, cold
 * last (Req 20.3). Lower numbers sort earlier.
 */
const TIER_ORDER: Record<NetworkConnectionType, number> = {
  alumni: 0,
  community: 1,
  cold: 2,
};

/**
 * Order candidate suggestions by connection tier and cap the result.
 *
 * The candidates are first sorted so that all alumni precede all community
 * members, which in turn precede all cold contacts (Req 20.3). The sort is
 * **stable**, so the relative order of candidates within the same tier (i.e.
 * the order in which they were discovered) is preserved. After ordering, the
 * list is truncated to at most {@link NETWORK_SUGGESTION_CAP} entries.
 *
 * Total and deterministic: any candidate array (including empty) yields a
 * well-formed result, and the same input always yields the same output. The
 * input array is not mutated.
 *
 * @param candidates - The candidate connection suggestions discovered for a
 *   company, in any order and of any size.
 * @returns At most {@link NETWORK_SUGGESTION_CAP} suggestions, ordered
 *   alumni -> community -> cold.
 */
export function capAndOrderSuggestions(
  candidates: readonly NetworkSuggestion[],
): NetworkSuggestion[] {
  return candidates
    .map((suggestion, index) => ({ suggestion, index }))
    .sort((a, b) => {
      const tierDelta =
        TIER_ORDER[a.suggestion.type] - TIER_ORDER[b.suggestion.type];
      // Preserve discovery order within a tier (stable sort guarantee).
      return tierDelta !== 0 ? tierDelta : a.index - b.index;
    })
    .slice(0, NETWORK_SUGGESTION_CAP)
    .map(({ suggestion }) => suggestion);
}
