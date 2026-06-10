/**
 * GET /api/growth/run — SSE stream for the Growth Agent roadmap build.
 */

import { DynamoDBWrapper } from '@worksignal/shared';
import {
  buildGrowthQuery,
  createGrowthAgent,
  isWellFormedRoadmap,
  type GrowthExaSearchFn,
  type RoadmapResourceType,
} from '@worksignal/backend';
import { getAuthenticatedUser, unauthorizedResponse } from '../../lib/auth';
import { DEMO_MODE } from '../../lib/demo';
import { createSseResponse } from '../../lib/sse';
import { getAwsRegion } from '../../lib/awsRegion';
import { exaSearchRaw } from '../../lib/agentClients';
import { clearSkillGapsForUser } from '../../lib/clearAgentRunData';
import {
  collectGrowthRunSkills,
  loadDebatedJobGaps,
} from '../../lib/growthRunInputs';
import { normalizeGrowthResponse } from '../../../(app)/growth/lib/fetchGrowth';

export const runtime = 'nodejs';
export const maxDuration = 300;

const ROADMAP_CATEGORIES: readonly RoadmapResourceType[] = [
  'course',
  'project',
  'certification',
  'event',
];

export type GrowthRunEvent =
  | {
      type: 'skill_gap_scan';
      message: string;
      job_id?: string;
      company?: string;
      role_title?: string;
      realism_score?: number;
    }
  | { type: 'gap_summary'; gaps: Array<{ skill: string; count: number }> }
  | { type: 'source_search'; skill: string; category: string; title?: string; url?: string }
  | { type: 'roadmap_building'; skill: string; week: number; action?: string }
  | { type: 'complete'; skills: Array<{ skill: string; times_flagged?: number; roadmap: unknown }> }
  | { type: 'error'; message: string };

export async function GET() {
  if (DEMO_MODE) {
    return Response.json({ error: 'Not available in demo mode' }, { status: 400 });
  }

  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  return createSseResponse<GrowthRunEvent>((emit) =>
    runGrowthAgent(user.userId, emit),
  );
}

async function runGrowthAgent(
  userId: string,
  emit: (event: GrowthRunEvent) => Promise<void>,
): Promise<void> {
  const db = new DynamoDBWrapper({ region: getAwsRegion() });

  await clearSkillGapsForUser(db, userId);

  await emit({
    type: 'skill_gap_scan',
    message: 'Scanning debated jobs for Realism skill gaps…',
  });

  const debatedJobs = await loadDebatedJobGaps(db, userId);
  for (const job of debatedJobs) {
    await emit({
      type: 'skill_gap_scan',
      message: `Gaps at ${job.role_title ?? 'role'} @ ${job.company ?? 'company'}: ${job.skills.join(', ')}`,
      job_id: job.job_id,
      company: job.company,
      role_title: job.role_title,
      realism_score: job.realism_score,
    });
  }

  const skillsToProcess = await collectGrowthRunSkills(db, userId, 3);

  await emit({
    type: 'gap_summary',
    gaps: skillsToProcess.map((s) => ({ skill: s.skill, count: s.times_flagged })),
  });

  if (skillsToProcess.length === 0) {
    const existing =
      (await db.query('SkillGaps', {
        KeyConditionExpression: 'user_id = :u',
        ExpressionAttributeValues: { ':u': userId },
      })) ?? [];
    const withRoadmap = existing.filter(
      (item) => item.roadmap && item.status === 'roadmap_created',
    );
    const skills = withRoadmap.map((entry) => ({
      skill: String(entry.skill),
      times_flagged: typeof entry.times_flagged === 'number' ? entry.times_flagged : undefined,
      roadmap: entry.roadmap,
    }));
    await emit({ type: 'complete', skills });
    return;
  }

  const completedSkills: Array<{ skill: string; times_flagged?: number; roadmap: unknown }> = [];

  for (const { skill, times_flagged } of skillsToProcess) {
    const exaSearch: GrowthExaSearchFn = async ({ query, numResults }) => {
      const matchedCategory =
        ROADMAP_CATEGORIES.find((c) => query === buildGrowthQuery(skill, c)) ?? 'course';

      const results = await exaSearchRaw(query, numResults ?? 5);
      for (const r of results) {
        await emit({
          type: 'source_search',
          skill,
          category: matchedCategory,
          title: r.title,
          url: r.url,
        });
      }
      return results;
    };

    const agent = createGrowthAgent({ db, exaSearch });

    await emit({ type: 'roadmap_building', skill, week: 0, action: 'Researching resources…' });

    const roadmap = await agent.buildRoadmap(userId, skill);

    if (!isWellFormedRoadmap(roadmap)) {
      throw new Error(`Growth roadmap for "${skill}" is not well-formed`);
    }

    for (const week of roadmap.weeks) {
      await emit({
        type: 'roadmap_building',
        skill,
        week: week.week,
        action: week.action,
      });
    }

    const payload = { skill, times_flagged, roadmap };
    const normalized = normalizeGrowthResponse(payload);
    if (!normalized) {
      throw new Error(`Growth complete payload failed normalization for "${skill}"`);
    }

    completedSkills.push(payload);
  }

  const allItems =
    (await db.query('SkillGaps', {
      KeyConditionExpression: 'user_id = :u',
      ExpressionAttributeValues: { ':u': userId },
    })) ?? [];

  const skills = allItems
    .filter((item) => item.roadmap && item.status === 'roadmap_created')
    .map((entry) => ({
      skill: String(entry.skill),
      times_flagged: typeof entry.times_flagged === 'number' ? entry.times_flagged : undefined,
      roadmap: entry.roadmap,
    }));

  await emit({ type: 'complete', skills: skills.length > 0 ? skills : completedSkills });
}
