/**
 * Growth_Agent roadmap structure builder/validator (Task 8.3).
 *
 * Implements the roadmap-structure rule from the design document
 * ("Growth_Agent", Req 19.3):
 *
 *   "WHEN the Growth_Agent completes research for a skill gap, THE
 *    Growth_Agent SHALL produce a four-week roadmap in which each week
 *    specifies an action, a resource URL, a cost, a time estimate, and a
 *    resource type."
 *
 * This module is **pure logic** (no I/O) and is therefore directly
 * property-testable. It provides:
 *
 *  - {@link isWellFormedRoadmap} — a boolean type guard expressing the
 *    well-formedness invariant exercised by Property 17 (task 8.4).
 *  - {@link assertWellFormedRoadmap} — the same check but throwing a
 *    {@link ValidationError} naming the offending weeks/fields, for callers
 *    that need to reject malformed input.
 *  - {@link buildRoadmap} — a constructor that assembles a {@link SkillGapRoadmap}
 *    from four week inputs and guarantees the result is well-formed.
 *
 * Well-formedness (Property 17 — "Growth roadmap structure is well-formed"):
 * a roadmap is well-formed iff it contains **exactly four** weekly entries
 * whose `week` numbers are exactly the set {1, 2, 3, 4}, and each entry
 * specifies:
 *   - an `action`            (non-empty string),
 *   - a `resource_url`       (non-empty string),
 *   - a `cost`               (non-empty string, e.g. "Free", "S$49"),
 *   - a `time_hours` estimate (finite number > 0), and
 *   - a `type`               (a valid {@link RoadmapResourceType}).
 */

import { ValidationError } from '@worksignal/shared';
import type {
  NetworkingOpportunity,
  RoadmapResourceType,
  RoadmapWeek,
  SkillGapRoadmap,
} from '@worksignal/shared';

/** A growth roadmap always spans exactly four weeks (Req 19.3). */
export const ROADMAP_WEEK_COUNT = 4;

/** The exact set of `week` numbers a well-formed four-week roadmap must cover. */
export const ROADMAP_WEEK_NUMBERS: readonly number[] = [1, 2, 3, 4];

/** The valid resource types a roadmap week may specify (Req 19.3). */
export const ROADMAP_RESOURCE_TYPES: readonly RoadmapResourceType[] = [
  'course',
  'project',
  'event',
  'certification',
];

