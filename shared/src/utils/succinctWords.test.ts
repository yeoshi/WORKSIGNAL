import { describe, expect, it } from 'vitest';
import { succinctWords } from './succinctWords.js';

describe('succinctWords', () => {
  it('limits long skill gap labels to five words', () => {
    expect(
      succinctWords(
        'Healthcare domain experience not evidence in profile etc',
        5,
      ),
    ).toBe('Healthcare domain experience not evidence…');
  });

  it('strips pipe and comma segments', () => {
    expect(succinctWords('Job Description Basics | Human Resources', 5)).toBe(
      'Job Description Basics',
    );
  });
});
