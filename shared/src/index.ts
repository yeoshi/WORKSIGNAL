/**
 * @worksignal/shared
 *
 * Shared TypeScript types, interfaces, and utilities used across the
 * frontend, backend (Lambda/BFF), and infrastructure workspaces.
 *
 * The full type contracts from the design document live under `./types`
 * and are re-exported here so consumers can import everything from
 * `@worksignal/shared`.
 */

/** Marker constant confirming the shared package is wired up. */
export const WORKSIGNAL_SHARED_VERSION = '0.1.0';

/** AWS region all WORKSIGNAL infrastructure targets — reads from env, falls back to us-west-2. */
export const AWS_REGION = process.env.AWS_DEFAULT_REGION ?? 'us-west-2';

// Shared TypeScript types and service interfaces (design contracts, task 1.2).
export * from './types/index.js';

// --- Shared utilities and error classes (task 1.5) ---
export * from './errors/index.js';
export * from './utils/index.js';
