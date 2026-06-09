/**
 * Opportunity_Scanner — MCF discovery and persistence (Task 12.1).
 *
 * Implements the `OpportunityScanner` contract from the design document and
 * Requirements 7.1, 7.2, 7.3:
 *
 *   7.1  WHEN one day has elapsed since the previous scan for a User, THE
 *        Opportunity_Scanner SHALL query the MyCareersFuture API for jobs
 *        matching the User's target roles and industries.
 *   7.2  WHEN the Opportunity_Scanner retrieves a job, THE Opportunity_Scanner
 *        SHALL store the job's company, role title, salary range, description,
 *        posting date, source URL, and employer contact email in the Jobs table.
 *   7.3  WHEN a scan completes for a User, THE Opportunity_Scanner SHALL update
 *        the User's last scan timestamp.
 *
 * Design notes:
 *  - The MCF HTTP client and the DynamoDB wrapper are **injectable** so the
 *    scanner is unit/integration testable without touching the network or AWS
 *    (see task 12.3). The default MCF client is built from an injectable
 *    `fetch`-like function.
 *  - The daily gate is evaluated against the User's persisted `last_scan_at`
 *    (per the design's elapsed-time scheduling semantics), so the scanner is a
 *    no-op when invoked again too soon — even if EventBridge fires more often.
 *  - **Exa fallback SEAM (task 12.2):** discovery is funnelled through a single
 *    {@link OpportunityScannerImpl.discover} method that runs the MCF search and,
 *    on MCF error/timeout, delegates to an optional injected `exaFallback`
 *    function (Req 7.4 / 8.3). Task 12.1 leaves `exaFallback` unset — when it is
 *    absent the MCF error propagates. Task 12.2 supplies the implementation
 *    (built on the Singapore-scoped query builder in `./exaQuery`) without
 *    changing this module's flow.
 */

import { randomUUID } from 'node:crypto';
import {
  DynamoDBWrapper,
  type DiscoveredJob,
  type DynamoItem,
  type Logger,
  type OpportunityScanner,
  type UserConfig,
  createLogger,
} from '@worksignal/shared';
import { MAX_JOBS_PER_SCAN, SCAN_LOOKBACK_DAYS } from '../config.js';

/* ------------------------------------------------------------------ *
 * Constants
 * ------------------------------------------------------------------ */

/** Minimum elapsed time between scans for a user (Req 7.1): one day. */
export const SCAN_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Base URL of the MyCareersFuture API (design: Opportunity_Scanner). */
export const MCF_API_BASE = 'https://api.mycareersfuture.gov.sg';

/** Default DynamoDB table names (design Data Models). */
export const DEFAULT_USERS_TABLE = 'Users';
export const DEFAULT_JOBS_TABLE = 'Jobs';

/** Default number of MCF results requested per search term. */
const DEFAULT_SEARCH_LIMIT = 20;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/* ------------------------------------------------------------------ *
 * Injectable HTTP surface
 * ------------------------------------------------------------------ */

/** Minimal structural subset of the `Response` shape the scanner relies on. */
export interface FetchResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

/** Minimal `fetch`-like function the default MCF client is built from. */
export type FetchLike = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<FetchResponseLike>;

/** Parameters for a single MCF search request. */
export interface McfSearchParams {
  /** Free-text search term (a target role or industry). */
  search: string;
  limit?: number;
  page?: number;
}

/**
 * Injectable MCF search function. Returns the raw MCF job records for a single
 * search term. The default implementation ({@link createMcfSearch}) issues an
 * HTTP request via a `fetch`-like function; tests inject a fake.
 */
export type McfSearchFn = (params: McfSearchParams) => Promise<RawMcfJob[]>;

/* ------------------------------------------------------------------ *
 * Raw MCF job shape (untrusted external input — every field optional)
 * ------------------------------------------------------------------ */

/**
 * The subset of the MyCareersFuture `v2/search` result shape the scanner maps.
 * Treated as untrusted input: every field is optional and defensively handled.
 */
export interface RawMcfJob {
  uuid?: string;
  title?: string;
  description?: string;
  postedCompany?: { name?: string } | null;
  hiringCompany?: { name?: string } | null;
  salary?: { minimum?: number; maximum?: number } | null;
  employmentTypes?: Array<{ employmentType?: string }> | null;
  categories?: Array<{ category?: string }> | null;
  address?: { country?: { description?: string } } | null;
  metadata?: {
    newPostingDate?: string;
    originalPostingDate?: string;
    jobDetailsUrl?: string;
  } | null;
  /** Some listings expose an application contact email; usually absent. */
  applicationEmail?: string | null;
  /** Heuristic EP-sponsorship signal when the feed provides one. */
  employeeSponsorship?: boolean | null;
}

