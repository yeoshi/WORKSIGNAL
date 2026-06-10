'use client';

import type { NetworkRunEvent } from '@/app/api/network/run/route';

export interface NetworkRunPanelProps {
  events: NetworkRunEvent[];
  error?: string | null;
}

function labelForEvent(event: NetworkRunEvent): string {
  switch (event.type) {
    case 'company_scan':
      return `Scanning ${event.company} (${event.application_count} application${event.application_count === 1 ? '' : 's'})`;
    case 'connection_search':
      return `${event.company} · ${event.name} (${event.type})`;
    case 'filtering':
      return `${event.company}: kept ${event.kept.join(', ') || 'none'}`;
    case 'outreach_drafting':
      return `Draft for ${event.name} @ ${event.company}`;
    case 'complete':
      return `Complete — ${event.companies.length} compan${event.companies.length === 1 ? 'y' : 'ies'}`;
    case 'error':
      return event.message;
    default:
      return '…';
  }
}

export function NetworkRunPanel({ events, error }: NetworkRunPanelProps) {
  if (events.length === 0 && !error) return null;

  return (
    <section
      data-testid="network-run-panel"
      className="rounded-card border border-ws-line bg-ws-card p-4"
      aria-live="polite"
    >
      <h2 className="text-xs font-semibold uppercase tracking-wide text-ws-muted">
        Network Agent
      </h2>
      {error ? (
        <p className="mt-2 text-sm text-rose-700" data-testid="network-run-error">
          {error}
        </p>
      ) : null}
      <ol className="mt-3 max-h-48 space-y-1.5 overflow-y-auto text-sm">
        {events.map((event, index) => (
          <li
            key={`${event.type}-${index}`}
            className="flex items-start gap-2 text-ws-ink"
          >
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ws-teal" aria-hidden />
            <span className="text-ws-muted">{labelForEvent(event)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
