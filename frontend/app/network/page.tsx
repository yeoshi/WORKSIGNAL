'use client';

/**
 * Network Suggestions view (Req 20.5).
 *
 * Displays the target company, application count, connection cards ordered
 * alumni → community → cold (each with a personalised outreach draft), and
 * relevant upcoming networking events.
 *
 * Data is loaded from the relative `/api/network` endpoint (wired in task
 * 24.1). The view tolerates the endpoint's absence: while loading it shows a
 * skeleton, and when no suggestions exist yet it shows an empty state rather
 * than an error.
 */

import { useEffect, useState } from 'react';
import { CompanyHeader } from './components/CompanyHeader';
import { ConnectionCard } from './components/ConnectionCard';
import { UpcomingEvents } from './components/UpcomingEvents';
import { fetchNetworkOnce, type NetworkData } from './lib/fetchNetwork';

type LoadState =
    | { status: 'loading' }
    | { status: 'empty' }
    | { status: 'error' }
    | { status: 'ready'; data: NetworkData };

export default function NetworkPage() {
    const [state, setState] = useState<LoadState>({ status: 'loading' });

    useEffect(() => {
        const controller = new AbortController();
        let active = true;

        fetchNetworkOnce(controller.signal)
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
                <div data-testid="network-loading" className="flex flex-col gap-4" aria-busy="true">
                    <div className="h-8 w-48 animate-pulse rounded bg-gray-200" />
                    <div className="h-5 w-32 animate-pulse rounded bg-gray-100" />
                    <div className="flex flex-col gap-4">
                        {[0, 1, 2].map((i) => (
                            <div key={i} className="h-44 w-full animate-pulse rounded bg-gray-100" />
                        ))}
                    </div>
                </div>
            )}

            {state.status === 'empty' && (
                <div
                    data-testid="network-empty"
                    className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-10 text-center"
                >
                    <h1 className="text-xl font-semibold text-gray-900">No network suggestions yet</h1>
                    <p className="max-w-md text-sm text-gray-600">
                        Once you&apos;ve sent at least two applications to the same company, WORKSIGNAL
                        will surface connection suggestions to help you network effectively.
                    </p>
                </div>
            )}

            {state.status === 'error' && (
                <div
                    data-testid="network-error"
                    className="flex flex-col items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-10 text-center"
                >
                    <h1 className="text-xl font-semibold text-rose-800">
                        Could not load network suggestions
                    </h1>
                    <p className="max-w-md text-sm text-rose-700">
                        Something went wrong loading your network suggestions. Please try again shortly.
                    </p>
                </div>
            )}

            {state.status === 'ready' && (
                <>
                    <CompanyHeader
                        company={state.data.company}
                        applicationCount={state.data.application_count}
                    />

                    <section aria-label="Connection suggestions">
                        <h2 className="mb-4 text-lg font-semibold text-gray-900">Connections</h2>
                        {state.data.suggestionSet.suggestions.length > 0 ? (
                            <div className="flex flex-col gap-4">
                                {state.data.suggestionSet.suggestions.map((suggestion) => (
                                    <ConnectionCard
                                        key={`${suggestion.type}-${suggestion.name}`}
                                        suggestion={suggestion}
                                    />
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-gray-500">No connection suggestions available.</p>
                        )}
                    </section>

                    <UpcomingEvents events={state.data.suggestionSet.upcoming_events} />
                </>
            )}
        </main>
    );
}
