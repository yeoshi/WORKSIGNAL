/**
 * Badge identifying a roadmap week's resource type (Req 19.3).
 *
 * Renders exactly one badge per {@link RoadmapResourceType} value:
 * course / project / event / certification. The presentation map is
 * exhaustive over the union, so adding a new resource type is a compile error
 * until handled here.
 */

import type { RoadmapResourceType } from '@worksignal/shared';

interface ResourceTypeStyle {
  label: string;
  className: string;
}

const RESOURCE_TYPE_STYLES: Record<RoadmapResourceType, ResourceTypeStyle> = {
  course: {
    label: 'Course',
    className: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  },
  project: {
    label: 'Project',
    className: 'bg-green-50 text-green-700 ring-green-600/20',
  },
  event: {
    label: 'Event',
    className: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  },
  certification: {
    label: 'Certification',
    className: 'bg-purple-50 text-purple-700 ring-purple-600/20',
  },
};

export interface ResourceTypeBadgeProps {
  type: RoadmapResourceType;
}

export function ResourceTypeBadge({ type }: ResourceTypeBadgeProps) {
  const style = RESOURCE_TYPE_STYLES[type];

  return (
    <span
      data-testid="resource-type-badge"
      data-resource-type={type}
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${style.className}`}
    >
      {style.label}
    </span>
  );
}
