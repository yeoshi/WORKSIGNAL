/**
 * Small display helpers for the Growth Roadmap view.
 */

import { succinctWords } from '@worksignal/shared/succinctWords';

export { succinctWords };

/** Growth tab / card title — max five words. */
export function formatGrowthTitle(text: string, maxWords = 5): string {
  return succinctWords(text, maxWords) || text.trim();
}

/**
 * Format a week's time commitment for display (Req 19.3 "time estimate").
 *
 * `time_hours` is the estimated commitment in hours from {@link RoadmapWeek}.
 */
export function formatTimeEstimate(timeHours: number): string {
  if (!Number.isFinite(timeHours) || timeHours <= 0) {
    return '—';
  }
  return timeHours === 1 ? '1 hour' : `${timeHours} hours`;
}

/**
 * Format a week's cost for display (Req 19.3 "cost").
 *
 * The Growth_Agent stores cost as a free-text string (e.g. "Free", "S$49"),
 * so we only normalise blanks to an em dash.
 */
export function formatCost(cost: string): string {
  const trimmed = cost?.trim();
  return trimmed ? trimmed : '—';
}

/** e.g. "61% -> 79%" → "61% → 79% match" */
export function formatImprovementPill(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '—';
  const normalized = trimmed.replace(/\s*->\s*/g, ' → ');
  return normalized.toLowerCase().includes('match')
    ? normalized
    : `${normalized} match`;
}

/** Returns "{n} days away" when the date is within 14 days; otherwise null. */
export function formatDaysUntil(date: string, now = new Date()): string | null {
  const target = new Date(date);
  if (Number.isNaN(target.getTime())) return null;

  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const diffMs = end.getTime() - start.getTime();
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (days < 0 || days > 14) return null;
  if (days === 0) return 'Today';
  if (days === 1) return '1 day away';
  return `${days} days away`;
}

const PREVIEW_STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'to', 'for', 'with', 'using', 'on', 'in',
  'complete', 'solve', 'build', 'practise', 'practice', 'focus', 'open',
]);

/** Max 3-word preview for timeline labels above milestone dots. */
export function summarizeWeekPreview(action: string): string {
  const primary = action.split(/[—–-]/)[0]?.trim() ?? action.trim();
  const words = primary
    .split(/\s+/)
    .map((w) => w.replace(/[^a-zA-Z0-9&]/g, ''))
    .filter((w) => w.length > 0 && !PREVIEW_STOPWORDS.has(w.toLowerCase()));

  return words.slice(0, 3).join(' ');
}

const TYPE_LABELS: Record<string, string> = {
  course: 'Course',
  project: 'Project',
  event: 'Event',
  certification: 'Certification',
};

/** Compact metadata strip: "Free · 6 hours · Course" */
export function formatWeekMetadataStrip(
  cost: string,
  timeHours: number,
  type: string,
): string {
  const typeLabel = TYPE_LABELS[type] ?? type;
  return `${formatCost(cost)} · ${formatTimeEstimate(timeHours)} · ${typeLabel}`;
}
