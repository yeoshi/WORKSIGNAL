import { defineConfig } from 'vitest/config';

/**
 * Root Vitest configuration shared across workspaces.
 *
 * Property-based tests use fast-check with a minimum of 100 iterations
 * (see individual test files / fast-check `numRuns`).
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/cdk.out/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
});
