'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { AgentAvatar } from '../../../components/ui/AgentAvatar';
import { formatAgentSpeech } from '../lib/formatAgentSpeech';
import type { AgentCardData } from './agentTheme';

export interface DebateCardProps {
  card: AgentCardData;
}

function prettyVerdict(verdict: string): string {
  return verdict
    .split('_')
    .map((w) => (w.length > 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function toSecondPerson(text: string): string {
  return text
    .replace(/\bThe user's\b/gi, 'Your')
    .replace(/\bthe user's\b/gi, 'your')
    .replace(/\bUser's\b/g, 'Your')
    .trim();
}

export function DebateCard({ card }: DebateCardProps) {
  const [expanded, setExpanded] = useState(false);

  const tldr = card.keyArgument.trim()
    ? toSecondPerson(card.keyArgument.trim())
    : null;

  const fullSpeech = formatAgentSpeech({
    reasoning: card.reasoning,
  });

  return (
    <article
      data-testid={`debate-card-${card.agent}`}
      className="flex h-full flex-col rounded-2xl border bg-white p-5 shadow-sm"
      style={{ borderTopColor: card.color, borderTopWidth: 4 }}
      aria-label={`${card.label} verdict`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <AgentAvatar agent={card.agent} size={56} />
          <h3 className="text-base font-semibold" style={{ color: card.color }}>
            {card.label}
          </h3>
        </div>
        <span
          data-testid={`debate-card-${card.agent}-verdict`}
          className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold text-white"
          style={{ backgroundColor: card.color }}
        >
          {prettyVerdict(card.verdict)}
        </span>
      </div>

      {!card.failed ? (
        <div className="mt-3" data-testid={`debate-card-${card.agent}-score`}>
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-gray-500">{card.scoreLabel}</span>
            <span className="font-semibold text-gray-900">{card.score}/100</span>
          </div>
          <div className="mt-1 h-1.5 w-full rounded-full bg-gray-100">
            <div
              className="h-1.5 rounded-full"
              style={{
                width: `${Math.max(0, Math.min(100, card.score))}%`,
                backgroundColor: card.color,
              }}
            />
          </div>
        </div>
      ) : null}

      {/* TLDR — bold summary shown first */}
      {tldr ? (
        <p
          data-testid={`debate-card-${card.agent}-tldr`}
          className="mt-4 border-l-2 pl-3 text-sm font-semibold leading-snug text-gray-900"
          style={{ borderLeftColor: card.color }}
        >
          {tldr}
        </p>
      ) : null}

      {/* Full reasoning — collapsible */}
      {card.reasoning.trim() ? (
        <div className="mt-2">
          <button
            type="button"
            data-testid={`debate-card-${card.agent}-toggle`}
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 text-xs font-medium text-gray-400 transition hover:text-gray-700"
            aria-expanded={expanded}
          >
            {expanded ? (
              <>
                <ChevronUp size={13} aria-hidden />
                Hide reasoning
              </>
            ) : (
              <>
                <ChevronDown size={13} aria-hidden />
                Full reasoning
              </>
            )}
          </button>

          {expanded ? (
            <>
              <blockquote
                data-testid={`debate-card-${card.agent}-speech`}
                className="mt-2 border-l-2 pl-3 text-sm italic leading-relaxed text-gray-600"
                style={{ borderLeftColor: card.color }}
              >
                &ldquo;{fullSpeech}&rdquo;
              </blockquote>

              {card.details.length > 0 ? (
                <dl className="mt-4 space-y-2 text-sm">
                  {card.details.map((detail) => (
                    <div key={detail.label}>
                      <dt className="font-medium text-gray-700">{detail.label}</dt>
                      <dd className="mt-0.5">
                        <ul className="list-disc pl-5 text-gray-600">
                          {detail.values.map((value, i) => (
                            <li key={`${detail.label}-${i}`}>{value}</li>
                          ))}
                        </ul>
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
