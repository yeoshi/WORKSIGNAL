import { describe, it, expect } from 'vitest';
import { formatShortDate, formatWeekOf, formatWeekRange } from './formatDate';

describe('formatDate', () => {
  it('formats ISO dates as short month day', () => {
    expect(formatShortDate('2026-06-02')).toMatch(/Jun/);
    expect(formatShortDate('2026-06-02')).toMatch(/2/);
  });

  it('formats week of label', () => {
    expect(formatWeekOf('2026-06-02')).toMatch(/^Week of /);
    expect(formatWeekOf('2026-06-02')).toMatch(/Jun/);
  });

  it('formats a Mon–Sun week range from week_of', () => {
    const range = formatWeekRange('2026-06-02');
    expect(range).toMatch(/Jun/);
    expect(range).toMatch(/–/);
    expect(range).toMatch(/8/);
    expect(range).toMatch(/2026/);
  });

  it('returns em dash for empty values', () => {
    expect(formatShortDate(null)).toBe('—');
    expect(formatWeekOf(undefined)).toBe('—');
    expect(formatWeekRange(null)).toBe('—');
  });
});
