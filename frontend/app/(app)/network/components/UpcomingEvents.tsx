/**
 * Upcoming networking events section for the Network Suggestions view (Req 20.5).
 *
 * Displays relevant events surfaced by the Network_Agent. Each event shows a
 * name, date, and a link to more details.
 */

import type { NetworkingOpportunity } from '@/app/types/shared';
import { formatShortDate } from '../../../lib/formatDate';

export interface UpcomingEventsProps {
    events: NetworkingOpportunity[];
}

export function UpcomingEvents({ events }: UpcomingEventsProps) {
    if (events.length === 0) {
        return null;
    }

    return (
        <section data-testid="upcoming-events" aria-label="Upcoming networking events">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Upcoming events</h2>
            <ul className="flex flex-col gap-3">
                {events.map((event) => (
                    <li
                        key={`${event.name}-${event.date}`}
                        data-testid="upcoming-event"
                        className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 bg-white p-4"
                    >
                        <div className="flex flex-col">
                            <span className="text-sm font-medium text-gray-900">{event.name}</span>
                            <span className="text-xs text-gray-500">{formatShortDate(event.date)}</span>
                        </div>
                        <a
                            href={event.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
                        >
                            Details
                        </a>
                    </li>
                ))}
            </ul>
        </section>
    );
}
