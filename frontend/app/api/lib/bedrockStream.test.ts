import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { usesAiGateway } from './bedrockStream';

describe('usesAiGateway', () => {
  const original = process.env.AI_GATEWAY_API_KEY;

  beforeEach(() => {
    delete process.env.AI_GATEWAY_API_KEY;
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.AI_GATEWAY_API_KEY;
    } else {
      process.env.AI_GATEWAY_API_KEY = original;
    }
  });

  it('returns false when AI_GATEWAY_API_KEY is unset', () => {
    expect(usesAiGateway()).toBe(false);
  });

  it('returns true when AI_GATEWAY_API_KEY is set', () => {
    process.env.AI_GATEWAY_API_KEY = 'vck_test_key';
    expect(usesAiGateway()).toBe(true);
  });
});