/** Is the value a non-empty (after trimming) string? */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Is the value a finite, strictly-positive number (a valid time estimate)? */
function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/** Is the value one of the allowed roadmap resource types? */
export function isRoadmapResourceType(value: unknown): value is RoadmapResourceType {
  return (
    typeof value === 'string' &&
    (ROADMAP_RESOURCE_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Is a single value a well-formed {@link RoadmapWeek}?
 *
 * Checks only the per-entry field requirements (action, resource URL, cost,
 * time estimate, resource type, plus an integer `week` number). Cross-entry
 * checks (exactly four weeks covering 1–4) live in {@link isWellFormedRoadmap}.
 */
export function isWellFormedRoadmapWeek(value: unknown): value is RoadmapWeek {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const week = value as Partial<RoadmapWeek>;
  return (
    typeof week.week === 'number' &&
    Number.isInteger(week.week) &&
    isNonEmptyString(week.action) &&
    isNonEmptyString(week.resource_url) &&
    isNonEmptyString(week.cost) &&
    isPositiveFiniteNumber(week.time_hours) &&
    isRoadmapResourceType(week.type)
  );
}

/**
 * Type guard: is the value a well-formed {@link SkillGapRoadmap}?
 *
 * True iff it has exactly four weekly entries whose `week` numbers are exactly
 * {1, 2, 3, 4} and every entry is a well-formed {@link RoadmapWeek}. This is
 * the invariant exercised by Property 17.
 */
export function isWellFormedRoadmap(value: unknown): value is SkillGapRoadmap {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const roadmap = value as Partial<SkillGapRoadmap>;
  const { weeks } = roadmap;

  if (!Array.isArray(weeks) || weeks.length !== ROADMAP_WEEK_COUNT) {
    return false;
  }
  if (!weeks.every(isWellFormedRoadmapWeek)) {
    return false;
  }

  // Week numbers must be exactly the set {1, 2, 3, 4} (distinct, covering).
  const weekNumbers = new Set(weeks.map((w) => w.week));
  if (weekNumbers.size !== ROADMAP_WEEK_COUNT) {
    return false;
  }
  return ROADMAP_WEEK_NUMBERS.every((n) => weekNumbers.has(n));
}

/** Collect a human-readable list of reasons a roadmap is not well-formed. */
function collectRoadmapIssues(value: unknown): string[] {
  const issues: string[] = [];

  if (typeof value !== 'object' || value === null) {
    return ['roadmap must be an object'];
  }
  const roadmap = value as Partial<SkillGapRoadmap>;
  const { weeks } = roadmap;

  if (!Array.isArray(weeks)) {
    return ['roadmap.weeks must be an array'];
  }
  if (weeks.length !== ROADMAP_WEEK_COUNT) {
    issues.push(
      `roadmap must have exactly ${ROADMAP_WEEK_COUNT} weeks (found ${weeks.length})`,
    );
  }

  weeks.forEach((week, index) => {
    const label = `week[${index}]`;
    if (typeof week !== 'object' || week === null) {
      issues.push(`${label} must be an object`);
      return;
    }
    const w = week as Partial<RoadmapWeek>;
    if (typeof w.week !== 'number' || !Number.isInteger(w.week)) {
      issues.push(`${label}.week must be an integer`);
    }
    if (!isNonEmptyString(w.action)) {
      issues.push(`${label}.action must be a non-empty string`);
    }
    if (!isNonEmptyString(w.resource_url)) {
      issues.push(`${label}.resource_url must be a non-empty string`);
    }
    if (!isNonEmptyString(w.cost)) {
      issues.push(`${label}.cost must be a non-empty string`);
    }
    if (!isPositiveFiniteNumber(w.time_hours)) {
      issues.push(`${label}.time_hours must be a positive finite number`);
    }
    if (!isRoadmapResourceType(w.type)) {
      issues.push(
        `${label}.type must be one of ${ROADMAP_RESOURCE_TYPES.join(', ')}`,
      );
    }
  });

  // Only meaningful when the per-entry week numbers are otherwise valid.
  const weekNumbers = new Set(
    weeks
      .filter((w): w is RoadmapWeek => typeof (w as RoadmapWeek)?.week === 'number')
      .map((w) => w.week),
  );
  const missing = ROADMAP_WEEK_NUMBERS.filter((n) => !weekNumbers.has(n));
  if (weeks.length === ROADMAP_WEEK_COUNT && missing.length > 0) {
    issues.push(`roadmap weeks must cover 1–4 (missing ${missing.join(', ')})`);
  }

  return issues;
}

/**
 * Assert the value is a well-formed {@link SkillGapRoadmap}, throwing a
 * {@link ValidationError} (with the offending issues in `details`) otherwise.
 */
export function assertWellFormedRoadmap(
  value: unknown,
): asserts value is SkillGapRoadmap {
  if (isWellFormedRoadmap(value)) {
    return;
  }
  const issues = collectRoadmapIssues(value);
  throw new ValidationError(`Malformed growth roadmap: ${issues.join('; ')}`, {
    issues,
  });
}

/** Input for a single roadmap week; `week` is assigned positionally by the builder. */
export type RoadmapWeekInput = Omit<RoadmapWeek, 'week'>;

/** Options for {@link buildRoadmap}. */
export interface BuildRoadmapInput {
  /** Exactly four week inputs, in order (week 1 → week 4). */
  weeks: RoadmapWeekInput[];
  /** Projected match-score improvement, e.g. "74% -> 89%" (Req 19.4). */
  projected_match_improvement: string;
  /** Optional networking opportunities surfaced alongside the roadmap (Req 19.2). */
  networking_opportunities?: NetworkingOpportunity[];
}

/**
 * Build a well-formed four-week {@link SkillGapRoadmap}.
 *
 * Assigns sequential `week` numbers (1–4) to the supplied week inputs, then
 * validates the assembled roadmap so the returned value is guaranteed to
 * satisfy {@link isWellFormedRoadmap}. Throws a {@link ValidationError} if the
 * inputs cannot form a well-formed roadmap (e.g. not exactly four weeks, or a
 * week missing a required field).
 *
 * @param input  The four week inputs plus projected improvement / events.
 * @returns      A validated, well-formed roadmap.
 */
export function buildRoadmap(input: BuildRoadmapInput): SkillGapRoadmap {
  if (!Array.isArray(input.weeks) || input.weeks.length !== ROADMAP_WEEK_COUNT) {
    throw new ValidationError(
      `Roadmap must be built from exactly ${ROADMAP_WEEK_COUNT} weeks (received ${
        Array.isArray(input.weeks) ? input.weeks.length : 'non-array'
      })`,
    );
  }

  const weeks: RoadmapWeek[] = input.weeks.map((w, index) => ({
    week: index + 1,
    action: w.action,
    resource_url: w.resource_url,
    cost: w.cost,
    time_hours: w.time_hours,
    type: w.type,
  }));

  const roadmap: SkillGapRoadmap = {
    weeks,
    projected_match_improvement: input.projected_match_improvement,
    networking_opportunities: input.networking_opportunities ?? [],
  };

  assertWellFormedRoadmap(roadmap);
  return roadmap;
}
