/**
 * Exa fallback discovery with Singapore scoping (Task 12.2).
 *
 * Implements the Opportunity_Scanner fallback path from the design document and
 * Requirements 7.4 and 8.3:
 *
 *   7.4  IF the MyCareersFuture API returns an error or does not respond, THEN
 *        THE Opportunity_Scanner SHALL fall back to Exa-based job discovery for
 *        that scan.
 *   8.3  WHEN the Opportunity_Scanner issues an Exa research query, THE
 *        Opportunity_Scanner SHALL append the term Singapore to the query.
 *
 * The {@link OpportunityScannerImpl} already exposes a SEAM — an injectable
 * `exaFallback?: ExaFallbackFn` invoked on MCF error/timeout — so this module
 * only needs to *produce* such a function. This file does NOT modify the
 * scanner; it imports the seam types and plugs into them.
 *
 * Design notes:
 *  - The Exa client is **injectable** ({@link ExaSearchFn}) so the fallback is
 *    unit/integration testable without touching the network (see task 12.3).
 *    The default client is built from a `fetch`-like function via
 *    {@link createExaSearch}.
 *  - Research queries are built from the user's target roles/industries and run
 *    through {@link buildSingaporeScopedQuery} (Req 8.3) so every query that
 *    reaches Exa is guaranteed to contain the term `Singapore`.
 *  - Exa results are mapped into the same {@link DiscoveredJob} shape the
 *    scanner persists for MCF results, so the scan flow is identical downstream.
 */

import { randomUUID } from 'node:crypto';
import {
  type DiscoveredJob,
  type Logger,
  type UserConfig,
  createLogger,
} from '@worksignal/shared';
import { buildSingaporeScopedQuery } from './exaQuery.js';
import type {
  ExaFallbackContext,
  ExaFallbackFn,
  FetchLike,
  OpportunityScannerDeps,
} from './opportunityScanner.js';

/* ------------------------------------------------------------------ *
 * Constants
 * ------------------------------------------------------------------ */

/** Base URL of the Exa search API. */
export const EXA_API_BASE = 'https://api.exa.ai';

/** Default number of results requested per Exa research query. */
const DEFAULT_NUM_RESULTS = 10;

/**
 * Suffix appended to each target term to phrase it as a job-discovery research
 * query before the Singapore scope term is added (Req 8.3 via
 * {@link buildSingaporeScopedQuery}).
 */
const RESEARCH_QUERY_SUFFIX = 'job openings hiring';

/* ------------------------------------------------------------------ *
 * Injectable Exa client surface
 * ------------------------------------------------------------------ */

/** Parameters for a single Exa search request. */
export interface ExaSearchParams {
  /** The Singapore-scoped research query (already passes through the builder). */
  query: string;
  numResults?: number;
}

/**
 * The subset of an Exa `/search` result the fallback maps. Treated as
 * untrusted external input: every field is optional and defensively handled.
 */
export interface RawExaResult {
  id?: string;
  url?: string;
  title?: string;
  text?: string | null;
  publishedDate?: string | null;
  author?: string | null;
}

/**
 * Injectable Exa search function. Returns the raw Exa results for a single
 * query. The default implementation ({@link createExaSearch}) issues an HTTP
 * request via a `fetch`-like function; tests inject a fake.
 */
export type ExaSearchFn = (params: ExaSearchParams) => Promise<RawExaResult[]>;

/* ------------------------------------------------------------------ *
 * Default Exa client
 * ------------------------------------------------------------------ */

/**
 * Build a default {@link ExaSearchFn} from a `fetch`-like function. Issues a
 * `POST {base}/search` request and returns the `results` array. A non-OK
 * response throws so the surrounding scan surfaces the failure.
 */
export function createExaSearch(
  fetchFn: FetchLike,
  options: { apiKey?: string; base?: string } = {},
): ExaSearchFn {
  const base = options.base ?? EXA_API_BASE;
  return async ({ query, numResults = DEFAULT_NUM_RESULTS }) => {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json',
    };
    if (options.apiKey) {
      headers['x-api-key'] = options.apiKey;
    }
    const res = await fetchFn(`${base}/search`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, numResults, type: 'auto' }),
    });
    if (!res.ok) {
      throw new Error(`Exa API error: HTTP ${res.status}`);
    }
    const data = (await res.json()) as { results?: RawExaResult[] };
    return Array.isArray(data.results) ? data.results : [];
  };
}

/* ------------------------------------------------------------------ *
 * Pure helpers (exported for unit tests)
 * ------------------------------------------------------------------ */

/**
 * Build the Singapore-scoped Exa research queries from the user's target roles
 * and industries (Req 8.3). Each term is phrased as a job-discovery query and
 * scoped via {@link buildSingaporeScopedQuery}; the result set is de-duplicated.
 * When the user has no targets, a single generic Singapore-scoped query is used
 * so the fallback always reaches Exa.
 */
export function buildExaQueries(user: UserConfig): string[] {
  const roles = user.profile?.target_roles ?? [];
  const industries = user.profile?.target_industries ?? [];
  const terms = [...roles, ...industries]
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const base = terms.length > 0 ? terms : ['jobs'];
  const queries = base.map((term) =>
    buildSingaporeScopedQuery(`${term} ${RESEARCH_QUERY_SUFFIX}`),
  );
  return [...new Set(queries)];
}

