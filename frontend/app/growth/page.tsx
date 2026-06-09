'use client';

/**
 * Growth Roadmap view (Req 19.5).
 *
 * Displays the identified skill gap, the four-week plan with linked resources
 * (each week: action, resource URL, cost, time estimate, resource type), and
 * the projected match-score improvement. Related Singapore networking events
 * surfaced by the Growth_Agent are shown alongside the plan.
 *
 * Data is loaded from the relative `/api/growth` endpoint (wired in task
 * 24.1). The view tolerates the endpoint's absence: while loading it shows a
 * skeleton, and when no roadmap exists yet it shows an empty state rather than
 * an error.
 */

import { useEffect, useState } from 'react';
import { SkillGapHeader } from './components/SkillGapHeader';
import { RoadmapPlan } from './components/RoadmapPlan';
import { fetchGrowthOnce, type GrowthRoadmap } from './lib/fetchGrowth';

type LoadState =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'error' }
  | { status: 'ready'; data: GrowthRoadmap };

export default function GrowthPage() {
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

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 p-6 sm:p-10">
      {state.status === 'loading' && (
        <div data-testid="growth-loading" className="flex flex-col gap-4" aria-busy="true">
          <div className="h-8 w-48 animate-pulse rounded bg-gray-200" />
          <div className="h-24 w-full animate-pulse rounded bg-gray-100" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-40 w-full animate-pulse rounded bg-gray-100" />
            ))}
          </div>
        </div>
      )}

      {state.status === 'empty' && (
        <div
          data-testid="growth-empty"
          className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-10 text-center"
        >
          <h1 className="text-xl font-semibold text-gray-900">No roadmap yet</h1>
          <p className="max-w-md text-sm text-gray-600">
            Once the same skill gap is flagged across several jobs, WORKSIGNAL will build a
            four-week growth roadmap for you here.
          </p>
        </div>
      )}

      {state.status === 'error' && (
        <div
          data-testid="growth-error"
          className="flex flex-col items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-10 text-center"
        >
          <h1 className="text-xl font-semibold text-rose-800">Could not load your roadmap</h1>
          <p className="max-w-md text-sm text-rose-700">
            Something went wrong loading your growth roadmap. Please try again shortly.
          </p>
        </div>
      )}

      {state.status === 'ready' && (
        <>
          <SkillGapHeader
            skill={state.data.skill}
            projectedMatchImprovement={state.data.roadmap.projected_match_improvement}
            timesFlagged={state.data.times_flagged}
          />

          <RoadmapPlan weeks={state.data.roadmap.weeks} />

          {state.data.roadmap.networking_opportunities.length > 0 && (
            <section data-testid="related-events" aria-label="Related events">
              <h2 className="mb-4 text-lg font-semibold text-gray-900">Related events</h2>
              <ul className="flex flex-col gap-3">
                {state.data.roadmap.networking_opportunities.map((event) => (
                  <li
                    key={`${event.name}-${event.date}`}
                    data-testid="related-event"
                    className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 bg-white p-4"
                  >
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-gray-900">{event.name}</span>
                      <span className="text-xs text-gray-500">{event.date}</span>
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
          )}
        </>
      )}
    </main>
  );
}
