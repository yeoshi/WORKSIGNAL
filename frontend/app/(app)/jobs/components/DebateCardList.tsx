'use client';

import { useEffect, useState } from 'react';
import type { VerdictSet } from '@worksignal/shared';
import { DebateCard } from './DebateCard';
import { toAgentCards } from './agentTheme';

export interface DebateCardListProps {
  verdicts: VerdictSet;
  /** Per-card entrance delay in milliseconds (design: ≈100ms). */
  staggerMs?: number;
}

/**
 * Renders one debate card per agent (Req 15.2) with a staggered entrance
 * animation (design: ≈100ms delay per card). Cards start faded/offset and
 * animate into place once mounted; the stagger is driven by an inline
 * transition delay so it does not depend on global CSS.
 */
export function DebateCardList({ verdicts, staggerMs = 100 }: DebateCardListProps) {
  const cards = toAgentCards(verdicts);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    // Defer to the next frame so the transition runs from the initial state.
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <section
      data-testid="debate-card-list"
      aria-label="Agent debate"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2"
    >
      {cards.map((card, index) => (
        <div
          key={card.agent}
          data-testid={`debate-card-wrapper-${card.agent}`}
          className="transition-all duration-500 ease-out motion-reduce:transition-none"
          style={{
            transitionDelay: `${index * staggerMs}ms`,
            opacity: entered ? 1 : 0,
            transform: entered ? 'translateY(0)' : 'translateY(12px)',
          }}
        >
          <DebateCard card={card} />
        </div>
      ))}
    </section>
  );
}
