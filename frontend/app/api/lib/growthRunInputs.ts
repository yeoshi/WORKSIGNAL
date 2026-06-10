/**
 * Inputs for the Growth Agent live run: pending SkillGaps rows plus Realism
 * gaps aggregated across all debated jobs (not only rejected stretch roles).
 */

import type { DynamoDBWrapper } from '@worksignal/shared';
import { succinctWords } from '@worksignal/shared/succinctWords';
import { filterUserSkillGaps } from './skillGapFilter';

function toGrowthSkillLabel(skill: string): string {
  return succinctWords(skill.trim(), 5) || skill.trim();
}

export interface DebatedJobGapContext {
  job_id: string;
  company?: string;
  role_title?: string;
  skills: string[];
  realism_score?: number;
  realism_verdict?: string;
}

export interface GrowthRunSkillSource {
  skill: string;
  times_flagged: number;
  /** Weighted priority score for ordering before cap. */
  priority_score: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
}

/**
 * Returns true when ambition says apply but realism says skip — kept for tests.
 */
export function isHighAmbitionRejectedVerdict(verdict: Record<string, unknown>): boolean {
  const ambition = isRecord(verdict.ambition) ? verdict.ambition : null;
  const realism = isRecord(verdict.realism) ? verdict.realism : null;
  if (!ambition || !realism) return false;
  return ambition.verdict === 'apply' && realism.verdict === 'skip';
}

/**
 * Skill gaps from a persisted AgentVerdicts record.
 * Realism stores `gaps` (not `key_gaps`); master orchestrator may expose
 * `upskill_targets` on orchestrator_verdict when that field is missing.
 */
export function extractSkillGapsFromVerdict(verdict: Record<string, unknown>): string[] {
  const realism = isRecord(verdict.realism) ? verdict.realism : null;
  const fromGaps = filterUserSkillGaps(readStringArray(realism?.gaps)).map(toGrowthSkillLabel);
  if (fromGaps.length > 0) return fromGaps;

  const master = isRecord(verdict.master_decision) ? verdict.master_decision : null;
  const orchestrator = isRecord(master?.orchestrator_verdict)
    ? (master.orchestrator_verdict as Record<string, unknown>)
    : null;
  return filterUserSkillGaps(readStringArray(orchestrator?.upskill_targets)).map(
    toGrowthSkillLabel,
  );
}

function realismVerdictBoost(verdict: string | undefined): number {
  if (verdict === 'skip') return 3;
  if (verdict === 'caution') return 2;
  return 0;
}

function scoreSkillEntry(
  jobCount: number,
  lowestRealismScore: number,
  verdictBoost: number,
): number {
  const matchPenalty = Math.max(0, 100 - lowestRealismScore) / 10;
  return jobCount * 10 + verdictBoost + matchPenalty;
}

/**
 * Load Realism-flagged skill gaps from every user job that has AgentVerdicts.
 */
export async function loadDebatedJobGaps(
  db: DynamoDBWrapper,
  userId: string,
): Promise<DebatedJobGapContext[]> {
  const jobs =
    (await db.query('Jobs', {
      IndexName: 'user_id-index',
      KeyConditionExpression: 'user_id = :u',
      ExpressionAttributeValues: { ':u': userId },
    })) ?? [];

  const results: DebatedJobGapContext[] = [];

  for (const job of jobs) {
    const jobId = String(job.job_id ?? '');
    if (!jobId) continue;

    let verdictRows: Array<Record<string, unknown>> = [];
    try {
      verdictRows =
        (await db.query('AgentVerdicts', {
          IndexName: 'job_id-user_id-index',
          KeyConditionExpression: 'job_id = :j AND user_id = :u',
          ExpressionAttributeValues: { ':j': jobId, ':u': userId },
          Limit: 1,
        })) ?? [];
    } catch {
      continue;
    }

    const verdict = verdictRows[0];
    if (!verdict || !isRecord(verdict.realism)) continue;

    const skills = extractSkillGapsFromVerdict(verdict);
    if (skills.length === 0) continue;

    const realism = verdict.realism as Record<string, unknown>;
    results.push({
      job_id: jobId,
      company: typeof job.company === 'string' ? job.company : undefined,
      role_title: typeof job.role_title === 'string' ? job.role_title : undefined,
      skills,
      realism_score: typeof realism.score === 'number' ? realism.score : undefined,
      realism_verdict: typeof realism.verdict === 'string' ? realism.verdict : undefined,
    });
  }

  return results;
}

function aggregateSkillsFromDebatedJobs(
  debatedJobs: DebatedJobGapContext[],
): GrowthRunSkillSource[] {
  const bySkill = new Map<
    string,
    { display: string; jobCount: number; lowestScore: number; verdictBoost: number }
  >();

  for (const job of debatedJobs) {
    const score = job.realism_score ?? 100;
    const boost = realismVerdictBoost(job.realism_verdict);
    for (const skill of job.skills) {
      const label = toGrowthSkillLabel(skill);
      const key = label.toLowerCase();
      if (!key) continue;
      const existing = bySkill.get(key);
      if (!existing) {
        bySkill.set(key, {
          display: label,
          jobCount: 1,
          lowestScore: score,
          verdictBoost: boost,
        });
      } else {
        existing.jobCount += 1;
        existing.lowestScore = Math.min(existing.lowestScore, score);
        existing.verdictBoost = Math.max(existing.verdictBoost, boost);
      }
    }
  }

  return [...bySkill.values()]
    .map(({ display, jobCount, lowestScore, verdictBoost }) => ({
      skill: toGrowthSkillLabel(display),
      times_flagged: jobCount,
      priority_score: scoreSkillEntry(jobCount, lowestScore, verdictBoost),
    }))
    .sort((a, b) => b.priority_score - a.priority_score);
}

export async function collectGrowthRunSkills(
  db: DynamoDBWrapper,
  userId: string,
  cap = 3,
): Promise<GrowthRunSkillSource[]> {
  const skillGaps =
    (await db.query('SkillGaps', {
      KeyConditionExpression: 'user_id = :u',
      ExpressionAttributeValues: { ':u': userId },
    })) ?? [];

  const pendingFromTable: GrowthRunSkillSource[] = [];
  for (const item of skillGaps) {
    if (item.status === 'roadmap_created' || typeof item.skill !== 'string') continue;
    const skills = filterUserSkillGaps([String(item.skill)]);
    if (skills.length === 0) continue;
    pendingFromTable.push({
      skill: toGrowthSkillLabel(skills[0]!),
      times_flagged: typeof item.times_flagged === 'number' ? item.times_flagged : 1,
      priority_score: 1000,
    });
  }

  const debatedJobs = await loadDebatedJobGaps(db, userId);
  const fromDebated = aggregateSkillsFromDebatedJobs(debatedJobs);

  const seen = new Set<string>();
  const merged: GrowthRunSkillSource[] = [];

  for (const entry of [...pendingFromTable, ...fromDebated]) {
    const labeled = { ...entry, skill: toGrowthSkillLabel(entry.skill) };
    const key = labeled.skill.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(labeled);
    if (merged.length >= cap) break;
  }

  return merged;
}
