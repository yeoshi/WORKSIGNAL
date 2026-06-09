'use client';

import { AgentStatusBanner } from './components/AgentStatusBanner';
import { ActionNeededCards } from './components/ActionNeededCards';
import { PipelineSummaryCard } from './components/PipelineSummaryCard';
import {
  GrowthCard,
  IntelligenceCard,
  NetworkCard,
} from './components/InsightCards';
import { RelaxationSuggestionPrompt } from './components/RelaxationSuggestionPrompt';
import { useDashboardData } from './useDashboardData';

/**
 * Main dashboard (task 21.3, Req 9.5/9.6/9.7, 13.2).
 *
 * Composes the agent status banner, action-needed cards, pipeline summary,
 * Growth / Network / intelligence cards, and surfaced
 * Filter_Relaxation_Suggestion approval prompts. Data is loaded from the BFF
 * (`/api/dashboard`, wired in task 24.1); loading and empty states are shown
 * while the API is unavailable.
 */
export default function DashboardPage() {
  const { data, state, approveSuggestion, rejectSuggestion } =
    useDashboardData();

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500">
          Your agents are working through new opportunities.
        </p>
      </header>

      {state === 'loading' && (
        <p
          data-testid="dashboard-loading"
          className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-500"
        >
          Loading your dashboard…
        </p>
      )}

      {state === 'error' && (
        <p
          data-testid="dashboard-error"
          className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-500"
        >
          We couldn&apos;t load your dashboard just yet. It will appear here
          once your agents have run.
        </p>
      )}

      {state === 'ready' && data && (
        <>
          <AgentStatusBanner status={data.agent_status} />

          {data.relaxation_suggestions.length > 0 && (
            <div
              className="space-y-4"
              data-testid="relaxation-suggestions"
            >
              {data.relaxation_suggestions.map((suggestion) => (
                <RelaxationSuggestionPrompt
                  key={suggestion.suggestion_id}
                  suggestion={suggestion}
                  onApprove={approveSuggestion}
                  onReject={rejectSuggestion}
                />
              ))}
            </div>
          )}

          <ActionNeededCards items={data.action_needed} />

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <PipelineSummaryCard pipeline={data.pipeline} />
            <GrowthCard items={data.growth} />
            <NetworkCard items={data.network} />
          </div>

          <IntelligenceCard intelligence={data.intelligence} />
        </>
      )}
    </main>
  );
}
