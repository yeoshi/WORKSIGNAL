import { describe, it, expect } from 'vitest';
import { getBedrockModel } from './bedrockStream';

describe('getBedrockModel', () => {
  it('returns a language model instance', () => {
    expect(getBedrockModel()).toBeDefined();
  });
});
