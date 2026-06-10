import { describe, it, expect } from 'vitest';
import { shouldGenerateJobMaterials } from './jobMaterialsGeneration';

describe('shouldGenerateJobMaterials', () => {
  it('returns true for needs-decision and apply-equivalent decisions', () => {
    expect(shouldGenerateJobMaterials('deadlock_escalate')).toBe(true);
    expect(shouldGenerateJobMaterials('apply_consensus')).toBe(true);
    expect(shouldGenerateJobMaterials('apply_with_caveat')).toBe(true);
  });

  it('returns false for skip and veto decisions', () => {
    expect(shouldGenerateJobMaterials('skip_consensus')).toBe(false);
    expect(shouldGenerateJobMaterials('veto_skip')).toBe(false);
    expect(shouldGenerateJobMaterials(undefined)).toBe(false);
  });
});
