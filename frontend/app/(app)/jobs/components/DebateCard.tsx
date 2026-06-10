'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { AgentAvatar } from '../../../components/ui/AgentAvatar';
import { formatAgentSpeech } from '../lib/formatAgentSpeech';
import type { AgentCardData, AgentCardDetail } from './agentTheme';

export interface DebateCardProps {
  card: AgentCardData;
}

/** Source label for each detail group — tells the user where the data came from. */
const DETAIL_SOURCE: Record<string, string> = {
  'Key gaps':         'From your profile',
  'Work-life flags':  'From job description',
  'Red flags':        'From Exa research',
  'Glassdoor':        'From Exa research',
  'Timing factors':   'From job listing',
};

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

function DetailList({ detail, color }: { detail: AgentCardDetail; color: string }) {
  const source = DETAIL_SOURCE[detail.label];
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <dt className="text-xs font-semibold text-gray-700">{detail.label}</dt>
        {source && (
          <span className="shrink-0 text-[10px] font-medium text-gray-400">{source}</span>
        )}
      </div>
      <dd className="mt-1">
        <ul className="space-y-0.5">
          {detail.values.map((value, i) => (
            <li
              key={`${detail.label}-${i}`}
              className="flex items-start gap-1.5 text-xs text-gray-600"
            >
              <span
                className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: color }}
                aria-hidden
              />
              {value}
            </li>
          ))}
        </ul>
      </dd>
    </div>
  );
}

export function DebateCard({ card }: DebateCardProps) {
  const [expanded, setExpanded] = useState(false);

  const tldr = card.keyArgument.trim()
    ? toSecondPerson(card.keyArgument.trim())
    : null;

  const fullSpeech = formatAgentSpeech({ reasoning: card.reasoning });
  const hasDetails = card.details.length > 0;

  return (
    <article
      data-testid={`debate-card-${card.agent}`}
      className="flex h-full flex-col rounded-2xl border bg-white p-5 shadow-sm"
      style={{ borderTopColor: card.color, borderTopWidth: 4 }}
      aria-label={`${card.label} verdict`}
    >
      {/* ── Header ── */}
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

      {/* ── Score — number prominent, bar below ── */}
      {!card.failed ? (
        <div className="mt-3" data-testid={`debate-card-${card.agent}-score`}>
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-gray-500">{card.scoreLabel}</span>
            <span
              className="text-xl font-bold tabular-nums"
              style={{ color: card.color }}
            >
              {card.score}
              <span className="text-sm font-normal text-gray-400">/100</span>
            </span>
          </div>
          <div className="mt-1 h-1.5 w-full rounded-full bg-gray-100">
            <div
              className="h-1.5 rounded-full transition-all duration-500"
              style={{
                width: `${Math.max(0, Math.min(100, card.score))}%`,
                backgroundColor: card.color,
              }}
            />
          </div>
        </div>
      ) : null}

      {/* ── TLDR ── */}
      {tldr ? (
        <p
          data-testid={`debate-card-${card.agent}-tldr`}
          className="mt-4 border-l-2 pl-3 text-sm font-semibold leading-snug text-gray-900"
          style={{ borderLeftColor: card.color }}
        >
          {tldr}
        </p>
      ) : null}

      {/* ── Always-visible details (key gaps / red flags / timing factors) ── */}
      {hasDetails ? (
        <dl className="mt-4 space-y-3 text-sm">
          {card.details.map((detail) => (
            <DetailList key={detail.label} detail={detail} color={card.color} />
          ))}
        </dl>
      ) : null}

      {/* ── Full reasoning — collapsible ── */}
      {card.reasoning.trim() ? (
        <div className="mt-3">
          <button
            type="button"
            data-testid={`debate-card-${card.agent}-toggle`}
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 text-xs font-medium text-gray-400 transition hover:text-gray-700"
            aria-expanded={expanded}
          >
            {expanded ? (
              <><ChevronUp size={13} aria-hidden /> Hide reasoning</>
            ) : (
              <><ChevronDown size={13} aria-hidden /> Full reasoning</>
            )}
          </button>

          {expanded ? (
            <blockquote
              data-testid={`debate-card-${card.agent}-speech`}
              className="mt-2 border-l-2 pl-3 text-sm italic leading-relaxed text-gray-600"
              style={{ borderLeftColor: card.color }}
            >
              &ldquo;{fullSpeech}&rdquo;
            </blockquote>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
