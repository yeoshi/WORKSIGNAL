import { describe, expect, it } from 'vitest';
import { isWellFormedRoadmap } from '@worksignal/backend';
import { DEMO_GROWTH, DEMO_NETWORK_GRAB } from './demo';
import { normalizeGrowthResponse } from '../../(app)/growth/lib/fetchGrowth';
import { normalizeNetworkResponse } from '../../(app)/network/lib/fetchNetwork';

describe('agent run complete payloads', () => {
  it('growth complete skills pass normalizeGrowthResponse and isWellFormedRoadmap', () => {
    for (const skill of DEMO_GROWTH.skills) {
      const normalized = normalizeGrowthResponse(skill);
      expect(normalized).not.toBeNull();
      expect(isWellFormedRoadmap(normalized!.roadmap)).toBe(true);
    }

    const completePayload = { type: 'complete' as const, skills: DEMO_GROWTH.skills };
    for (const item of completePayload.skills) {
      expect(normalizeGrowthResponse(item)).not.toBeNull();
      expect(isWellFormedRoadmap(item.roadmap)).toBe(true);
    }
  });

  it('network complete company passes normalizeNetworkResponse', () => {
    const normalized = normalizeNetworkResponse(DEMO_NETWORK_GRAB);
    expect(normalized).not.toBeNull();
    expect(normalized!.company).toBe('Grab');
    expect(normalized!.suggestionSet.suggestions.length).toBeGreaterThan(0);

    const completePayload = {
      type: 'complete' as const,
      companies: [DEMO_NETWORK_GRAB],
    };
    for (const company of completePayload.companies) {
      expect(normalizeNetworkResponse(company)).not.toBeNull();
    }
  });
});
