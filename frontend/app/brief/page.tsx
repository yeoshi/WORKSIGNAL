'use client';

/**
 * Weekly Brief view (Req 21.5).
 *
 * Displays the most recent recalibration results: applications sent,
 * callbacks received, callback rate, per-agent accuracy metrics, and any
 * threshold adjustments. Data is loaded from the `/api/brief` endpoint
 * (wired in task 24.1).
 *
 * The view tolerates the endpoint's absence: while loading it shows a
 * skeleton, and when no brief exists yet it shows an empty state.
 */

import { useEffect, useState } from 'react';
import { SummaryMetrics } from './components/SummaryMetrics';
import { AgentAccuracyDisplay } from './components/AgentAccuracyDisplay';
import { ThresholdAdjustments } from './components/ThresholdAdjustments';
import { fetchBriefOnce, type WeeklyBrief } from './lib/fetchBrief';

type LoadState =
    | { status: 'loading' }
    | { status: 'empty' }
    | { status: 'error' }
    | { status: 'ready'; data: WeeklyBrief };

export default function BriefPage() {
    const [state, setState] = useState<LoadState>({ status: 'loading' });

    useEffect(() => {
        const controller = new AbortController();
        let active = true;

        fetchBriefOnce(controller.signal)
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
            <header>
                <h1 className="text-2xl font-bold text-gray-900">Weekly Brief</h1>
                {state.status === 'ready' && (
                    <p className="mt-1 text-sm text-gray-600">
                        Week of {state.data.week_of}
                        {state.data.emergency && (
                            <span className="ml-2 inline-flex items-center rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                                Emergency recalibration
                            </span>
                        )}
                    </p>
                )}
            </header>

            {state.status === 'loading' && (
                <div data-testid="brief-loading" className="flex flex-col gap-6" aria-busy="true">
                    <div className="h-8 w-48 animate-pulse rounded bg-gray-200" />
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                        {[0, 1, 2].map((i) => (
                            <div key={i} className="h-20 w-full animate-pulse rounded bg-gray-100" />
                        ))}
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {[0, 1, 2, 3].map((i) => (
                            <div key={i} className="h-24 w-full animate-pulse rounded bg-gray-100" />
                        ))}
                    </div>
                </div>
            )}

            {state.status === 'empty' && (
                <div
                    data-testid="brief-empty"
                    className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-10 text-center"
                >
                    <h2 className="text-xl font-semibold text-gray-900">No brief yet</h2>
                    <p className="max-w-md text-sm text-gray-600">
                        Your first weekly brief will appear here after WORKSIGNAL runs its weekly
                        recalibration. This happens every Sunday at 09:00 SGT.
                    </p>
                </div>
            )}

            {state.status === 'error' && (
                <div
                    data-testid="brief-error"
                    className="flex flex-col items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-10 text-center"
                >
                    <h2 className="text-xl font-semibold text-rose-800">Could not load your brief</h2>
                    <p className="max-w-md text-sm text-rose-700">
                        Something went wrong loading the weekly brief. Please try again shortly.
                    </p>
                </div>
            )}

            {state.status === 'ready' && (
                <>
                    <SummaryMetrics metrics={state.data.metrics} />
                    <AgentAccuracyDisplay agentPerformance={state.data.agent_performance} />
                    <ThresholdAdjustments adjustments={state.data.adjustments_made} />

                    {state.data.brief_text && (
                        <section aria-label="Generated brief" data-testid="brief-text">
                            <h2 className="mb-3 text-lg font-semibold text-gray-900">Summary</h2>
                            <div className="rounded-lg border border-gray-200 bg-white p-4">
                                <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
                                    {state.data.brief_text}
                                </p>
                            </div>
                        </section>
                    )}
                </>
            )}
        </main>
    );
}
