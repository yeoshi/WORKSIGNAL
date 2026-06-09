'use client';

import type { ActionNeededItem } from '../types';

/**
 * Action-needed cards (Req 13.2, 12.6).
 *
 * Surfaces decisions that require the user to act:
 *  - `deadlock_escalate` ties that need the user to break them (Req 13.2)
 *  - apply-equivalent decisions flagged `user_action_required` because of a
 *    low realism match score (Req 12.6)
 *
 * Each card links to the Job Detail view where the user resolves the item.
 */

function badgeLabel(item: ActionNeededItem): string {
  if (item.decision === 'deadlock_escalate') return 'Tie — break it';
  if (item.user_action_required) return 'Confirm to apply';
  return 'Needs review';
}

export interface ActionNeededCardsProps {
  items: ActionNeededItem[];
}

export function ActionNeededCards({ items }: ActionNeededCardsProps) {
  return (
    <section aria-label="Action needed" data-testid="action-needed-cards">
      <h2 className="ws-section-label">Needs your decision</h2>
      {items.length === 0 ? (
        <p
          className="rounded-lg border border-dashed border-ws-line bg-ws-card p-5 text-sm text-ws-muted"
          data-testid="action-needed-empty"
        >
          Nothing needs your attention right now.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {items.map((item) => (
            <li key={`${item.job_id}:${item.decision}`}>
              <a
                href={`/jobs/${item.job_id}`}
                className="block rounded-lg border border-ws-line bg-ws-card p-4 transition hover:border-ws-teal/40 hover:shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {item.role_title}
                    </p>
                    <p className="text-sm text-gray-500">{item.company}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-ws-teal/15 px-2.5 py-1 text-xs font-medium text-ws-teal-mid">
                    {badgeLabel(item)}
                  </span>
                </div>
                <p className="mt-2 text-sm text-gray-600">{item.reason}</p>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default ActionNeededCards;
