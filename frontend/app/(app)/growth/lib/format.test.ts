import { describe, it, expect } from 'vitest';
import {
  summarizeWeekPreview,
  formatWeekMetadataStrip,
  formatDaysUntil,
} from './format';

describe('summarizeWeekPreview', () => {
  it('returns max 3 words without ellipsis', () => {
    expect(
      summarizeWeekPreview(
        'Complete Mode Analytics SQL Tutorial and practise window functions',
      ),
    ).toBe('Mode Analytics SQL');
  });

  it('strips content after em dash', () => {
    expect(
      summarizeWeekPreview(
        'Solve LeetCode SQL Top 50 — focus on aggregations and joins',
      ),
    ).toBe('LeetCode SQL Top');
  });

  it('summarizes project actions', () => {
    expect(
      summarizeWeekPreview('Build a Tableau dashboard using a Singapore open dataset'),
    ).toBe('Tableau dashboard Singapore');
  });

  it('summarizes certification actions', () => {
    expect(
      summarizeWeekPreview('Complete the Google Data Analytics Certificate capstone'),
    ).toBe('Google Data Analytics');
  });
});

describe('formatWeekMetadataStrip', () => {
  it('joins cost, time, and type with middle dots', () => {
    expect(formatWeekMetadataStrip('Free', 6, 'course')).toBe(
      'Free · 6 hours · Course',
    );
  });
});

describe('formatDaysUntil', () => {
  it('returns days away within 14 days', () => {
    const urgency = formatDaysUntil('2026-06-20', new Date('2026-06-09T12:00:00Z'));
    expect(urgency).toBe('11 days away');
  });
});
