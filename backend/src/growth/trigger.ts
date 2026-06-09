/**
 * Growth_Agent distinct-job trigger (Growth_Agent background flow).
 *
 * Pure, deterministic logic deciding whether the Growth_Agent should be
 * triggered for a given skill gap. The Realism_Agent flags a skill gap against
 * individual jobs during the debate; the Growth_Agent fires for that skill only
 * once it has been flagged across **three or more distinct jobs** for a user.
 *
 * Design reference: design.md — Growth_Agent (`onSkillGapFlagged`, Req 19.1).
 * The SkillGaps table records the jobs that have flagged a skill; this module
 * is the single source of truth for the trigger condition computed over those
 * recorded `flagged_job_ids`.
 *
 * Requirements:
 *  - 19.1: WHEN the Realism_Agent flags the same skill gap for a User across
 *          three or more distinct jobs, THE Growth_Agent SHALL be triggered for
 *          that skill gap.
 *
 * Correctness property (Property 16): *for all* sequences of flag events — even
 * those containing repeated flags of the same job id — the Growth_Agent is
 * triggered iff the number of **distinct** flagged job ids is at least
 * {@link GROWTH_TRIGGER_DISTINCT_JOB_THRESHOLD}. Repeated flags of the same job
 * count exactly once, so flagging one job ten times never triggers the agent.
 */

/**
 * The number of distinct jobs that must have flagged a skill gap before the
 * Growth_Agent is triggered for that skill (Req 19.1).
 */
export const GROWTH_TRIGGER_DISTINCT_JOB_THRESHOLD = 3;

/**
 * Count the number of distinct job ids among a sequence of skill-gap flags.
 *
 * Repeated flags of the same job id collapse to a single distinct job, which is
 * the basis of Requirement 19.1 / Property 16. Empty/whitespace handling is
 * intentionally left to the caller: ids are compared exactly as provided so the
 * count reflects the raw `flagged_job_ids` recorded against the skill.
 *
 * @param flaggedJobIds - The job ids that have flagged the skill gap, in any
 *   order and possibly containing duplicates.
 * @returns The number of distinct job ids.
 */
export function countDistinctFlaggedJobs(
  flaggedJobIds: Iterable<string>,
): number {
  return new Set(flaggedJobIds).size;
}

/**
 * Decide whether the Growth_Agent should be triggered for a skill gap.
 *
 * Total and deterministic: the agent triggers iff the count of **distinct**
 * flagged job ids is at least {@link GROWTH_TRIGGER_DISTINCT_JOB_THRESHOLD}
 * (Req 19.1, Property 16). Duplicate job ids in the input count once.
 *
 * @param flaggedJobIds - The job ids that have flagged the skill gap, in any
 *   order and possibly containing duplicates (repeated flags of the same job).
 * @returns `true` iff the skill has been flagged across at least three distinct
 *   jobs.
 */
export function shouldTriggerGrowthAgent(
  flaggedJobIds: Iterable<string>,
): boolean {
  return (
    countDistinctFlaggedJobs(flaggedJobIds) >=
    GROWTH_TRIGGER_DISTINCT_JOB_THRESHOLD
  );
}
