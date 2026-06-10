import { describe, it, expect } from 'vitest';
import { sanitizeForPdfText, textToResumePdf } from './resumePdf';

describe('sanitizeForPdfText', () => {
  it('replaces Unicode bullets with ASCII hyphens', () => {
    expect(sanitizeForPdfText('● Gained exposure')).toBe('- Gained exposure');
    expect(sanitizeForPdfText('• Built dashboards')).toBe('- Built dashboards');
  });
});

describe('textToResumePdf', () => {
  it('handles Unicode bullets without throwing', async () => {
    const text = 'WORK EXPERIENCE\n● Led data projects at Acme';
    const pdf = await textToResumePdf(text);
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-');
  });

  it('returns a valid PDF buffer with section headings', async () => {
    const text = [
      'Alex Chen',
      '',
      'WORK EXPERIENCE',
      '• Built dashboards at Acme',
      '',
      'EDUCATION',
      'BSc Computer Science',
    ].join('\n');

    const pdf = await textToResumePdf(text);
    const header = new TextDecoder().decode(pdf.slice(0, 5));

    expect(header).toBe('%PDF-');
    expect(pdf.byteLength).toBeGreaterThan(500);
  });
});
