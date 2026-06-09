'use client';

import { useState } from 'react';
import type { Filter_Relaxation_Suggestion } from '@worksignal/shared';

/**
 * Surfaced Filter_Relaxation_Suggestion approval prompt (Req 9.5, 9.6, 9.7).
 *
 * Rendered when a scan run discarded every job. It presents the proposed
 * adjustment to a single non-negotiable and lets the user explicitly
 * approve or reject it. Non-negotiables are only mutated server-side on
 * approval (Req 9.7); while pending they remain unchanged (Req 9.8).
 *
 * This is a standalone component so component tests (task 21.4) can target
 * its render output and approve / reject interactions directly.
 */

const TARGET_LABELS: Record<
  Filter_Relaxation_Suggestion['target_non_negotiable'],
  string
> = {
  min_salary: 'Minimum salary',
  employment_type: 'Employment type',
  work_arrangement: 'Work arrangement',
  custom: 'Custom dealbreaker',
  ep_related: 'Employment Pass requirement',
};

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export interface RelaxationSuggestionPromptProps {
  suggestion: Filter_Relaxation_Suggestion;
  /** Approve handler — wired to the BFF approval endpoint by the page. */
  onApprove: (suggestionId: string) => void | Promise<void>;
  /** Reject handler — leaves non-negotiables untouched (Req 9.8). */
  onReject: (suggestionId: string) => void | Promise<void>;
}

export function RelaxationSuggestionPrompt({
  suggestion,
  onApprove,
  onReject,
}: RelaxationSuggestionPromptProps) {
  const [busy, setBusy] = useState(false);
  const targetLabel =
    TARGET_LABELS[suggestion.target_non_negotiable] ??
    suggestion.target_non_negotiable;
  const isPending = suggestion.approval_state === 'pending';

  async function run(action: (id: string) => void | Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await action(suggestion.suggestion_id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      role="region"
      aria-label="Filter relaxation suggestion"
      data-testid="relaxation-suggestion-prompt"
      className="rounded-lg border border-amber-300 bg-amber-50 p-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-amber-900">
            Your filters may be too strict
          </h3>
          <p className="mt-1 text-sm text-amber-800">
            The last scan discarded every job. We suggest relaxing one
            non-negotiable.
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-amber-200 px-3 py-1 text-xs font-medium text-amber-900">
          {targetLabel}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-md bg-white/70 p-3">
          <dt className="text-xs uppercase tracking-wide text-amber-700">
            Current
          </dt>
          <dd
            className="mt-1 text-sm font-medium text-gray-900"
            data-testid="relaxation-current-value"
          >
            {formatValue(suggestion.current_value)}
          </dd>
        </div>
        <div className="rounded-md bg-white/70 p-3">
          <dt className="text-xs uppercase tracking-wide text-amber-700">
            Proposed
          </dt>
          <dd
            className="mt-1 text-sm font-medium text-gray-900"
            data-testid="relaxation-proposed-value"
          >
            {formatValue(suggestion.proposed_value)}
          </dd>
        </div>
      </dl>

      <p className="mt-3 text-sm text-amber-900">{suggestion.rationale}</p>

      {suggestion.evidence_job_ids.length > 0 && (
        <p className="mt-1 text-xs text-amber-700">
          Based on {suggestion.evidence_job_ids.length} scanned job
          {suggestion.evidence_job_ids.length === 1 ? '' : 's'}.
        </p>
      )}

      {isPending ? (
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(onApprove)}
            className="rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
          >
            Approve
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(onReject)}
            className="rounded-md border border-amber-400 bg-white px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      ) : (
        <p
          className="mt-4 text-sm font-medium text-amber-900"
          data-testid="relaxation-resolved-state"
        >
          {suggestion.approval_state === 'approved'
            ? 'Approved — your non-negotiables have been updated.'
            : suggestion.approval_state === 'rejected'
              ? 'Rejected — your non-negotiables are unchanged.'
              : 'This suggestion has expired.'}
        </p>
      )}
    </section>
  );
}

export default RelaxationSuggestionPrompt;
