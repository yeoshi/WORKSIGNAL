import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { AWS_REGION, WORKSIGNAL_SHARED_VERSION } from './index.js';

describe('shared package', () => {
  it('exposes the version marker', () => {
    expect(WORKSIGNAL_SHARED_VERSION).toBe('0.1.0');
  });

  it('targets the configured AWS region', () => {
    expect(AWS_REGION).toBe(process.env.AWS_DEFAULT_REGION ?? 'us-west-2');
  });

  // Smoke test confirming the property-based testing harness (fast-check)
  // is installed and runs the configured minimum of 100 iterations.
  it('runs fast-check property tests', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => {
        return a + b === b + a;
      }),
      { numRuns: 100 },
    );
  });
});
