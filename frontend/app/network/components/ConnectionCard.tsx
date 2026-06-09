/**
 * A single connection suggestion card (Req 20.4, 20.5).
 *
 * Displays:
 *  - Connection type badge (alumni / community / cold)
 *  - Name and context/headline
 *  - Personalised outreach draft message
 */

import type { NetworkSuggestion } from '@worksignal/shared';
import { ConnectionTypeBadge } from './ConnectionTypeBadge';

export interface ConnectionCardProps {
    suggestion: NetworkSuggestion;
}

export function ConnectionCard({ suggestion }: ConnectionCardProps) {
    return (
        <article
            data-testid="connection-card"
            className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
            aria-label={`Connection suggestion: ${suggestion.name}`}
        >
            <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col gap-1">
                    <h3
                        data-testid="connection-name"
                        className="text-base font-semibold text-gray-900"
                    >
                        {suggestion.name}
                    </h3>
                    <p data-testid="connection-context" className="text-sm text-gray-600">
                        {suggestion.context}
                    </p>
                </div>
                <ConnectionTypeBadge type={suggestion.type} />
            </div>

            <div className="flex flex-col gap-1.5">
                <h4 className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Draft outreach
                </h4>
                <blockquote
                    data-testid="outreach-draft"
                    className="rounded-md border-l-4 border-blue-300 bg-blue-50 px-4 py-3 text-sm leading-relaxed text-gray-800"
                >
                    {suggestion.outreach_draft}
                </blockquote>
            </div>
        </article>
    );
}
