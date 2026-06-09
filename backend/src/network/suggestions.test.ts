import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type {
  NetworkConnectionType,
  NetworkSuggestion,
} from '@worksignal/shared';
import { capAndOrderSuggestions, NETWORK_SUGGESTION_CAP } from './suggestions.js';

/**
 * Priority rank per connection tier, mirroring the spec ordering
 * alumni -> community -> cold (Req 20.3). Used by the test to assert ordering
 * independently of the implementation's internal table.
 */
const TIER_RANK: Record<NetworkConnectionType, number> = {
  alumni: 0,
  community: 1,
  cold: 2,
};

/** Arbitrary connection tier. */
const connectionTypeArb: fc.Arbitrary<NetworkConnectionType> = fc.constantFrom(
  'alumni',
  'community',
  'cold',
);

/** Arbitrary, well-formed NetworkSuggestion with a mixed tier. */
const suggestionArb: fc.Arbitrary<NetworkSuggestion> = fc.record({
  name: fc.string(),
  type: connectionTypeArb,
  context: fc.string(),
  outreach_draft: fc.string(),
});

/**
 * Arbitrary candidate set of any size (including empty), with mixed connection
 * types so every ordering branch is exercised.
 */
const candidatesArb: fc.Arbitrary<NetworkSuggestion[]> = fc.array(
  suggestionArb,
  { maxLength: 20 },
);

/** Reference-equality membership check (identity, not structural). */
function containsByIdentity(
  haystack: readonly NetworkSuggestion[],
  needle: NetworkSuggestion,
): boolean {
  return haystack.some((item) => item === needle);
}

describe('capAndOrderSuggestions', () => {
  // Feature: worksignal, Property 18: Network_Agent suggestion cap and ordering
  // Validates: Requirements 20.3
  it('caps at three, orders alumni -> community -> cold, and only returns inputs', () => {
    fc.assert(
      fc.property(candidatesArb, (candidates) => {
        const result = capAndOrderSuggestions(candidates);

        // (a) Cap: result length never exceeds NETWORK_SUGGESTION_CAP (3),
        // and never exceeds the number of candidates available.
        expect(result.length).toBeLessThanOrEqual(NETWORK_SUGGESTION_CAP);
        expect(result.length).toBeLessThanOrEqual(candidates.length);

        // (b) Ordering by tier: every alumni precedes every community member,
        // which precedes every cold contact. Tier ranks are non-decreasing.
        for (let i = 1; i < result.length; i += 1) {
          expect(TIER_RANK[result[i - 1]!.type]).toBeLessThanOrEqual(
            TIER_RANK[result[i]!.type],
          );
        }

        // (c) Subset: every returned suggestion is one of the input items.
        for (const suggestion of result) {
          expect(containsByIdentity(candidates, suggestion)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  // Feature: worksignal, Property 18: Network_Agent suggestion cap and ordering
  // Validates: Requirements 20.3
  it('never drops a higher-priority tier in favour of a lower one (cap applied after ordering)', () => {
    fc.assert(
      fc.property(candidatesArb, (candidates) => {
        const result = capAndOrderSuggestions(candidates);

        // For each tier present in the result, no higher-priority candidate
        // from the input was omitted: the count kept per tier must equal
        // min(available, remaining capacity) when filling in priority order.
        const orderedTiers: NetworkConnectionType[] = ['alumni', 'community', 'cold'];
        let remaining = NETWORK_SUGGESTION_CAP;
        for (const tier of orderedTiers) {
          const available = candidates.filter((c) => c.type === tier).length;
          const expectedKept = Math.min(available, Math.max(remaining, 0));
          const actualKept = result.filter((c) => c.type === tier).length;
          expect(actualKept).toBe(expectedKept);
          remaining -= expectedKept;
        }
      }),
      { numRuns: 100 },
    );
  });
});
