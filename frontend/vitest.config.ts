import { defineConfig } from 'vitest/config';

/**
 * Frontend-specific Vitest configuration.
 * Uses jsdom environment with automatic React JSX runtime via esbuild config.
 */
export default defineConfig({
    esbuild: {
        jsx: 'automatic',
    },
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: ['./vitest.setup.ts'],
        include: ['**/*.{test,spec}.{ts,tsx}'],
        exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**'],
    },
});