/* ------------------------------------------------------------------ *
 * Exa fallback seam (implemented by task 12.2)
 * ------------------------------------------------------------------ */

/** Context handed to the Exa fallback when MCF discovery fails (Req 7.4). */
export interface ExaFallbackContext {
  user: UserConfig;
  /** ISO timestamp stamped on jobs discovered in this scan. */
  scannedAt: string;
  /** The MCF error/timeout that triggered the fallback. */
  error: unknown;
}

/**
 * Exa fallback discovery function (task 12.2). Given the failing MCF context it
 * returns the discovered jobs (already mapped to {@link DiscoveredJob}), which
 * the scanner persists exactly like MCF results. Left unset in task 12.1.
 */
export type ExaFallbackFn = (
  ctx: ExaFallbackContext,
) => Promise<DiscoveredJob[]>;

/* ------------------------------------------------------------------ *
 * Scanner dependencies
 * ------------------------------------------------------------------ */

export interface OpportunityScannerDeps {
  /** DynamoDB wrapper (injectable; defaults to a real client). */
  db?: DynamoDBWrapper;
  /**
   * MCF search function. If omitted, a default is built from {@link fetchFn}
   * (which itself defaults to the global `fetch`).
   */
  mcfSearch?: McfSearchFn;
  /** `fetch`-like function used to build the default MCF client. */
  fetchFn?: FetchLike;
  /** Override the MCF API base URL (used by the default client). */
  mcfApiBase?: string;
  /**
   * Exa fallback discovery (task 12.2). When unset, MCF errors propagate; this
   * is the seam task 12.2 fills without altering the scan flow.
   */
  exaFallback?: ExaFallbackFn;
  /** Clock injection for deterministic tests. Defaults to `() => new Date()`. */
  now?: () => Date;
  /** Job-id generator for listings missing a UUID. Defaults to `randomUUID`. */
  generateJobId?: () => string;
  logger?: Logger;
  usersTable?: string;
  jobsTable?: string;
  /** Override the daily scan interval (ms). Defaults to {@link SCAN_INTERVAL_MS}. */
  scanIntervalMs?: number;
  /** MCF results requested per search term. */
  searchLimit?: number;
  /** Cap on total jobs kept after dedup + recency filter. Defaults to MAX_JOBS_PER_SCAN. */
  maxJobsPerScan?: number;
  /** Only keep jobs posted within this many days. Defaults to SCAN_LOOKBACK_DAYS. */
  scanLookbackDays?: number;
}

/* ------------------------------------------------------------------ *
 * Default MCF client
 * ------------------------------------------------------------------ */

/**
 * Build a default {@link McfSearchFn} from a `fetch`-like function. Issues a
 * `POST {base}/v2/search?limit&page` request and returns the `results` array.
 * A non-OK response throws, which routes the scan to the Exa fallback seam.
 */
export function createMcfSearch(
  fetchFn: FetchLike,
  base: string = MCF_API_BASE,
): McfSearchFn {
  return async ({ search, limit = DEFAULT_SEARCH_LIMIT, page = 0 }) => {
    const url = `${base}/v2/search?limit=${limit}&page=${page}`;
    const res = await fetchFn(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({ search, sortBy: ['new_posting_date'] }),
    });
    if (!res.ok) {
      throw new Error(`MCF API error: HTTP ${res.status}`);
    }
    const data = (await res.json()) as { results?: RawMcfJob[] };
    return Array.isArray(data.results) ? data.results : [];
  };
}

/* ------------------------------------------------------------------ *
 * Pure mapping helpers (exported for unit tests)
 * ------------------------------------------------------------------ */

/** Normalise an MCF employment-type string to the Pre_Filter vocabulary. */
export function normaliseEmploymentType(raw: string | undefined): string {
  const v = (raw ?? '').toLowerCase();
  if (v.includes('part')) return 'part_time';
  if (v.includes('contract') || v.includes('temporary')) return 'contract';
  return 'full_time';
}

/** Coerce a possibly-missing/invalid number to a finite non-negative value. */
function safeNumber(value: number | undefined | null): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

/** Resolve the posting date to an ISO timestamp, falling back to `scannedAt`. */
export function resolvePostedAt(job: RawMcfJob, scannedAt: string): string {
  const raw =
    job.metadata?.originalPostingDate ?? job.metadata?.newPostingDate ?? null;
  if (raw) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return scannedAt;
}

/** Days the listing has been live, relative to now (FCF 14-day rule, Req 10.7). */
export function computeListingDays(postedAtIso: string, now: Date): number {
  const posted = new Date(postedAtIso).getTime();
  if (Number.isNaN(posted)) return 0;
  const days = Math.floor((now.getTime() - posted) / MS_PER_DAY);
  return days > 0 ? days : 0;
}

