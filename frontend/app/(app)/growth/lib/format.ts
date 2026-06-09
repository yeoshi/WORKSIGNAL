/**
 * Small display helpers for the Growth Roadmap view.
 */

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
