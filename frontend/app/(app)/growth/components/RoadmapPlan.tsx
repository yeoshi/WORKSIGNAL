/**
 * The four-week growth plan (Req 19.5).
 * Delegates to the horizontal {@link RoadmapTimeline} visualization.
 */

'use client';

import { useState } from 'react';
import type { RoadmapWeek } from '@/app/types/shared';
import { RoadmapTimeline, type WeekProgress } from './RoadmapTimeline';

const EMPTY_PROGRESS: WeekProgress = {
  completed: [],
  skipped: [],
  customProjects: {},
};

export interface RoadmapPlanProps {
  weeks: RoadmapWeek[];
}

export function RoadmapPlan({ weeks }: RoadmapPlanProps) {
  const [progress, setProgress] = useState<WeekProgress>(EMPTY_PROGRESS);

  return (
    <RoadmapTimeline
      weeks={weeks}
      progress={progress}
      onProgressChange={(updater) => setProgress(updater)}
    />
  );
}
