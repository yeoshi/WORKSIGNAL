/**
 * Pipeline data loading with silent background retry.
 *
 * Implements the data side of the Pipeline view (Req 17.1, 17.2): the
 * applications are fetched from the relative `/api/pipeline` BFF endpoint
 * (wired in task 24.1), and on any load failure the loader retries in the
 * background WITHOUT surfacing an error to the user.
 *
 * The retry logic is intentionally decoupled from React so it can be unit /
 * component tested in isolation (task 23.2): the `fetcher`, `delay`, and
 * `isCancelled` collaborators are all injectable.
 */

import type { Application } from '@/app/types/shared';

/** Relative BFF endpoint serving the authenticated user's applications. */
export const PIPELINE_ENDPOINT = '/api/pipeline';

/**
 * Fetch the pipeline once from the BFF endpoint.
 *
 * Tolerates either a bare `Application[]` body or a `{ applications: [...] }`
 * envelope. Throws on a non-OK response or a malformed body so the caller's
 * retry loop can react.
 */
export async function fetchPipelineOnce(signal?: AbortSignal): Promise<Application[]> {
  const response = await fetch(PIPELINE_ENDPOINT, {
    headers: { Accept: 'application/json' },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Pipeline request failed with status ${response.status}`);
  }

  const body: unknown = await response.json();

  if (Array.isArray(body)) {
    return body as Application[];
  }

  if (
    body !== null &&
    typeof body === 'object' &&
    Array.isArray((body as { applications?: unknown }).applications)
  ) {
    return (body as { applications: Application[] }).applications;
  }

  throw new Error('Pipeline response had an unexpected shape');
}

/** Default delay between retries, resolving after `ms` milliseconds. */
function defaultDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface LoadPipelineOptions {
  /** How to fetch a single batch of applications. Defaults to the BFF fetch. */
  fetcher?: (signal?: AbortSignal) => Promise<Application[]>;
  /** Called once applications load successfully (and we are not cancelled). */
  onSuccess: (applications: Application[]) => void;
  /** Cooperative cancellation check, polled before each attempt/retry. */
  isCancelled?: () => boolean;
  /** Milliseconds to wait between retry attempts. */
  retryDelayMs?: number;
  /** Maximum attempts before giving up silently. Defaults to unlimited. */
  maxAttempts?: number;
  /** Injectable delay (for tests). */
  delay?: (ms: number) => Promise<void>;
  /**
   * Optional hook invoked on each failed attempt. This is for internal
   * logging/telemetry ONLY — it must never be used to surface an error to
   * the user (Req 17.2 requires silent retry).
   */
  onAttemptError?: (error: unknown, attempt: number) => void;
}

/**
 * Load the pipeline, retrying silently in the background on failure.
 *
 * Resolves once applications have been delivered via `onSuccess`, once the
 * load has been cancelled, or once `maxAttempts` is exhausted. It never
 * throws and never reports failure to the caller's UI — matching the
 * "retry automatically in the background without notifying the User"
 * behaviour of Requirement 17.2.
 */
export async function loadPipelineWithRetry(options: LoadPipelineOptions): Promise<void> {
  const {
    fetcher = fetchPipelineOnce,
    onSuccess,
    isCancelled = () => false,
    retryDelayMs = 3000,
    maxAttempts = Number.POSITIVE_INFINITY,
    delay = defaultDelay,
    onAttemptError,
  } = options;

  let attempt = 0;

  while (!isCancelled() && attempt < maxAttempts) {
    attempt += 1;
    try {
      const applications = await fetcher();
      if (!isCancelled()) {
        onSuccess(applications);
      }
      return;
    } catch (error) {
      onAttemptError?.(error, attempt);
      if (isCancelled() || attempt >= maxAttempts) {
        return;
      }
      await delay(retryDelayMs);
    }
  }
}