/** Build the public MCF listing URL for a job. */
function buildSourceUrl(job: RawMcfJob, base: string): string {
  if (job.metadata?.jobDetailsUrl) return job.metadata.jobDetailsUrl;
  const id = job.uuid ?? '';
  return `${base.replace('api.', 'www.')}/job/${id}`;
}

/** Heuristic EP-sponsorship signal from explicit field or description text. */
export function deriveSponsorshipSignal(job: RawMcfJob): boolean {
  if (typeof job.employeeSponsorship === 'boolean') {
    return job.employeeSponsorship;
  }
  const text = (job.description ?? '').toLowerCase();
  return (
    text.includes('employment pass') ||
    text.includes('ep sponsorship') ||
    text.includes('visa sponsorship') ||
    text.includes('sponsorship available')
  );
}

/**
 * Map a single raw MCF job to the persisted {@link DiscoveredJob} shape (Req 7.2).
 * Pure and defensive against missing fields.
 */
export function mapMcfJob(
  job: RawMcfJob,
  userId: string,
  scannedAt: string,
  now: Date,
  options: { mcfApiBase: string; generateJobId: () => string },
): DiscoveredJob {
  const postedAt = resolvePostedAt(job, scannedAt);
  const company =
    job.postedCompany?.name ?? job.hiringCompany?.name ?? 'Unknown';
  const location = job.address?.country?.description ?? 'Singapore';

  return {
    job_id: job.uuid ?? options.generateJobId(),
    user_id: userId,
    company,
    role_title: job.title ?? 'Unknown',
    salary_min: safeNumber(job.salary?.minimum),
    salary_max: safeNumber(job.salary?.maximum),
    jd_text: job.description ?? '',
    posted_at: postedAt,
    source_url: buildSourceUrl(job, options.mcfApiBase),
    employer_email: job.applicationEmail ?? null,
    employment_type: normaliseEmploymentType(job.employmentTypes?.[0]?.employmentType),
    work_arrangement: 'any',
    location,
    ep_sponsorship_signal: deriveSponsorshipSignal(job),
    mcf_listing_days: computeListingDays(postedAt, now),
    scanned_at: scannedAt,
  };
}

