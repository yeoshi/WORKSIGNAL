/**
 * Reply-status progression by classification confidence (Application_Tracker).
 *
 * Pure, deterministic logic mapping a sequence of inbound reply classifications
 * onto an Application's pipeline status. This is the *update* half of the
 * Application status model; the *creation* half lives in `./statusMachine.ts`.
 *
 * Design reference: design.md — Gmail_Monitor / Application_Tracker status
 * update rules and the status `stateDiagram-v2` (Req 18.5/18.6/18.7). The
 * status and label types themselves are owned by `@worksignal/shared`
 * (`ApplicationStatus`, `ReplyLabel`, `Classification`).
 *
 * Requirements:
 *  - 18.5: a reply classified with confidence >= 60 updates the application
 *          status *from the classification*.
 *  - 18.6: a reply classified with confidence < 60 sets the status to
 *          `needs_review`.
 *  - 18.7: a later reply classified with confidence >= 60 overrides the
 *          current status regardless of any earlier classification.
 *
 * Correctness property (Property 14, task 7.4): *for any* ordered sequence of
 * replies, the status after processing equals the classification of the most
 * recent reply whose confidence is >= 60; if the most recent processed reply
 * has confidence < 60 it yields `needs_review`; and any later >= 60 reply
 * overrides prior classifications.
 */
import type {
  ApplicationStatus,
  Classification,
  ReplyLabel,
} from '@worksignal/shared';

/**
 * The Classification_Confidence threshold (inclusive) at or above which a reply
 * is trusted enough to set the status from its classification (Req 18.5). A
 * reply with confidence strictly below this yields `needs_review` (Req 18.6).
 *
 * Property 14 boundary: a confidence of exactly 60 counts as "high" (>= 60).
 */
export const CONFIDENCE_THRESHOLD = 60;

/**
 * Map from a reply's classification label to the application status it implies
 * for a high-confidence (>= 60) reply.
 *
 * Per the design status diagram, a >= 60 reply moves the application off `sent`
 * to the status implied by its classification:
 *  - `callback`        → `callback`  (employer wants to proceed)
 *  - `rejection`       → `rejected`  (employer declined)
 *  - `acknowledgement` → `opened`    (employer engaged, no decision yet)
 *  - `other`           → `opened`    (a genuine reply that is neither a
 *                                     callback nor a rejection; the employer
 *                                     has engaged, so the application is at
 *                                     least `opened`)
 *
 * Declared `satisfies` a total record over every {@link ReplyLabel} so the
 * compiler rejects any missing or stray label, keeping the mapping exhaustive
 * and {@link statusForClassification} total.
 */
const STATUS_BY_HIGH_CONFIDENCE_LABEL = {
  callback: 'callback',
  rejection: 'rejected',
  acknowledgement: 'opened',
  other: 'opened',
} as const satisfies Record<ReplyLabel, ApplicationStatus>;

/**
 * Resolve the application status implied by a single reply classification.
 *
 * Total and deterministic over all classifications (Req 18.5/18.6):
 *  - confidence >= {@link CONFIDENCE_THRESHOLD} → status from the label
 *    (Req 18.5)
 *  - confidence <  {@link CONFIDENCE_THRESHOLD} → `needs_review` (Req 18.6)
 *
 * The threshold is inclusive, so confidence exactly 60 is treated as high
 * confidence (Property 14 boundary).
 *
 * @param classification - The reply's label and Classification_Confidence.
 * @returns The {@link ApplicationStatus} that this single reply yields.
 */
export function statusForClassification(
  classification: Classification,
): ApplicationStatus {
  if (classification.confidence >= CONFIDENCE_THRESHOLD) {
    return STATUS_BY_HIGH_CONFIDENCE_LABEL[classification.label];
  }
  return 'needs_review';
}

/**
 * Apply a single newly associated reply to an application's current status.
 *
 * Each reply fully determines the next status (Req 18.5/18.6), and a >= 60
 * reply overrides whatever the current status was (Req 18.7). The current
 * status is therefore not consulted; this signature mirrors a state-transition
 * step and keeps the override semantics explicit at the call site.
 *
 * @param _currentStatus - The application's status before this reply
 *   (intentionally unused: a reply overrides any prior classification, 18.7).
 * @param classification - The newly associated reply's classification.
 * @returns The application's status after processing the reply.
 */
export function applyReplyClassification(
  _currentStatus: ApplicationStatus,
  classification: Classification,
): ApplicationStatus {
  return statusForClassification(classification);
}

/**
 * Fold an ordered sequence of reply classifications onto an application status.
 *
 * Processes replies oldest-to-newest. Because every reply fully determines the
 * next status — a >= 60 reply sets the status from its classification (18.5)
 * and overrides any prior one (18.7), while a < 60 reply sets `needs_review`
 * (18.6) — the final status equals the effect of the *most recently processed*
 * reply:
 *  - if the last processed reply has confidence >= 60, the status is that
 *    reply's classification status (the most recent high-confidence reply
 *    wins, per 18.7);
 *  - if the last processed reply has confidence < 60, the status is
 *    `needs_review` (18.6).
 *
 * When there are no replies, the application's `initialStatus` is returned
 * unchanged (e.g. `sent` / `redirected_external` / `delivery_failed`).
 *
 * @param initialStatus - The application's status before any reply (typically
 *   its creation-path status from `deriveInitialStatus`).
 * @param replies - Replies in chronological (oldest-first) order.
 * @returns The application's status after processing all replies.
 */
export function progressReplyStatus(
  initialStatus: ApplicationStatus,
  replies: readonly Classification[],
): ApplicationStatus {
  return replies.reduce<ApplicationStatus>(
    (status, reply) => applyReplyClassification(status, reply),
    initialStatus,
  );
}
