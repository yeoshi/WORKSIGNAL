/**
 * Small display helpers for the Pipeline view.
 */

import type { Application } from '@worksignal/shared';
import { formatShortDate } from '../../../lib/formatDate';

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

/** Format an ISO timestamp as a short display date (e.g. Jun 2). */
export function formatSentDate(application: Application): string {
  const timestamp = getSentTimestamp(application);
  if (!timestamp) return '—';
  return formatShortDate(timestamp);
}