/** De-duplicate raw MCF jobs across multiple search terms. */
function dedupeRawJobs(jobs: RawMcfJob[]): RawMcfJob[] {
  const seen = new Set<string>();
  const out: RawMcfJob[] = [];
  for (const job of jobs) {
    const key =
      job.uuid ?? `${job.title ?? ''}::${job.postedCompany?.name ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(job);
  }
  return out;
}

/**
 * Drop jobs older than `lookbackDays`. Called after mapping so we can reuse
 * the already-computed `mcf_listing_days` field rather than re-parsing dates.
 */
function filterByRecency(jobs: DiscoveredJob[], lookbackDays: number): DiscoveredJob[] {
  return jobs.filter((j) => j.mcf_listing_days <= lookbackDays);
}

/* ------------------------------------------------------------------ *
 * Scanner implementation
 * ------------------------------------------------------------------ */

export class OpportunityScannerImpl implements OpportunityScanner {
  private readonly db: DynamoDBWrapper;
  private readonly mcfSearch: McfSearchFn;
  private readonly exaFallback?: ExaFallbackFn;
  private readonly now: () => Date;
  private readonly generateJobId: () => string;
  private readonly logger: Logger;
  private readonly usersTable: string;
  private readonly jobsTable: string;
  private readonly scanIntervalMs: number;
  private readonly searchLimit: number;
  private readonly maxJobsPerScan: number;
  private readonly scanLookbackDays: number;
  private readonly mcfApiBase: string;

  constructor(deps: OpportunityScannerDeps = {}) {
    this.db = deps.db ?? new DynamoDBWrapper();
    this.mcfApiBase = deps.mcfApiBase ?? MCF_API_BASE;
    this.mcfSearch =
      deps.mcfSearch ??
      createMcfSearch(
        deps.fetchFn ?? (globalThis.fetch as unknown as FetchLike),
        this.mcfApiBase,
      );
    this.exaFallback = deps.exaFallback;
    this.now = deps.now ?? (() => new Date());
    this.generateJobId = deps.generateJobId ?? (() => randomUUID());
    this.logger = deps.logger ?? createLogger({ context: { component: 'Opportunity_Scanner' } });
    this.usersTable = deps.usersTable ?? DEFAULT_USERS_TABLE;
    this.jobsTable = deps.jobsTable ?? DEFAULT_JOBS_TABLE;
    this.scanIntervalMs = deps.scanIntervalMs ?? SCAN_INTERVAL_MS;
    this.searchLimit = deps.searchLimit ?? DEFAULT_SEARCH_LIMIT;
    this.maxJobsPerScan = deps.maxJobsPerScan ?? MAX_JOBS_PER_SCAN;
    this.scanLookbackDays = deps.scanLookbackDays ?? SCAN_LOOKBACK_DAYS;
  }

  /**
   * Scan for new jobs for a user (Req 7.1–7.3).
   *
   * No-op (returns `[]`) when fewer than 24 hours have elapsed since the
   * user's `last_scan_at`. Otherwise discovers jobs (MCF, with the Exa fallback
   * seam), persists each to the Jobs table, and stamps `last_scan_at`.
   */
  async scan(userId: string): Promise<DiscoveredJob[]> {
    const user = (await this.db.get(this.usersTable, {
      user_id: userId,
    })) as UserConfig | undefined;
    if (!user) {
      throw new Error(`Opportunity_Scanner: user not found: ${userId}`);
    }

    const log = this.logger.child({ userId });

    if (!this.isScanDue(user)) {
      log.debug('Scan skipped: daily interval not yet elapsed', {
        last_scan_at: user.last_scan_at,
      });
      return [];
    }

    const scannedAt = this.now().toISOString();
    const jobs = await this.discover(user, scannedAt, log);

    // Persist each discovered job to the Jobs table (Req 7.2).
    await Promise.all(
      jobs.map((job) =>
        this.db.put(this.jobsTable, job as unknown as DynamoItem),
      ),
    );

    // Update last_scan_at on completion (Req 7.3).
    await this.db.update(this.usersTable, { user_id: userId }, {
      UpdateExpression: 'SET last_scan_at = :ts',
      ExpressionAttributeValues: { ':ts': scannedAt },
    });

    log.info('Scan completed', { discovered: jobs.length, last_scan_at: scannedAt });
    return jobs;
  }

  /** True when 24 hours have elapsed since the user's last scan (Req 7.1). */
  private isScanDue(user: UserConfig): boolean {
    if (!user.last_scan_at) return true;
    const last = new Date(user.last_scan_at).getTime();
    if (Number.isNaN(last)) return true;
    return this.now().getTime() - last >= this.scanIntervalMs;
  }

  /**
   * Discover jobs for a user. Runs the MCF search across the user's target
   * roles and industries (Req 7.1) and maps the results to {@link DiscoveredJob}.
   *
   * SEAM (task 12.2 / Req 7.4): on MCF error or timeout this delegates to the
   * injected {@link ExaFallbackFn} when present; otherwise the error propagates.
   */
  private async discover(
    user: UserConfig,
    scannedAt: string,
    log: Logger,
  ): Promise<DiscoveredJob[]> {
    const now = this.now();
    try {
      const raw = await this.runMcfSearch(user);
      const mapped = dedupeRawJobs(raw).map((job) =>
        mapMcfJob(job, user.user_id, scannedAt, now, {
          mcfApiBase: this.mcfApiBase,
          generateJobId: this.generateJobId,
        }),
      );
      return filterByRecency(mapped, this.scanLookbackDays).slice(0, this.maxJobsPerScan);
    } catch (error) {
      log.warn('MCF discovery failed', { error: String(error) });
      if (this.exaFallback) {
        // Task 12.2 fills this seam with Singapore-scoped Exa discovery.
        return this.exaFallback({ user, scannedAt, error });
      }
      throw error;
    }
  }

  /** Query MCF once per target role/industry term and aggregate results. */
  private async runMcfSearch(user: UserConfig): Promise<RawMcfJob[]> {
    const terms = this.buildSearchTerms(user);
    const batches = await Promise.all(
      terms.map((search) =>
        this.mcfSearch({ search, limit: this.searchLimit, page: 0 }),
      ),
    );
    return batches.flat();
  }

  /** Build the set of MCF search terms from the user's targets (Req 7.1). */
  private buildSearchTerms(user: UserConfig): string[] {
    const roles = user.profile?.target_roles ?? [];
    const industries = user.profile?.target_industries ?? [];
    const terms = [...roles, ...industries]
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    const unique = [...new Set(terms)];
    // Guarantee at least one query so a scan always reaches MCF.
    return unique.length > 0 ? unique : [''];
  }
}

/** Convenience factory mirroring the {@link OpportunityScannerImpl} constructor. */
export function createOpportunityScanner(
  deps?: OpportunityScannerDeps,
): OpportunityScannerImpl {
  return new OpportunityScannerImpl(deps);
}
