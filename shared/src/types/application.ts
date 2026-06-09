/**
 * Application, reply-classification, and inbox-matching types.
 *
 * Mirrors the Applications table schema (Req 16, 17) and the Gmail_Monitor
 * contract (Req 18).
 */

import type { ApplicationStatus, ReplyLabel } from './enums.js';

/**
 * A tracked application record (Applications table). Created by the
 * Application_Tracker on send / redirect / bounce (Req 16.5, 16.7, 16.8).
 */
export interface Application {
  application_id: string;
  user_id: string;
  job_id: string;
  verdict_id: string;
  /** Denormalised for pipeline display and role disambiguation. */
  company: string;
  role_title: string;
  customised_resume_s3_key: string;
  /** False when the base resume was used as a fallback (Req 14.4, 14.5). */
  customisation_applied: boolean;
  cover_letter_text: string;
  sent_at: string;
  recipient_email: string | null;
  email_thread_id: string | null;
  status: ApplicationStatus;
  /** Source URL for the `redirected_external` path (Req 16.7). */
  redirect_source_url: string | null;
  /** Timestamp of the external redirect (Req 16.7). */
  redirected_at: string | null;
  status_updated_at: string;
  /** Confidence of the most recent reply classification (Req 18.4). */
  classification_confidence: number;
}

/** Payload accepted by `ApplicationTracker.create`. */
export type NewApplication = Omit<
  Application,
  'application_id' | 'status_updated_at' | 'classification_confidence'
> & {
  classification_confidence?: number;
};

/**
 * Classification of an inbound reply email (Req 18.4).
 * `confidence` is a Classification_Confidence in 0-100.
 */
export interface Classification {
  label: ReplyLabel;
  confidence: number;
}

/**
 * Result of matching an inbound email to a sent application via fuzzy
 * company / thread matching (Req 18.2, 18.3).
 */
export type MatchResult =
  | { matched: true; applicationId: string; score: number }
  | { matched: false };
