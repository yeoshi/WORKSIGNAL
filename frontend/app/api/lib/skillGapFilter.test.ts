import { describe, expect, it } from 'vitest';
import {
  filterUserSkillGaps,
  isJobListingMetaGap,
  reframeUserSkillGap,
} from './skillGapFilter';

describe('skillGapFilter', () => {
  it('excludes empty job description gaps', () => {
    const gap =
      'Job description is completely empty — no requirements, responsibilities, or role details provided to evaluate against';
    expect(isJobListingMetaGap(gap)).toBe(true);
    expect(reframeUserSkillGap(gap)).toBeNull();
  });

  it('excludes recruitment agency posting issues', () => {
    const gap =
      'Recruitment agency posting (Evolution Recruitment Solutions) with no visible end-client disclosed — unclear actual employer, industry, or purpose alignment';
    expect(isJobListingMetaGap(gap)).toBe(true);
    expect(filterUserSkillGaps([gap])).toEqual([]);
  });

  it('reframes principal PM experience mismatch as product management experience', () => {
    const gap =
      'Lead/Principal PM title typically requires 8-12+ years of dedicated PM experience; user has 13 years total but as PM/Co-founder which may not fully map to corporate PM ladder expectations at this seniority';
    expect(reframeUserSkillGap(gap)).toBe('Product management experience');
  });

  it('keeps concrete skill labels', () => {
    expect(filterUserSkillGaps(['Kubernetes', 'SQL', 'Python'])).toEqual([
      'Kubernetes',
      'SQL',
      'Python',
    ]);
  });

  it('dedupes reframed skills case-insensitively', () => {
    const gaps = [
      'Lead/Principal PM title typically requires dedicated PM experience',
      'Corporate PM ladder expectations not met for principal product manager role',
    ];
    expect(filterUserSkillGaps(gaps)).toEqual(['Product management experience']);
  });
});
