'use client';

/**
 * Priority-ranking control (Req 4.2).
 *
 * Presents the six priority factors as an ordered list the user reorders with
 * up/down controls. Because reordering preserves the permutation invariant, the
 * emitted ranking is always an exact permutation of the six factors — but the
 * surrounding step still runs {@link validatePriorityRanking} so the same
 * messaging path the backend enforces (Req 4.4) is exercised in the UI.
 */
import type { PriorityFactor } from '@worksignal/shared';
import { priorityFactorLabel } from '../../onboarding/validation';

export function PriorityRanking({
  ranking,
  onChange,
}: {
  ranking: PriorityFactor[];
  onChange: (ranking: PriorityFactor[]) => void;
}) {
  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= ranking.length) return;
    const next = [...ranking];
    const a = next[index] as PriorityFactor;
    const b = next[target] as PriorityFactor;
    next[index] = b;
    next[target] = a;
    onChange(next);
  }

  return (
    <ol className="flex flex-col gap-2">
      {ranking.map((factor, index) => (
        <li
          key={factor}
          className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2"
        >
          <span className="flex items-center gap-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 font-mono text-xs font-semibold text-white">
              {index + 1}
            </span>
            <span className="text-sm font-medium text-gray-900">
              {priorityFactorLabel(factor)}
            </span>
          </span>
          <span className="flex items-center gap-1">
            <button
              type="button"
              aria-label={`Move ${priorityFactorLabel(factor)} up`}
              disabled={index === 0}
              onClick={() => move(index, -1)}
              className="rounded-md px-2 py-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30"
            >
              ↑
            </button>
            <button
              type="button"
              aria-label={`Move ${priorityFactorLabel(factor)} down`}
              disabled={index === ranking.length - 1}
              onClick={() => move(index, 1)}
              className="rounded-md px-2 py-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30"
            >
              ↓
            </button>
          </span>
        </li>
      ))}
    </ol>
  );
}