/** Heuristic EP-sponsorship signal derived from Exa result text. */
export function deriveExaSponsorshipSignal(result: RawExaResult): boolean {
  const text = `${result.title ?? ''} ${result.text ?? ''}`.toLowerCase();
  return (
    text.includes('employment pass') ||
    text.includes('ep sponsorship') ||
    text.includes('visa sponsorship') ||
    text.includes('sponsorship available')
  );
}

/** Resolve an Exa result's published date to an ISO timestamp, else `scannedAt`. */
export function resolveExaPostedAt(
  result: RawExaResult,
  scannedAt: string,
): string {
  if (result.publishedDate) {
    const parsed = new Date(result.publishedDate);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return scannedAt;
}

/**
 * Map a single raw Exa result to the persisted {@link DiscoveredJob} shape —
 * the same shape the scanner persists for MCF results. Pure and defensive.
 *
 * Exa research results carry no structured salary, employment, or contact
 * fields, so those are set to neutral defaults (`0` salary, `full_time`,
 * `any` arrangement, `null` employer email). The Pre_Filter still applies its
 * non-negotiable checks downstream. Location is `Singapore` because every query
 * is Singapore-scoped (Req 8.3).
 */
export function mapExaResult(
  result: RawExaResult,
  userId: string,
  scannedAt: string,
  options: { generateJobId: () => string },
): DiscoveredJob {
  const postedAt = resolveExaPostedAt(result, scannedAt);
  return {
    job_id: result.id ?? options.generateJobId(),
    user_id: userId,
    company: result.author?.trim() || 'Unknown',
    role_title: result.title?.trim() || 'Unknown',
    salary_min: 0,
    salary_max: 0,
    jd_text: result.text ?? result.title ?? '',
    posted_at: postedAt,
    source_url: result.url ?? '',
    employer_email: null,
    employment_type: 'full_time',
    work_arrangement: 'any',
    location: 'Singapore',
    ep_sponsorship_signal: deriveExaSponsorshipSignal(result),
    mcf_listing_days: 0,
    scanned_at: scannedAt,
  };
}

/** De-duplicate mapped jobs by `job_id`, keeping first occurrence. */
function dedupeJobs(jobs: DiscoveredJob[]): DiscoveredJob[] {
  const seen = new Set<string>();
  const out: DiscoveredJob[] = [];
  for (const job of jobs) {
    if (seen.has(job.job_id)) continue;
    seen.add(job.job_id);
    out.push(job);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Fallback factory
 * ------------------------------------------------------------------ */

export interface ExaFallbackDeps {
  /**
   * Exa search function. If omitted, a default is built from {@link fetchFn}
   * (which itself defaults to the global `fetch`).
   */
  exaSearch?: ExaSearchFn;
  /** `fetch`-like function used to build the default Exa client. */
  fetchFn?: FetchLike;
  /** Override the Exa API base URL (used by the default client). */
  exaApiBase?: string;
  /** Exa API key passed as `x-api-key` by the default client. */
  exaApiKey?: string;
  /** Results requested per Exa query. Defaults to {@link DEFAULT_NUM_RESULTS}. */
  numResults?: number;
  /** Job-id generator for results missing an id. Defaults to `randomUUID`. */
  generateJobId?: () => string;
  logger?: Logger;
}

/**
 * Produce an {@link ExaFallbackFn} for the Opportunity_Scanner's MCF-failure
 * seam (Req 7.4). The returned function builds Singapore-scoped research queries
 * from the user's targets (Req 8.3), runs them through the injected Exa client,
 * and maps the results into {@link DiscoveredJob}s for the scanner to persist.
 *
 * Queries run in parallel; an individual query failure is logged and skipped so
 * one bad query does not abort the whole fallback scan.
 */
export function createExaFallback(deps: ExaFallbackDeps = {}): ExaFallbackFn {
  const numResults = deps.numResults ?? DEFAULT_NUM_RESULTS;
  const generateJobId = deps.generateJobId ?? (() => randomUUID());
  const logger =
    deps.logger ??
    createLogger({ context: { component: 'Opportunity_Scanner.ExaFallback' } });
  const exaSearch =
    deps.exaSearch ??
    createExaSearch(deps.fetchFn ?? (globalThis.fetch as unknown as FetchLike), {
      apiKey: deps.exaApiKey,
      base: deps.exaApiBase,
    });

  return async ({ user, scannedAt, error }: ExaFallbackContext) => {
    const log = logger.child({ userId: user.user_id });
    log.info('Falling back to Exa discovery after MCF failure', {
      mcfError: String(error),
    });

    const queries = buildExaQueries(user);
    const batches = await Promise.all(
      queries.map(async (query) => {
        try {
          return await exaSearch({ query, numResults });
        } catch (queryError) {
          log.warn('Exa query failed; skipping', {
            query,
            error: String(queryError),
          });
          return [] as RawExaResult[];
        }
      }),
    );

    const jobs = dedupeJobs(
      batches
        .flat()
        .map((result) =>
          mapExaResult(result, user.user_id, scannedAt, { generateJobId }),
        ),
    );

    log.info('Exa fallback discovery completed', { discovered: jobs.length });
    return jobs;
  };
}

/**
 * Wiring helper: produce the partial {@link OpportunityScannerDeps} that plugs
 * an Exa fallback into the scanner. Spread the result into the scanner deps:
 *
 * ```ts
 * const scanner = createOpportunityScanner({
 *   db,
 *   ...withExaFallback({ exaApiKey: process.env.EXA_API_KEY }),
 * });
 * ```
 */
export function withExaFallback(
  deps?: ExaFallbackDeps,
): Pick<OpportunityScannerDeps, 'exaFallback'> {
  return { exaFallback: createExaFallback(deps) };
}
