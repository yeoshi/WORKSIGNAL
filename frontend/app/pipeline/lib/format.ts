/**
 * Small display helpers for the Pipeline view.
 */

import type { Application } from '@worksignal/shared';

/**
 * The date an application was "sent" for pipeline display (Req 17.1).
 *
 * For externally-redirected applications the redirect timestamp stands in
 * for the send date; otherwise the SES send timestamp is used.
 */
export function getSentTimestamp(application: Application): string | null {
  if (application.status === 'redirected_external') {
    return application.redirected_at ?? application.sent_at ?? null;
  }
  return application.sent_at ?? null;
}

/** Format an ISO timestamp as a short, locale-stable date (YYYY-MM-DD). */
export function formatSentDate(application: Application): string {
  const timestamp = getSentTimestamp(application);
  if (!timestamp) {
    return '—';
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  // Stable, locale-independent rendering so component snapshots are reliable.
  return date.toISOString().slice(0, 10);
}
