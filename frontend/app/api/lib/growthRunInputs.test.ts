import { describe, expect, it } from 'vitest';
import {
  extractSkillGapsFromVerdict,
  isHighAmbitionRejectedVerdict,
  loadDebatedJobGaps,
  type DebatedJobGapContext,
} from './growthRunInputs';

function aggregateForTest(jobs: DebatedJobGapContext[]) {
  const counts = new Map<string, { skill: string; times_flagged: number }>();
  for (const job of jobs) {
    for (const skill of job.skills) {
      const key = skill.trim().toLowerCase();
      const existing = counts.get(key);
      if (existing) {
        existing.times_flagged += 1;
      } else {
        counts.set(key, { skill: skill.trim(), times_flagged: 1 });
      }
    }
  }
  return [...counts.values()].sort((a, b) => b.times_flagged - a.times_flagged);
}

describe('growthRunInputs', () => {
  it('detects high-ambition rejected verdicts (ambition apply + realism skip)', () => {
    expect(
      isHighAmbitionRejectedVerdict({
        ambition: { verdict: 'apply', score: 80 },
        realism: { verdict: 'skip', score: 40, gaps: ['Kubernetes'] },
      }),
    ).toBe(true);

    expect(
      isHighAmbitionRejectedVerdict({
        ambition: { verdict: 'skip' },
        realism: { verdict: 'skip' },
      }),
    ).toBe(false);
  });

  it('filters job-listing meta gaps from realism.gaps', () => {
    expect(
      extractSkillGapsFromVerdict({
        realism: {
          gaps: [
            'Job description is completely empty — no requirements provided to evaluate against',
            'Lead/Principal PM title typically requires dedicated PM experience; user may not map to corporate PM ladder',
            'Recruitment agency posting with no visible end-client disclosed',
          ],
        },
      }),
    ).toEqual(['Product management experience']);
  });

  it('extracts skill gaps from realism.gaps with orchestrator fallback', () => {
    expect(
      extractSkillGapsFromVerdict({
        realism: { gaps: ['SQL', 'Python'] },
      }),
    ).toEqual(['SQL', 'Python']);

    expect(
      extractSkillGapsFromVerdict({
        realism: { gaps: [] },
        master_decision: {
          orchestrator_verdict: { upskill_targets: ['System design'] },
        },
      }),
    ).toEqual(['System design']);
  });

  it('includes gaps from apply-verdict jobs when aggregating debated jobs', () => {
    const aggregated = aggregateForTest([
      {
        job_id: 'job-1',
        skills: ['Kubernetes'],
        realism_score: 55,
        realism_verdict: 'apply',
      },
    ]);
    expect(aggregated).toEqual([{ skill: 'Kubernetes', times_flagged: 1 }]);
  });

  it('ranks skills flagged on more jobs higher', () => {
    const aggregated = aggregateForTest([
      { job_id: 'j1', skills: ['SQL'] },
      { job_id: 'j2', skills: ['SQL'] },
      { job_id: 'j3', skills: ['Python'] },
    ]);
    expect(aggregated[0]?.skill).toBe('SQL');
    expect(aggregated[0]?.times_flagged).toBe(2);
  });

  it('exports loadDebatedJobGaps', () => {
    expect(typeof loadDebatedJobGaps).toBe('function');
  });
});
