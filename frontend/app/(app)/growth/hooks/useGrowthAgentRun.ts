'use client';

import { useCallback, useState } from 'react';
import type { GrowthRunEvent } from '@/app/api/growth/run/route';
import { useAgentStream } from '@/app/hooks/useAgentStream';
import { normalizeGrowthResponse, type GrowthRoadmap } from '../lib/fetchGrowth';

function parseGrowthComplete(events: GrowthRunEvent[]): GrowthRoadmap[] | null {
  const complete = [...events].reverse().find((e) => e.type === 'complete');
  if (!complete || complete.type !== 'complete') return null;
  return complete.skills
    .map((item) => normalizeGrowthResponse(item))
    .filter((r): r is GrowthRoadmap => r !== null);
}

export function useGrowthAgentRun() {
  const [mergeData, setMergeData] = useState<GrowthRoadmap[] | null>(null);

  const handleComplete = useCallback((events: GrowthRunEvent[]) => {
    const data = parseGrowthComplete(events);
    if (data && data.length > 0) setMergeData(data);
  }, []);

  const stream = useAgentStream<GrowthRunEvent>({
    url: '/api/growth/run',
    completeTypes: ['complete'],
    onComplete: handleComplete,
  });

  return {
    stream,
    mergeData,
    running: stream.state === 'running',
  };
}
