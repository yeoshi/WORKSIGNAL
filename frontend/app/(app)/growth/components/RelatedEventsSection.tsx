import { ArrowRight, CalendarDays } from 'lucide-react';
import type { NetworkingOpportunity } from '@worksignal/shared';
import { formatShortDate } from '../../../lib/formatDate';
import { formatDaysUntil } from '../lib/format';

export interface RelatedEventsSectionProps {
  events: NetworkingOpportunity[];
}

type EventWithImage = NetworkingOpportunity & {
  image_url?: string;
  location?: string;
  format?: string;
};

export function RelatedEventsSection({ events }: RelatedEventsSectionProps) {
  if (events.length === 0) return null;

  return (
    <section data-testid="related-events" className="mt-8" aria-label="Related events">
      <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-amber-700/70">
          Related events
        </h2>

        <ul className="mt-3 flex flex-col gap-2">
          {events.map((event) => {
            const enriched = event as EventWithImage;
            const urgency = formatDaysUntil(event.date);
            const subtitle = enriched.location ?? enriched.format;

            return (
              <li
                key={`${event.name}-${event.date}`}
                data-testid="related-event-row"
                className="flex items-center gap-3 rounded-lg p-3 transition-colors hover:bg-amber-100/60"
              >
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg">
                  {enriched.image_url ? (
                    <img
                      src={enriched.image_url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gray-100 text-gray-500">
                      <CalendarDays size={22} aria-hidden />
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900">{event.name}</p>
                  {subtitle && (
                    <p className="text-xs text-gray-400">{subtitle}</p>
                  )}
                </div>

                <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
                  <span
                    data-testid="related-event-date"
                    className="text-sm font-medium text-gray-700"
                  >
                    {formatShortDate(event.date)}
                  </span>
                  {urgency && (
                    <span
                      data-testid="related-event-urgency"
                      className="text-xs text-emerald-600"
                    >
                      {urgency}
                    </span>
                  )}
                  <a
                    href={event.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="related-event-details"
                    className="mt-1 inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
                  >
                    Details
                    <ArrowRight size={12} aria-hidden />
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
