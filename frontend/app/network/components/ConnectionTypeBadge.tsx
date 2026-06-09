/**
 * Badge indicating the connection tier (alumni / community / cold) for a
 * network suggestion (Req 20.3).
 */

import type { NetworkConnectionType } from '@worksignal/shared';

export interface ConnectionTypeBadgeProps {
    type: NetworkConnectionType;
}

const BADGE_STYLES: Record<NetworkConnectionType, string> = {
    alumni: 'bg-purple-100 text-purple-800',
    community: 'bg-blue-100 text-blue-800',
    cold: 'bg-gray-100 text-gray-800',
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
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${BADGE_STYLES[type]}`}
        >
            {BADGE_LABELS[type]}
        </span>
    );
}
