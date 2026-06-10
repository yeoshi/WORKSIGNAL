export const MONTH =
  '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';

export const MONTH_TO_NUM: Record<string, string> = {
  jan: '01',
  feb: '02',
  mar: '03',
  apr: '04',
  may: '05',
  jun: '06',
  jul: '07',
  aug: '08',
  sep: '09',
  oct: '10',
  nov: '11',
  dec: '12',
};

export function toYearMonth(token: string): string {
  const trimmed = token.trim();
  if (/^present$/i.test(trimmed) || /^current$/i.test(trimmed)) return 'Present';

  const yearOnly = trimmed.match(/^(\d{4})$/);
  if (yearOnly) return yearOnly[1];

  const match = trimmed.match(new RegExp(`^(${MONTH})\\s+(\\d{4})$`, 'i'));
  if (!match) return '';

  const monthKey = match[1].slice(0, 3).toLowerCase();
  const month = MONTH_TO_NUM[monthKey];
  return month ? `${match[2]}-${month}` : '';
}

export function parseDateRange(range: string): { start: string; end: string } {
  const trimmed = range.trim();

  const yearOnly = trimmed.match(/^(\d{4})\s*[-–]\s*(\d{4}|Present|Current)$/i);
  if (yearOnly) {
    return {
      start: yearOnly[1],
      end: toYearMonth(yearOnly[2]),
    };
  }

  const monthRange = trimmed.match(
    new RegExp(`^(${MONTH}\\s+\\d{4})\\s*[-–]\\s*(Present|Current|${MONTH}\\s+\\d{4})$`, 'i'),
  );
  if (monthRange) {
    return {
      start: toYearMonth(monthRange[1]),
      end: toYearMonth(monthRange[2]),
    };
  }

  return { start: '', end: '' };
}

export const DATE_RANGE_PATTERN = new RegExp(
  `(?:${MONTH}\\s+\\d{4}|\\d{4})\\s*[-–]\\s*(?:Present|Current|${MONTH}\\s+\\d{4}|\\d{4})`,
  'i',
);
