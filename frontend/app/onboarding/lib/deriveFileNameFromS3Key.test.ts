import { describe, it, expect } from 'vitest';
import { deriveFileNameFromS3Key } from './deriveFileNameFromS3Key';

describe('deriveFileNameFromS3Key', () => {
  it('returns the last path segment', () => {
    expect(deriveFileNameFromS3Key('resumes/user-1/Tan Yeo Shi Lee CV.pdf')).toBe(
      'Tan Yeo Shi Lee CV.pdf',
    );
  });

  it('returns undefined for empty input', () => {
    expect(deriveFileNameFromS3Key(undefined)).toBeUndefined();
    expect(deriveFileNameFromS3Key('')).toBeUndefined();
  });
});
