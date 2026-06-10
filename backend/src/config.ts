/**
 * Central runtime configuration — all env-driven tunables in one place.
 *
 * Add a new entry here whenever a magic number should be adjustable without
 * a code change. Each value reads from an environment variable and falls back
 * to a sensible default so the app works out-of-the-box in dev/test.
 *
 * For the hackathon demo MAX_JOBS_PER_SCAN=10 keeps Bedrock costs low and
 * verdict generation fast. Raise it for production.
 */

/** Maximum jobs stored per scan across all search terms (after dedup + recency filter). */
export const MAX_JOBS_PER_SCAN: number = parseInt(
  process.env.MAX_JOBS_PER_SCAN ?? '10',
  10,
);

/**
 * Only keep jobs posted within this many days (client-side recency filter).
 * MCF has no server-side date filter, so we sort by new_posting_date and
 * drop anything older than this window after fetching.
 */
export const SCAN_LOOKBACK_DAYS: number = parseInt(
  process.env.SCAN_LOOKBACK_DAYS ?? '14',
  10,
);

/**
 * When true, delete all existing Jobs and AgentVerdicts for the user before
 * running the pipeline. Useful for demo runs where you want a clean slate so
 * the dashboard shows only results from the current execution.
 *
 * Set CLEAR_OLD=true in .env.aws (or the environment) to enable.
 */
export const CLEAR_OLD: boolean =
  (process.env.CLEAR_OLD ?? 'false').toLowerCase() === 'true';
