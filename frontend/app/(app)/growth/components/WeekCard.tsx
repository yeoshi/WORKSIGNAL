/**
 * A single week within the four-week growth roadmap (Req 19.3, 19.5).
 *
 * Each card surfaces every field the Growth_Agent produces for a week:
 * the action, the linked resource URL, the cost, the time estimate, and the
 * resource type. The card is deliberately self-contained so component tests
 * (task 23.6) can render and assert against one week in isolation.
 */

import type { RoadmapWeek } from '@worksignal/shared';
import { ResourceTypeBadge } from './ResourceTypeBadge';
import { formatCost, formatTimeEstimate } from '../lib/format';

export interface WeekCardProps {
  week: RoadmapWeek;
}

export function WeekCard({ week }: WeekCardProps) {
  return (
    <article
      data-testid="week-card"
      data-week={week.week}
      className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
    >
      <header className="flex items-center justify-between gap-3">
        <span
          data-testid="week-label"
          className="inline-flex items-center rounded-full bg-gray-900 px-3 py-1 text-xs font-semibold text-white"
        >
          Week {week.week}
        </span>
        <ResourceTypeBadge type={week.type} />
      </header>

      <p data-testid="week-action" className="text-sm font-medium text-gray-900">
        {week.action}
      </p>

      <dl className="grid grid-cols-2 gap-3 text-xs text-gray-600">
        <div className="flex flex-col">
          <dt className="font-medium text-gray-500">Cost</dt>
          <dd data-testid="week-cost">{formatCost(week.cost)}</dd>
        </div>
        <div className="flex flex-col">
          <dt className="font-medium text-gray-500">Time estimate</dt>
          <dd data-testid="week-time">{formatTimeEstimate(week.time_hours)}</dd>
        </div>
      </dl>

      <a
        data-testid="week-resource-link"
        href={week.resource_url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex w-fit items-center text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
      >
        Open resource
      </a>
    </article>
  );
}
