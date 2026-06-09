'use client';

import { useEffect, useState } from 'react';
import { SkillGapHeader } from './SkillGapHeader';
import { RoadmapTimeline } from './RoadmapTimeline';
import { fetchGrowthOnce, type GrowthRoadmap } from '../lib/fetchGrowth';
import { formatShortDate } from '../../../lib/formatDate';

type LoadState =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'error' }
  | { status: 'ready'; data: GrowthRoadmap };

export function GrowthView() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    fetchGrowthOnce(controller.signal)
      .then((data) => {
        if (!active) return;
        setState(data ? { status: 'ready', data } : { status: 'empty' });
      })
      .catch((error) => {
        if (!active || (error instanceof DOMException && error.name === 'AbortError')) {
          return;
        }
        setState({ status: 'error' });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  if (state.status === 'loading') {
    return (
      <div data-testid="growth-loading" className="flex flex-col gap-4" aria-busy="true">
        <div className="h-8 w-48 animate-pulse rounded bg-ws-line" />
        <div className="h-24 w-full animate-pulse rounded bg-ws-line/60" />
      </div>
    );
  }

  if (state.status === 'empty') {
    return (
      <div
        data-testid="growth-empty"
        className="flex flex-col items-center gap-2 rounded-card border border-dashed border-ws-line bg-ws-paper p-10 text-center"
      >
        <h2 className="text-xl font-semibold text-ws-ink">No roadmap yet</h2>
        <p className="max-w-md text-sm text-ws-muted">
          Once the same skill gap is flagged across several jobs, Work Signal
          will build a four-week growth roadmap for you.
        </p>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div
        data-testid="growth-error"
        className="rounded-card border border-rose-200 bg-rose-50 p-8 text-center"
      >
        <p className="text-sm text-rose-700">Could not load your roadmap.</p>
      </div>
    );
  }

  return (
    <>
      <SkillGapHeader
        skill={state.data.skill}
        projectedMatchImprovement={state.data.roadmap.projected_match_improvement}
        timesFlagged={state.data.times_flagged}
      />
      <RoadmapTimeline weeks={state.data.roadmap.weeks} />
      {state.data.roadmap.networking_opportunities.length > 0 && (
        <section data-testid="related-events" aria-label="Related events">
          <h2 className="ws-section-label">Related events</h2>
          <ul className="flex flex-col gap-3">
            {state.data.roadmap.networking_opportunities.map((event) => (
              <li
                key={`${event.name}-${event.date}`}
                className="flex items-center justify-between gap-4 rounded-lg border border-ws-line bg-ws-card p-4"
              >
                <div>
                  <span className="text-sm font-medium text-ws-ink">{event.name}</span>
                  <span className="mt-0.5 block text-xs text-ws-muted">
                    {formatShortDate(event.date)}
                  </span>
                </div>
                <a
                  href={event.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-ws-teal-mid hover:underline"
                >
                  Details
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
