/**
 * Status badge for a pipeline application.
 *
 * Renders exactly one badge per {@link ApplicationStatus} value (Req 17.1,
 * 17.3): sent / opened / callback / rejected / ghosted /
 * redirected_external / needs_review / delivery_failed. The presentation
 * map is exhaustive over the union so adding a new status is a compile error
 * until handled.
 */

import type { ApplicationStatus } from '@worksignal/shared';

interface StatusBadgeStyle {
  /** Human-readable label shown in the badge. */
  label: string;
  /** Tailwind utility classes for the badge background/text/border. */
  className: string;
}

const STATUS_STYLES: Record<ApplicationStatus, StatusBadgeStyle> = {
  sent: {
    label: 'Sent',
    className: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  },
  opened: {
    label: 'Opened',
    className: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  },
  callback: {
    label: 'Callback',
    className: 'bg-green-50 text-green-700 ring-green-600/20',
  },
  rejected: {
    label: 'Rejected',
    className: 'bg-red-50 text-red-700 ring-red-600/20',
  },
  ghosted: {
    label: 'Ghosted',
    className: 'bg-gray-100 text-gray-600 ring-gray-500/20',
  },
  redirected_external: {
    label: 'Redirected',
    className: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  },
  needs_review: {
    label: 'Needs review',
    className: 'bg-purple-50 text-purple-700 ring-purple-600/20',
  },
  delivery_failed: {
    label: 'Delivery failed',
    className: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  },
};

export interface StatusBadgeProps {
  status: ApplicationStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const style = STATUS_STYLES[status];

  return (
    <span
      data-testid="status-badge"
      data-status={status}
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${style.className}`}
    >
      {style.label}
    </span>
  );
}
