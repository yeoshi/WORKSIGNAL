/**
 * The four-week growth plan (Req 19.5).
 * Delegates to the horizontal {@link RoadmapTimeline} visualization.
 */

import type { RoadmapWeek } from '@worksignal/shared';
import { RoadmapTimeline } from './RoadmapTimeline';

export interface RoadmapPlanProps {
  weeks: RoadmapWeek[];
}

export function RoadmapPlan({ weeks }: RoadmapPlanProps) {
  return <RoadmapTimeline weeks={weeks} />;
}
