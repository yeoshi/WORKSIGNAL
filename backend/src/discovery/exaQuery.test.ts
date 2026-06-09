/**
 * Property-based test for the Exa Singapore-scoped query builder (Task 3.4).
 *
 * Feature: worksignal, Property 6: Exa queries are Singapore-scoped
 *
 * Validates: Requirements 8.3
 *
 * Requirement 8.3: "When the Opportunity_Scanner issues an Exa research query,
 * THE Opportunity_Scanner SHALL append the term Singapore to the query."
 *
 * Property 6: for ANY arbitrary string input, the query produced by
 * `buildSingaporeScopedQuery` contains the term `Singapore`. This holds
 * unconditionally — for empty input, whitespace-only input, inputs that
 * already contain `Singapore`, and inputs that contain a differently-cased
 * "singapore".
 *
 * The generator uses arbitrary strings (`fc.string()`) and additionally mixes
 * in cases that already contain the scope term so both the append and the
 * idempotent branches are exercised. The test runs a minimum of 100 iterations.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { buildSingaporeScopedQuery, SINGAPORE_SCOPE_TERM } from './exaQuery.js';

describe('Feature: worksignal, Property 6: Exa queries are Singapore-scoped', () => {
  it('appends Singapore so the output always contains the scope term for any string input', () => {
    fc.assert(
      fc.property(
        // Arbitrary strings, including empty, whitespace, and ones already
        // containing the scope term (exact and differently-cased).
        fc.oneof(
          fc.string(),
          fc.constant(''),
          fc.constant('   '),
          fc
            .string()
            .map((s) => `${s} ${SINGAPORE_SCOPE_TERM}`),
          fc.string().map((s) => `${s} singapore`),
        ),
        (query) => {
          const result = buildSingaporeScopedQuery(query);
          expect(result.includes(SINGAPORE_SCOPE_TERM)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});
