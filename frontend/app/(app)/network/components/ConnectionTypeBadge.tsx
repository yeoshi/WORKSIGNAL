import type { NetworkConnectionType } from '@/app/types/shared';

export interface ConnectionTypeBadgeProps {
  type: NetworkConnectionType;
}

const BADGE_STYLES: Record<NetworkConnectionType, string> = {
  alumni: 'bg-blue-50 text-blue-700 border border-blue-200',
  community: 'bg-purple-50 text-purple-700 border border-purple-200',
  cold: 'bg-gray-100 text-gray-500 border border-gray-200',
};

const BADGE_LABELS: Record<NetworkConnectionType, string> = {
  alumni: 'Alumni',
  community: 'Community',
  cold: 'Cold',
};

export function ConnectionTypeBadge({ type }: ConnectionTypeBadgeProps) {
  return (
    <span
      data-testid={`badge-${type}`}
      className={[
        'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium',
        BADGE_STYLES[type],
      ].join(' ')}
    >
      {BADGE_LABELS[type]}
    </span>
  );
}
