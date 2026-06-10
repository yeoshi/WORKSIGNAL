import type { Decision } from '@/app/types/shared';

export type DecisionTier = 'green' | 'yellow' | 'red';

export function getDecisionTier(decision: Decision): DecisionTier {
  if (decision === 'apply_consensus' || decision === 'apply_with_caveat') {
    return 'green';
  }
  if (decision === 'deadlock_escalate') {
    return 'yellow';
  }
  return 'red';
}

export const DECISION_TIER_STYLES: Record<
  DecisionTier,
  { section: string; badge: string }
> = {
  green: {
    section: 'border-emerald-200 bg-emerald-50',
    badge: '#059669',
  },
  yellow: {
    section: 'border-amber-200 bg-amber-50',
    badge: '#D97706',
  },
  red: {
    section: 'border-rose-200 bg-rose-50',
    badge: '#EF4444',
  },
};
