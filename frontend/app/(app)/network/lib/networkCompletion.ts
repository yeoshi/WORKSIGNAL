import type { NetworkSuggestion } from '@/app/types/shared';
import { connectionReachOutKey } from './networkStorage';

export function daysSpanForReachOuts(
  company: string,
  suggestions: NetworkSuggestion[],
  reachedOutDates: Record<string, string>,
): number {
  const dates = suggestions
    .map((s) => reachedOutDates[connectionReachOutKey(company, s.name)])
    .filter((d): d is string => Boolean(d))
    .map((d) => new Date(d).getTime())
    .filter((t) => !Number.isNaN(t));

  if (dates.length === 0) return 0;

  const earliest = Math.min(...dates);
  const latest = Math.max(...dates);
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.max(1, Math.round((latest - earliest) / dayMs) + 1);
}
