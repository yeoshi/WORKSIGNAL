/**
 * The four-week growth plan (Req 19.5).
 *
 * Renders the roadmap weeks in ascending week order as a grid of modular
 * {@link WeekCard}s. Sorting is defensive so the plan reads Week 1 → Week 4
 * regardless of the order the BFF returns.
 */

import type { RoadmapWeek } from '@worksignal/shared';
import { WeekCard } from './WeekCard';

export interface RoadmapPlanProps {
  weeks: RoadmapWeek[];
}

export function RoadmapPlan({ weeks }: RoadmapPlanProps) {
  const orderedWeeks = [...weeks].sort((a, b) => a.week - b.week);

  return (
    <section data-testid="roadmap-plan" aria-label="Four-week growth plan">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">Four-week plan</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {orderedWeeks.map((week) => (
          <WeekCard key={week.week} week={week} />
        ))}
      </div>
    </section>
  );
}
