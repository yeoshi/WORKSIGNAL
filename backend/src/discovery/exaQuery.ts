/**
 * Exa Singapore-scoped query builder (Task 3.3).
 *
 * Implements the Opportunity_Scanner rule from the design document and
 * Requirement 8.3:
 *
 *   "When the Opportunity_Scanner issues an Exa research query, THE
 *    Opportunity_Scanner SHALL append the term Singapore to the query."
 *
 * Every research query the scanner sends to Exa must be geographically scoped
 * to Singapore. This module provides a single **pure, deterministic** function
 * that takes an arbitrary query input and returns a query string that is
 * guaranteed to contain the term `Singapore`.
 *
 * Key invariant (Property 6 — "Exa queries are Singapore-scoped"): for *any*
 * input, the emitted query string contains the exact term `Singapore`.
 *
 * The builder is idempotent with respect to that exact term: if the input
 * already contains `Singapore`, it is returned (trimmed) without a second
 * append, avoiding redundant `... Singapore Singapore` scoping. The presence
 * check uses the exact-cased term so the invariant holds unconditionally —
 * an input that only mentions a differently-cased "singapore" still has the
 * canonical `Singapore` term appended.
 *
 * The function performs no I/O and is therefore directly property-testable
 * (see Property 6, task 3.4).
 */

/** The Singapore scoping term appended to every Exa research query. */
export const SINGAPORE_SCOPE_TERM = 'Singapore';

/**
 * Build a Singapore-scoped Exa research query from an arbitrary input.
 *
 * The returned string always contains the term {@link SINGAPORE_SCOPE_TERM}.
 * Behaviour:
 *  - Surrounding whitespace on the input is trimmed.
 *  - An empty or whitespace-only input yields just `Singapore`.
 *  - If the trimmed input already contains the exact term `Singapore`, it is
 *    returned unchanged (idempotent — no double scoping).
 *  - Otherwise the term `Singapore` is appended, separated by a single space.
 *
 * @param query  The raw research query to scope (any string).
 * @returns      A query string guaranteed to contain `Singapore`.
 */
export function buildSingaporeScopedQuery(query: string): string {
  const trimmed = query.trim();

  if (trimmed.length === 0) {
    return SINGAPORE_SCOPE_TERM;
  }

  if (trimmed.includes(SINGAPORE_SCOPE_TERM)) {
    return trimmed;
  }

  return `${trimmed} ${SINGAPORE_SCOPE_TERM}`;
}
