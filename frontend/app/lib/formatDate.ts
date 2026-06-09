const SHORT_DATE = new Intl.DateTimeFormat('en-SG', {
  month: 'short',
  day: 'numeric',
});

const LONG_DATE = new Intl.DateTimeFormat('en-SG', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

function parseDate(value: string): Date | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

/** e.g. "2026-06-02" → "Jun 2" */
export function formatShortDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = parseDate(value);
  if (!date) return value;
  return SHORT_DATE.format(date);
}

/** e.g. "2026-06-02" → "Week of Jun 2" */
export function formatWeekOf(value: string | null | undefined): string {
  if (!value) return '—';
  const formatted = formatShortDate(value);
  return formatted === '—' ? '—' : `Week of ${formatted}`;
}

/** e.g. ISO timestamp → "Jun 2, 2026" */
export function formatLongDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = parseDate(value);
  if (!date) return value;
  return LONG_DATE.format(date);
}
