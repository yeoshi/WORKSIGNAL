/**
 * Growth_Agent background flow (Task 18.1).
 *
 * Wires the pure-logic Growth modules to persistence and Exa research to
 * implement the Growth_Agent service contract (`GrowthAgent`) from the design
 * document ("Growth_Agent", Req 19):
 *
 *   19.1  WHEN the Realism_Agent flags the same skill gap for a User across
 *         three or more distinct jobs, THE Growth_Agent SHALL be triggered for
 *         that skill gap.
 *   19.2  WHEN the Growth_Agent is triggered for a skill gap, THE Growth_Agent
 *         SHALL search Exa for courses, projects, certifications, and Singapore
 *         events relevant to that skill gap.
 *   19.3  WHEN the Growth_Agent completes research for a skill gap, THE
 *         Growth_Agent SHALL produce a four-week roadmap in which each week
 *         specifies an action, a resource URL, a cost, a time estimate, and a
 *         resource type.
 *   19.4  WHEN the Growth_Agent produces a roadmap, THE Growth_Agent SHALL
 *         store the roadmap in the SkillGaps table with the skill, the times
 *         flagged, and a projected match-score improvement.
 *
 * Layering — this module is the integration layer only. The trigger condition
 * (Req 19.1 / Property 16) and the roadmap structure rule (Req 19.3 /
 * Property 17) are owned by sibling modules and are imported, never reimplemented:
 *  - {@link shouldTriggerGrowthAgent} / {@link countDistinctFlaggedJobs} from
 *    `./trigger.js`.
 *  - {@link assembleRoadmap} (the pure `buildRoadmap` constructor) and
 *    {@link isWellFormedRoadmap} from `./roadmap.js`.
 *
 * Both Exa and DynamoDB are injectable so this flow is testable without
 * touching the network or AWS.
 */

import {
  DynamoDBWrapper,
  createLogger,
  type GrowthAgent,
  type Logger,
  type NetworkingOpportunity,
  type RoadmapResourceType,
  type SkillGapRoadmap,
  type SkillGapStatus,
} from '@worksignal/shared';
import {
  countDistinctFlaggedJobs,
  shouldTriggerGrowthAgent,
} from './trigger.js';
import {
  buildRoadmap as assembleRoadmap,
  isWellFormedRoadmap,
  type RoadmapWeekInput,
} from './roadmap.js';

/* ------------------------------------------------------------------ *
 * Constants
 * ------------------------------------------------------------------ */

/** DynamoDB table holding per-skill gap roadmaps, keyed `(user_id, skill)`. */
export const SKILL_GAPS_TABLE = 'SkillGaps';

/** Default number of Exa results requested per research query (Req 19.2). */
const DEFAULT_NUM_RESULTS = 5;

/**
 * The four resource categories the Growth_Agent researches, one per roadmap
 * week, in week order 1 → 4 (Req 19.2, 19.3). The fourth is Singapore-scoped
 * networking events.
 */
const ROADMAP_CATEGORIES: readonly RoadmapResourceType[] = [
  'course',
  'project',
  'certification',
  'event',
];

/** Per-category defaults for fields Exa results do not carry (cost, time). */
const CATEGORY_DEFAULTS: Record<
  RoadmapResourceType,
  { cost: string; time_hours: number; verb: string }
> = {
  course: { cost: 'Varies', time_hours: 5, verb: 'Complete the course' },
  project: { cost: 'Free', time_hours: 8, verb: 'Build the project' },
  certification: { cost: 'Varies', time_hours: 6, verb: 'Work towards the certification' },
  event: { cost: 'Free', time_hours: 2, verb: 'Attend the event' },
};

/* ------------------------------------------------------------------ *
 * Injectable Exa client surface
 * ------------------------------------------------------------------ */

/**
 * The subset of an Exa result the Growth_Agent maps into a roadmap week.
 * Treated as untrusted external input: every field is optional and defensively
 * handled.
 */
export interface GrowthExaResult {
  url?: string;
  title?: string;
  text?: string | null;
  publishedDate?: string | null;
}

