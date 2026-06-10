'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { NetworkSuggestion } from '@/app/types/shared';
import { ConnectionCard } from './ConnectionCard';
import type { EnrichedNetworkSuggestion } from '../lib/connectionHelpers';
import {
  connectionReachOutKey,
  type ReachOutChannel,
} from '../lib/networkStorage';

const INITIAL_VISIBLE = 3;

export interface ConnectionCarouselProps {
  suggestions: NetworkSuggestion[];
  company: string;
  reachedOut: Set<string>;
  reachedOutChannels: Record<string, ReachOutChannel>;
  reachedOutDates: Record<string, string>;
  onReachOut: (name: string, channel?: ReachOutChannel) => void;
  onUndoReachOut: (name: string) => void;
}

export function ConnectionCarousel({
  suggestions,
  company,
  reachedOut,
  reachedOutChannels,
  reachedOutDates,
  onReachOut,
  onUndoReachOut,
}: ConnectionCarouselProps) {
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const visible = suggestions.slice(0, visibleCount);
  const showLoadMore = suggestions.length > INITIAL_VISIBLE && visibleCount < suggestions.length;

  return (
    <section aria-label="Connection suggestions">
      <div
        data-testid="connection-carousel"
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 scroll-smooth scrollbar-hide"
      >
        {visible.map((suggestion) => {
          const key = connectionReachOutKey(company, suggestion.name);

          return (
            <ConnectionCard
              key={`${suggestion.type}-${suggestion.name}`}
              suggestion={suggestion as EnrichedNetworkSuggestion}
              company={company}
              reachedOut={reachedOut.has(key)}
              reachOutChannel={reachedOutChannels[key]}
              reachedOutDate={reachedOutDates[key]}
              onReachOut={(channel) => onReachOut(suggestion.name, channel)}
              onUndoReachOut={() => onUndoReachOut(suggestion.name)}
            />
          );
        })}
      </div>

      {showLoadMore && (
        <div className="mt-3 flex flex-col items-center gap-1">
          <p data-testid="connection-load-more-label" className="text-xs text-gray-400">
            {visible.length} of {suggestions.length} shown · Load more
          </p>
          <button
            type="button"
            data-testid="connection-load-more"
            onClick={() => setVisibleCount(suggestions.length)}
            className="text-gray-400 transition hover:text-gray-600"
            aria-label="Load more connections"
          >
            <ChevronDown size={16} aria-hidden />
          </button>
        </div>
      )}
    </section>
  );
}
