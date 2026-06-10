'use client';

import type { NetworkSuggestion } from '@/app/types/shared';
import { getInitials } from '../lib/connectionHelpers';
import { daysSpanForReachOuts } from '../lib/networkCompletion';

export interface NetworkCompanyCompletionProps {
  company: string;
  suggestions: NetworkSuggestion[];
  reachedOutDates: Record<string, string>;
  onViewPipeline: () => void;
}

export function NetworkCompanyCompletion({
  company,
  suggestions,
  reachedOutDates,
  onViewPipeline,
}: NetworkCompanyCompletionProps) {
  const count = suggestions.length;
  const daySpan = daysSpanForReachOuts(company, suggestions, reachedOutDates);

  return (
    <div data-testid="network-company-completion" className="flex flex-col items-center px-4 py-6">
      <img
        src="/agents/Network.png"
        alt=""
        width={64}
        height={64}
        className="h-16 w-16 object-contain"
        data-testid="network-completion-mascot"
      />

      <h3
        data-testid="network-completion-title"
        className="mt-3 text-center text-base font-semibold text-gray-900"
      >
        You&apos;ve reached out to all {count} {company} connection{count === 1 ? '' : 's'}
      </h3>

      <p
        data-testid="network-completion-subtitle"
        className="mt-1 text-center text-sm text-gray-400"
      >
        Sent over the last {daySpan} day{daySpan === 1 ? '' : 's'}
      </p>

      <div className="mt-2 flex flex-col items-center gap-2">
        <div
          data-testid="network-completion-avatars"
          className="flex items-center pl-2"
        >
          {suggestions.map((suggestion, index) => (
            <span
              key={suggestion.name}
              className={[
                'flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-gray-200 text-[10px] font-bold text-gray-600',
                index > 0 ? '-ml-2' : '',
              ].join(' ')}
              title={suggestion.name}
            >
              {getInitials(suggestion.name)}
            </span>
          ))}
        </div>
        <p className="text-center text-xs text-gray-500">
          {suggestions.map((s) => s.name).join(', ')}
        </p>
      </div>

      <div
        data-testid="network-completion-followup"
        className="mt-4 flex w-full max-w-lg items-center justify-between gap-3 rounded-xl border border-indigo-100 bg-indigo-50 p-3"
      >
        <p className="text-sm text-indigo-800">
          Following up? Check your {company} applications in the pipeline.
        </p>
        <button
          type="button"
          data-testid="network-view-pipeline"
          onClick={onViewPipeline}
          className="shrink-0 text-xs font-medium text-indigo-600 hover:text-indigo-800"
        >
          View pipeline →
        </button>
      </div>
    </div>
  );
}
