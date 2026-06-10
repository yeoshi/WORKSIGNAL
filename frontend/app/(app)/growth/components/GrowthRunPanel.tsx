'use client';

import type { GrowthRunEvent } from '@/app/api/growth/run/route';
import { formatGrowthTitle } from '../lib/format';

export interface GrowthRunPanelProps {
  events: GrowthRunEvent[];
  error?: string | null;
}

function labelForEvent(event: GrowthRunEvent): string {
  switch (event.type) {
    case 'skill_gap_scan':
      return event.message;
    case 'gap_summary':
      return event.gaps.length > 0
        ? `Skills: ${event.gaps.map((g) => formatGrowthTitle(g.skill)).join(', ')}`
        : 'No new skill gaps identified';
    case 'source_search':
      return `${formatGrowthTitle(event.skill)} · ${event.category}${event.title ? `: ${formatGrowthTitle(event.title)}` : ''}`;
    case 'roadmap_building':
      return event.week > 0
        ? `Week ${event.week}: ${event.action ?? 'Building…'}`
        : `${formatGrowthTitle(event.skill)}: ${event.action ?? 'Building roadmap…'}`;
    case 'complete':
      return `Complete — ${event.skills.length} roadmap${event.skills.length === 1 ? '' : 's'}`;
    case 'error':
      return event.message;
    default:
      return '…';
  }
}

export function GrowthRunPanel({ events, error }: GrowthRunPanelProps) {
  if (events.length === 0 && !error) return null;

  return (
    <section
      data-testid="growth-run-panel"
      className="rounded-card border border-ws-line bg-ws-card p-4"
      aria-live="polite"
    >
      <h2 className="text-xs font-semibold uppercase tracking-wide text-ws-muted">
        Growth Agent
      </h2>
      {error ? (
        <p className="mt-2 text-sm text-rose-700" data-testid="growth-run-error">
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