/** Parameters for a single Growth_Agent Exa research request. */
export interface GrowthExaSearchParams {
  /** The (Singapore-scoped, for events) research query. */
  query: string;
  numResults?: number;
}

/**
 * Injectable Exa search function (Req 19.2). The default raises a clear error
 * so production wiring must supply a real client; tests inject a fake.
 */
export type GrowthExaSearchFn = (
  params: GrowthExaSearchParams,
) => Promise<GrowthExaResult[]>;

/* ------------------------------------------------------------------ *
 * Persisted SkillGaps record shape
 * ------------------------------------------------------------------ */

/**
 * The SkillGaps item shape (design Data Models — Table: SkillGaps), keyed by
 * `(user_id, skill)`. `flagged_job_ids` is the distinct-job set the trigger
 * (Req 19.1) counts over.
 */
export interface SkillGapRecord {
  user_id: string;
  skill: string;
  times_flagged: number;
  first_flagged_at: string;
  flagged_job_ids: string[];
  roadmap?: SkillGapRoadmap;
  status: SkillGapStatus;
  /** Other service-owned fields preserved verbatim across saves. */
  [key: string]: unknown;
}

/* ------------------------------------------------------------------ *
 * Dependencies
 * ------------------------------------------------------------------ */

export interface GrowthAgentDeps {
  /** DynamoDB wrapper (injectable; defaults to a real client). */
  db?: DynamoDBWrapper;
  /** Exa search function (injectable; required for `buildRoadmap`). */
  exaSearch?: GrowthExaSearchFn;
  /** Override the SkillGaps table name. */
  tableName?: string;
  /** Results requested per Exa query. Defaults to {@link DEFAULT_NUM_RESULTS}. */
  numResults?: number;
  /** Injectable clock for deterministic `first_flagged_at`. Defaults to `Date`. */
  now?: () => Date;
  /**
   * Compute the projected match-score improvement string stored with the
   * roadmap (Req 19.4). Defaults to a heuristic over `times_flagged`.
   */
  projectMatchImprovement?: (skill: string, timesFlagged: number) => string;
  logger?: Logger;
}

/* ------------------------------------------------------------------ *
 * Pure helpers (exported for unit tests)
 * ------------------------------------------------------------------ */

/** Default Exa client: fails loudly so production must inject a real one. */
const NO_EXA: GrowthExaSearchFn = () => {
  throw new Error(
    'Growth_Agent requires an injected Exa search client (deps.exaSearch)',
  );
};

/**
 * Build the research query for a skill/category. Event queries are explicitly
 * Singapore-scoped (Req 19.2 — "Singapore events").
 */
export function buildGrowthQuery(
  skill: string,
  category: RoadmapResourceType,
): string {
  const trimmed = skill.trim();
  switch (category) {
    case 'course':
      return `${trimmed} online course`;
    case 'project':
      return `${trimmed} hands-on project tutorial`;
    case 'certification':
      return `${trimmed} professional certification`;
    case 'event':
      return `${trimmed} networking meetup event Singapore`;
    default:
      return trimmed;
  }
}

/** Default projected match-score improvement heuristic (Req 19.4). */
export function defaultProjectedImprovement(
  _skill: string,
  timesFlagged: number,
): string {
  // More frequently-flagged gaps close a larger share of the match gap.
  const improvement = Math.min(5 + Math.max(timesFlagged, 0) * 5, 30);
  return `+${improvement}% projected match improvement`;
}

/**
 * Map an Exa result (or absence of one) for a category into a well-formed
 * {@link RoadmapWeekInput}. Falls back to a search-anchored entry when Exa
 * returned nothing so the assembled roadmap stays well-formed (Req 19.3).
 */
