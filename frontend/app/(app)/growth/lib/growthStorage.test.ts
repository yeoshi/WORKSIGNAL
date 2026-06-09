import { describe, it, expect } from 'vitest';
import {
  areAllGrowthRoadmapsComplete,
  getActiveGrowthItems,
  getGrowthCardSubtext,
  loadArchivedSkills,
  saveArchivedSkills,
  loadProgressBySkill,
  saveProgressBySkill,
} from './growthStorage';

describe('growthStorage', () => {
  it('persists and restores archived skills', () => {
    saveArchivedSkills(new Set(['SQL', 'A/B Testing']));
    expect(loadArchivedSkills()).toEqual(new Set(['SQL', 'A/B Testing']));
  });

  it('persists and restores week progress', () => {
    saveProgressBySkill({
      SQL: { completed: [1], skipped: [], customProjects: {} },
    });
    expect(loadProgressBySkill()).toEqual({
      SQL: { completed: [1], skipped: [], customProjects: {} },
    });
  });

  it('returns no active skills when all roadmaps are complete', () => {
    saveArchivedSkills(new Set(['SQL & Data Analysis']));
    saveProgressBySkill({
      'A/B Testing': { completed: [1, 2, 3, 4], skipped: [], customProjects: {} },
    });

    const items = [
      {
        skill: 'SQL & Data Analysis',
        projected_match_improvement: '+18%',
        times_flagged: 3,
      },
      {
        skill: 'A/B Testing',
        projected_match_improvement: '+12%',
        times_flagged: 2,
      },
    ];

    expect(getActiveGrowthItems(items)).toEqual([]);
    expect(areAllGrowthRoadmapsComplete(items)).toBe(true);
    expect(getGrowthCardSubtext(items)).toBe('All roadmaps complete');
  });

  it('shows only in-progress roadmaps in card subtext', () => {
    saveArchivedSkills(new Set(['SQL & Data Analysis']));

    const subtext = getGrowthCardSubtext([
      {
        skill: 'SQL & Data Analysis',
        projected_match_improvement: '+18%',
        times_flagged: 3,
      },
      {
        skill: 'A/B Testing',
        projected_match_improvement: '+12%',
        times_flagged: 2,
      },
    ]);

    expect(subtext).toBe('1 roadmap in progress');
  });
});
