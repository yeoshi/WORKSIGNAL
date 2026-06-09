'use client';

import { useState } from 'react';
import { Check, CheckCircle2, ChevronDown, Copy, Mail } from 'lucide-react';
import { ConnectionTypeBadge } from './ConnectionTypeBadge';
import {
  formatRoleLine,
  getAgentReasoning,
  getAvatarStyle,
  getInitials,
  type EnrichedNetworkSuggestion,
} from '../lib/connectionHelpers';
import {
  formatReachOutStatus,
  type ReachOutChannel,
} from '../lib/networkStorage';

function LinkedinIcon({ size = 13 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 114.126 0 2.063 2.063 0 01-2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

export interface ConnectionCardProps {
  suggestion: EnrichedNetworkSuggestion;
  company: string;
  reachedOut?: boolean;
  reachOutChannel?: ReachOutChannel;
  reachedOutDate?: string;
  onReachOut?: (channel?: ReachOutChannel) => void;
  onUndoReachOut?: () => void;
  readOnly?: boolean;
}

export function ConnectionCard({
  suggestion,
  company,
  reachedOut = false,
  reachOutChannel,
  reachedOutDate,
  onReachOut,
  onUndoReachOut,
  readOnly = false,
}: ConnectionCardProps) {
  const [draftOpen, setDraftOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const hasLinkedIn = Boolean(suggestion.linkedin_url?.trim());
  const hasEmail = Boolean(suggestion.email?.trim());
  const hasDraft = Boolean(suggestion.outreach_draft?.trim());
  const reachOutLabel = formatReachOutStatus(reachedOutDate, reachOutChannel);

  async function handleCopy() {
    if (!suggestion.outreach_draft?.trim()) return;
    try {
      await navigator.clipboard.writeText(suggestion.outreach_draft);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable in some contexts
    }
  }

  if (readOnly) {
    return (
      <article
        data-testid="connection-card-readonly"
        className="flex min-w-[280px] items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3"
      >
        <div className="min-w-0">
          <h3
            data-testid="connection-name"
            className="text-sm font-semibold text-gray-700"
          >
            {suggestion.name}
          </h3>
          <p data-testid="connection-reached-out-date" className="text-xs text-gray-500">
            {reachOutLabel}
          </p>
        </div>
        <CheckCircle2 size={16} className="shrink-0 text-emerald-500" aria-hidden />
      </article>
    );
  }

  return (
    <article
      data-testid="connection-card"
      data-reached-out={reachedOut || undefined}
      data-reach-out-channel={reachOutChannel}
      className={[
        'flex min-w-[320px] max-w-[320px] snap-start flex-col gap-3 rounded-xl border p-4',
        reachedOut
          ? 'border-emerald-200 bg-emerald-50'
          : 'border-gray-200 bg-white',
      ].join(' ')}
      aria-label={`Connection suggestion: ${suggestion.name}`}
    >
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          <div
            data-testid="connection-avatar"
            className={[
              'flex h-11 w-11 items-center justify-center overflow-hidden rounded-full text-sm font-bold',
              getAvatarStyle(suggestion.type),
            ].join(' ')}
          >
            {suggestion.image_url ? (
              <img
                src={suggestion.image_url}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              getInitials(suggestion.name)
            )}
          </div>
          {reachedOut && (
            <span
              data-testid="connection-avatar-badge"
              className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-emerald-500"
              aria-hidden
            >
              <Check size={8} className="text-white" strokeWidth={3} />
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3
                data-testid="connection-name"
                className="text-sm font-semibold text-gray-900"
              >
                {suggestion.name}
              </h3>
              <p data-testid="connection-context" className="text-xs text-gray-500">
                {formatRoleLine(suggestion.context)}
              </p>
            </div>
            <ConnectionTypeBadge type={suggestion.type} />
          </div>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          Why this person
        </p>
        <p
          data-testid="connection-reasoning"
          className="mt-1 text-xs italic text-gray-600"
        >
          {getAgentReasoning(suggestion, company)}
        </p>
      </div>

      {hasDraft ? (
        <div>
          <button
            type="button"
            data-testid="draft-toggle"
            onClick={() => setDraftOpen((open) => !open)}
            className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700"
          >
            View draft message
            <ChevronDown
              size={14}
              aria-hidden
              className={['transition-transform', draftOpen ? 'rotate-180' : ''].join(' ')}
            />
          </button>

          {draftOpen && (
            <div className="relative mt-2">
              <button
                type="button"
                data-testid="draft-copy"
                onClick={handleCopy}
                className="absolute right-2 top-2 text-gray-400 hover:text-gray-600"
                aria-label="Copy draft message"
              >
                <Copy size={12} aria-hidden />
              </button>
              <blockquote
                data-testid="outreach-draft"
                className="rounded-lg border-l-2 border-teal-400 bg-gray-50 p-3 pr-8 text-xs leading-relaxed text-gray-700"
              >
                {suggestion.outreach_draft}
              </blockquote>
              {copied && (
                <p data-testid="draft-copied" className="mt-1 text-xs text-emerald-600">
                  Copied
                </p>
              )}
            </div>
          )}
        </div>
      ) : (
        <p
          data-testid="outreach-draft-empty"
          className="text-xs italic text-gray-400"
        >
          Draft generating…
        </p>
      )}

      <div className={['mt-auto flex gap-2', reachedOut ? 'opacity-60' : ''].join(' ')}>
        <a
          data-testid="linkedin-action"
          href={hasLinkedIn ? suggestion.linkedin_url : undefined}
          target="_blank"
          rel="noopener noreferrer"
          aria-disabled={!hasLinkedIn}
          title={hasLinkedIn ? undefined : 'Contact info not available'}
          className={[
            'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium',
            hasLinkedIn
              ? 'bg-indigo-600 text-white hover:bg-indigo-700'
              : 'cursor-not-allowed bg-indigo-600 text-white opacity-40',
          ].join(' ')}
          onClick={(e) => {
            if (!hasLinkedIn) {
              e.preventDefault();
              return;
            }
            onReachOut?.('linkedin');
          }}
        >
          <LinkedinIcon />
          Message on LinkedIn
        </a>
        <a
          data-testid="email-action"
          href={hasEmail ? `mailto:${suggestion.email}` : undefined}
          aria-disabled={!hasEmail}
          title={hasEmail ? undefined : 'Contact info not available'}
          className={[
            'flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium',
            hasEmail
              ? 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              : 'cursor-not-allowed border-gray-200 bg-white text-gray-700 opacity-40',
          ].join(' ')}
          onClick={(e) => {
            if (!hasEmail) {
              e.preventDefault();
              return;
            }
            onReachOut?.('email');
          }}
        >
          <Mail size={13} aria-hidden />
          Send email
        </a>
      </div>

      <div className="mt-2 flex flex-col gap-1 border-t border-gray-100 pt-2">
        <label
          data-testid="connection-reach-out-checkbox"
          className="flex cursor-pointer items-center gap-2"
        >
          <input
            type="checkbox"
            checked={reachedOut}
            onChange={(e) => {
              if (e.target.checked) onReachOut?.();
              else onUndoReachOut?.();
            }}
            className="h-3.5 w-3.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
          />
          <span className="text-xs text-gray-500">Mark as reached out</span>
        </label>
        {reachedOut && (
          <p
            data-testid="connection-reached-out"
            className="flex items-center gap-1 text-xs text-emerald-600"
          >
            <CheckCircle2 size={12} aria-hidden />
            {reachOutLabel}
          </p>
        )}
      </div>
    </article>
  );
}