export function toRoadmapWeekInput(
  skill: string,
  category: RoadmapResourceType,
  result: GrowthExaResult | undefined,
): RoadmapWeekInput {
  const defaults = CATEGORY_DEFAULTS[category];
  const title = result?.title?.trim();
  const url = result?.url?.trim();
  return {
    action: title
      ? `${defaults.verb}: ${title}`
      : `${defaults.verb} for ${skill}`,
    resource_url:
      url && url.length > 0
        ? url
        : `https://www.google.com/search?q=${encodeURIComponent(
            buildGrowthQuery(skill, category),
          )}`,
    cost: defaults.cost,
    time_hours: defaults.time_hours,
    type: category,
  };
}

/** Resolve an Exa event result into a {@link NetworkingOpportunity} (Req 19.2). */
export function toNetworkingOpportunity(
  result: GrowthExaResult,
  fallbackDate: string,
): NetworkingOpportunity {
  return {
    name: result.title?.trim() || 'Singapore networking event',
    date: result.publishedDate?.trim() || fallbackDate,
    url: result.url?.trim() || '',
    type: 'event',
  };
}

/* ------------------------------------------------------------------ *
 * Growth_Agent implementation
 * ------------------------------------------------------------------ */

/**
 * Background Growth_Agent flow (Req 19.1–19.4).
 *
 * `onSkillGapFlagged` records the flagging job against the skill's
 * `flagged_job_ids` set and, once the imported trigger reports ≥3 distinct
 * jobs, builds and stores the roadmap. `buildRoadmap` performs the Exa research
 * (Req 19.2), assembles the four-week roadmap via the imported pure constructor
 * (Req 19.3), and persists it to SkillGaps (Req 19.4).
 */
export class GrowthAgentImpl implements GrowthAgent {
  private readonly db: DynamoDBWrapper;
  private readonly exaSearch: GrowthExaSearchFn;
  private readonly tableName: string;
  private readonly numResults: number;
  private readonly now: () => Date;
  private readonly projectMatchImprovement: (
    skill: string,
    timesFlagged: number,
  ) => string;
  private readonly logger: Logger;

  constructor(deps: GrowthAgentDeps = {}) {
    this.db = deps.db ?? new DynamoDBWrapper();
    this.exaSearch = deps.exaSearch ?? NO_EXA;
    this.tableName = deps.tableName ?? SKILL_GAPS_TABLE;
    this.numResults = deps.numResults ?? DEFAULT_NUM_RESULTS;
    this.now = deps.now ?? (() => new Date());
    this.projectMatchImprovement =
      deps.projectMatchImprovement ?? defaultProjectedImprovement;
    this.logger =
      deps.logger ?? createLogger({ context: { component: 'Growth_Agent' } });
  }

  /**
   * Record that a job flagged a skill gap and, if the distinct-job trigger
   * fires (Req 19.1), build and store the roadmap.
   *
   * The `GrowthAgent` interface declares `(userId, skill)`; the optional
   * `jobId` extends it so callers can record the flagging job that drives the
   * distinct-job count. When omitted, the call still refreshes the record but
   * adds no new distinct job.
   */
  async onSkillGapFlagged(
    userId: string,
    skill: string,
    jobId?: string,
  ): Promise<void> {
    const log = this.logger.child({ userId, skill });
    const existing = await this.readRecord(userId, skill);
    const nowIso = this.now().toISOString();

    // Merge the flagging job into the distinct-job set (Req 19.1).
    const flaggedJobIds = new Set(existing?.flagged_job_ids ?? []);
    if (jobId && jobId.trim().length > 0) {
      flaggedJobIds.add(jobId);
    }
    const flaggedJobIdList = [...flaggedJobIds];
    const distinctCount = countDistinctFlaggedJobs(flaggedJobIdList);

    const record: SkillGapRecord = {
      user_id: userId,
      skill,
      times_flagged: distinctCount,
      first_flagged_at: existing?.first_flagged_at ?? nowIso,
      flagged_job_ids: flaggedJobIdList,
      // Preserve an already-built roadmap and its status; otherwise identified.
      roadmap: existing?.roadmap,
      status: existing?.status ?? 'identified',
    };
    await this.db.put<SkillGapRecord>(this.tableName, record);

    log.info('Recorded skill-gap flag', {
      distinctJobs: distinctCount,
      jobId: jobId ?? null,
    });

    // Trigger the roadmap build once ≥3 distinct jobs have flagged the skill.
    if (shouldTriggerGrowthAgent(flaggedJobIdList)) {
      log.info('Growth trigger met; building roadmap', {
        distinctJobs: distinctCount,
      });
      await this.buildRoadmap(userId, skill);
    }
  }

