'use client';

import { useState } from 'react';
import type { Filter_Relaxation_Suggestion } from '@worksignal/shared';
import { Button } from '../../../components/ui/Button';

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
  onApprove: (suggestionId: string) => void | Promise<void>;
  onReject: (suggestionId: string) => void | Promise<void>;
  /** When `card`, renders as a stacked issue card inside the issues modal. */
  variant?: 'default' | 'card';
}

export function RelaxationSuggestionPrompt({
  suggestion,
  onApprove,
  onReject,
  variant = 'default',
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

  const showSalaryComparison =
    suggestion.target_non_negotiable === 'min_salary';

  return (
    <section
      role="region"
      aria-label="Filter relaxation suggestion"
      data-testid="relaxation-suggestion-prompt"
      className={[
        'rounded-card border border-ws-line p-5',
        variant === 'card' ? 'bg-ws-card shadow-sm' : 'bg-ws-paper',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-ws-ink">
            {variant === 'card' ? targetLabel : 'Your filters may be too strict'}
          </h3>
          {variant === 'default' && (
            <p className="mt-1 text-sm text-ws-muted">
              The last scan discarded every job. We suggest relaxing one
              non-negotiable.
            </p>
          )}
        </div>
        <span className="shrink-0 rounded-full border border-ws-line bg-ws-card px-3 py-1 font-mono text-xs text-ws-muted">
          {targetLabel}
        </span>
      </div>

      {showSalaryComparison && (
      <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-ws-line bg-ws-card p-3">
          <dt className="font-mono text-[10px] uppercase tracking-widest text-ws-muted">
            Current
          </dt>
          <dd
            className="mt-1 text-sm font-medium text-ws-ink"
            data-testid="relaxation-current-value"
          >
            {formatValue(suggestion.current_value)}
          </dd>
        </div>
        <div className="rounded-lg border border-ws-line bg-ws-card p-3">
          <dt className="font-mono text-[10px] uppercase tracking-widest text-ws-muted">
            Proposed
          </dt>
          <dd
            className="mt-1 text-sm font-medium text-ws-ink"
            data-testid="relaxation-proposed-value"
          >
            {formatValue(suggestion.proposed_value)}
          </dd>
        </div>
      </dl>
      )}

      <p className="mt-3 text-sm text-ws-ink">{suggestion.rationale}</p>

      {suggestion.evidence_job_ids.length > 0 && (
        <p className="mt-1 text-xs text-ws-muted">
          Based on {suggestion.evidence_job_ids.length} scanned job
          {suggestion.evidence_job_ids.length === 1 ? '' : 's'}.
        </p>
      )}

      {isPending ? (
        <div className="mt-4 flex gap-3">
          <Button
            disabled={busy}
            onClick={() => void run(onApprove)}
          >
            Approve
          </Button>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => void run(onReject)}
          >
            Reject
          </Button>
        </div>
      ) : (
        <p
          className="mt-4 text-sm font-medium text-ws-ink"
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
