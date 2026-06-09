import type { RoadmapResourceType } from '@worksignal/shared';

interface ResourceTypeStyle {
  label: string;
  className: string;
}

const RESOURCE_TYPE_STYLES: Record<RoadmapResourceType, ResourceTypeStyle> = {
  course: {
    label: 'Course',
    className: 'border-blue-200 bg-blue-50 text-blue-700',
  },
  project: {
    label: 'Project',
    className: 'border-violet-200 bg-violet-50 text-violet-700',
  },
  event: {
    label: 'Event',
    className: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  certification: {
    label: 'Certification',
    className: 'border-amber-200 bg-amber-50 text-amber-700',
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
      className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-medium ${style.className}`}
    >
      {style.label}
    </span>
  );
}