  /**
   * Research the skill via Exa (Req 19.2), assemble a four-week roadmap via the
   * imported pure constructor (Req 19.3), and persist it to SkillGaps with the
   * skill, times flagged, and projected match improvement (Req 19.4).
   */
  async buildRoadmap(userId: string, skill: string): Promise<SkillGapRoadmap> {
    const log = this.logger.child({ userId, skill });
    const existing = await this.readRecord(userId, skill);
    const nowIso = this.now().toISOString();
    const timesFlagged =
      existing?.times_flagged ??
      countDistinctFlaggedJobs(existing?.flagged_job_ids ?? []);

    // Research one resource per roadmap week (course → project → cert → event).
    const research = await Promise.all(
      ROADMAP_CATEGORIES.map(async (category) => ({
        category,
        results: await this.searchCategory(skill, category, log),
      })),
    );

    const weeks: RoadmapWeekInput[] = research.map(({ category, results }) =>
      toRoadmapWeekInput(skill, category, results[0]),
    );

    // Collect Singapore event results as networking opportunities (Req 19.2).
    const eventResearch = research.find((r) => r.category === 'event');
    const networking_opportunities: NetworkingOpportunity[] = eventResearch
      ? eventResearch.results.map((r) => toNetworkingOpportunity(r, nowIso))
      : [];

    // Assemble + validate via the imported pure roadmap constructor (Req 19.3).
    const roadmap = assembleRoadmap({
      weeks,
      projected_match_improvement: this.projectMatchImprovement(
        skill,
        timesFlagged,
      ),
      networking_opportunities,
    });

    // Defensive: the imported constructor already guarantees this.
    if (!isWellFormedRoadmap(roadmap)) {
      throw new Error('Assembled growth roadmap is not well-formed');
    }

    // Persist keyed (user_id, skill) with skill + times flagged (Req 19.4).
    const record: SkillGapRecord = {
      user_id: userId,
      skill,
      times_flagged: timesFlagged,
      first_flagged_at: existing?.first_flagged_at ?? nowIso,
      flagged_job_ids: existing?.flagged_job_ids ?? [],
      roadmap,
      status: 'roadmap_created',
    };
    await this.db.put<SkillGapRecord>(this.tableName, record);

    log.info('Stored growth roadmap', {
      timesFlagged,
      projected: roadmap.projected_match_improvement,
    });
    return roadmap;
  }

  /** Read the SkillGaps record keyed `(user_id, skill)`. */
  private async readRecord(
    userId: string,
    skill: string,
  ): Promise<SkillGapRecord | undefined> {
    return this.db.get<SkillGapRecord>(this.tableName, {
      user_id: userId,
      skill,
    });
  }

  /**
   * Run a single category's Exa research query, tolerating failure: a failed
   * query is logged and yields no results so one bad category never aborts the
   * whole roadmap build.
   */
  private async searchCategory(
    skill: string,
    category: RoadmapResourceType,
    log: Logger,
  ): Promise<GrowthExaResult[]> {
    const query = buildGrowthQuery(skill, category);
    try {
      const results = await this.exaSearch({
        query,
        numResults: this.numResults,
      });
      return Array.isArray(results) ? results : [];
    } catch (error) {
      log.warn('Growth Exa query failed; using fallback for category', {
        category,
        query,
        error: String(error),
      });
      return [];
    }
  }
}

/** Convenience factory mirroring the {@link GrowthAgentImpl} constructor. */
export function createGrowthAgent(deps: GrowthAgentDeps = {}): GrowthAgentImpl {
  return new GrowthAgentImpl(deps);
}
