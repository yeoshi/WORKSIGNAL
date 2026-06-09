/**
 * Application_Sender — SES send, external redirect, and bounce handling
 * (Task 16.1).
 *
 * Implements the `ApplicationSender` contract from the design document and
 * Requirements 15.6 and 16.1–16.8 (record-creation side of 16.5/16.7/16.8 is
 * produced here as a {@link NewApplication} descriptor and persisted through an
 * injectable Application_Tracker `create`):
 *
 *   15.6 WHEN a User edits the cover-letter field and triggers Send, THE
 *        Application_Sender SHALL use the edited cover-letter text.
 *   16.1 WHEN Send is triggered AND an employer contact email is available, THE
 *        Application_Sender SHALL email the employer via SES with the customised
 *        resume attached and the cover-letter text in the body.
 *   16.2 Send works regardless of the Master_Orchestrator Decision class.
 *   16.3 Send works regardless of the application's current state.
 *   16.4 The recipient is the employer contact address, the reply-to is the
 *        User's email, and the User is CC'd.
 *   16.5 A successful send creates an Application record with status `sent`,
 *        the recipient, the send timestamp, and the email thread id.
 *   16.6 IF no employer contact email is available, WORKSIGNAL shows a redirect
 *        link to the job's source URL and makes the resume + cover letter
 *        available for manual submission.
 *   16.7 The external-redirect path creates an Application record with status
 *        `redirected_external`, the source URL, and the redirect timestamp.
 *   16.8 IF SES reports a bounce, the Application status is set to
 *        `delivery_failed` and the User is notified.
 *
 * Design notes / testability:
 *  - The SES client is injected as a {@link SendEmailFn} so the sender is unit
 *    testable without AWS. The default throws if no client is wired (the real
 *    SES client is provided by the Lambda runtime / task 16.2 integration).
 *  - The resume attachment bytes are fetched through an injectable
 *    {@link FetchResumeFn} (S3 seam), so no S3 access is required in tests.
 *  - Application records are created through an injectable
 *    {@link CreateApplicationFn} (Application_Tracker.create, owned by task
 *    16.3). To avoid a hard dependency/conflict with that module, this module
 *    only depends on the *function shape*; when no `createApplication` is
 *    injected a default in-memory synthesiser assigns an `application_id` and
 *    returns the full {@link Application}, and the built {@link NewApplication}
 *    descriptor is always returned on the {@link SendOutcome} for the caller to
 *    persist itself if it prefers.
 *  - Bounce handling (16.8) is modelled as a `bounced` flag on the SES result
 *    so the synchronous send seam stays testable; a real SES integration maps
 *    SES bounce notifications onto this flag.
 *  - The sender never inspects the Decision class (16.2) or the application's
 *    current state (16.3): it sends whenever an employer email exists. This is
 *    a property of the control flow, not a guarded branch.
 */

import { randomUUID } from 'node:crypto';
import {
  createLogger,
  type Application,
  type ApplicationSender,
  type Logger,
  type NewApplication,
  type SendResult,
} from '@worksignal/shared';
import {
  deriveInitialStatus,
  type ApplicationCreationPath,
} from './statusMachine.js';

/* ------------------------------------------------------------------ *
 * Injectable seams
 * ------------------------------------------------------------------ */

/** A file attached to an outbound application email (the customised resume). */
export interface EmailAttachment {
  filename: string;
  contentType: string;
  content: Uint8Array;
}

/**
 * Parameters for a single outbound application email (Req 16.1, 16.4).
 *
 * `replyTo` is the User's email and `cc` carries the User so they are copied on
 * the message; `to` is the employer contact address.
 */
export interface SendEmailParams {
  to: string;
  replyTo: string;
  cc: string[];
  subject: string;
  body: string;
  attachments: EmailAttachment[];
}

/**
 * Result of an SES send.
 *
 *  - `messageId`: the SES message id.
 *  - `threadId`: the email thread id recorded on the Application (Req 16.5);
 *    `null` when the transport does not expose one.
 *  - `bounced`: `true` when SES reported the message bounced (Req 16.8).
 */
export interface SendEmailResult {
  messageId: string;
  threadId?: string | null;
  bounced?: boolean;
}

/** Injectable SES send function. Tests inject a fake; prod wires real SES. */
export type SendEmailFn = (params: SendEmailParams) => Promise<SendEmailResult>;

/** Injectable S3 seam fetching the customised-resume bytes for attachment. */
export type FetchResumeFn = (s3Key: string) => Promise<Uint8Array>;

/** Injectable Application_Tracker `create` (task 16.3). */
export type CreateApplicationFn = (
  record: NewApplication,
) => Promise<Application>;

/** A user-facing notification (e.g. a bounce alert, Req 16.8). */
export interface UserNotification {
  user_id: string;
  type: 'delivery_failed';
  message: string;
  application_id: string | null;
}

/** Injectable user-notification sink. Defaults to a structured log line. */
export type NotifyUserFn = (notification: UserNotification) => Promise<void>;

/* ------------------------------------------------------------------ *
 * Send context (the queued application's materials + addressing)
 * ------------------------------------------------------------------ */

/**
 * Everything the sender needs about a queued application to send or redirect.
 *
 * Resolved from the queued debate result / generated materials by an injected
 * {@link LoadSendContextFn}. The sender deliberately does **not** receive the
 * Decision class or the current application status — it never branches on them
 * (Req 16.2, 16.3).
 */
export interface SendContext {
  user_id: string;
  job_id: string;
  verdict_id: string;
  /** Denormalised for the Application record / pipeline display. */
  company: string;
  role_title: string;
  /** The User's email — used as reply-to and CC (Req 16.4). */
  user_email: string;
  /** Employer contact address, or `null` when none exists (Req 16.6). */
  employer_email: string | null;
  /** The job's source URL, used for the external-redirect path (Req 16.6/16.7). */
  source_url: string;
  /** S3 key of the customised (or base-fallback) resume. */
  customised_resume_s3_key: string;
  /** False when the base resume was used as a fallback (Req 14.4/14.5). */
  customisation_applied: boolean;
  /** The prepared cover-letter text (overridden by an edit, Req 15.6). */
  cover_letter_text: string;
  /** Optional subject override; a sensible default is derived otherwise. */
  subject?: string;
}

/** Resolves the {@link SendContext} for a queued application id. */
export type LoadSendContextFn = (
  applicationId: string,
) => Promise<SendContext>;

/* ------------------------------------------------------------------ *
 * Dependencies
 * ------------------------------------------------------------------ */

export interface ApplicationSenderDeps {
  /** Resolves the queued application's materials + addressing (required). */
  loadContext: LoadSendContextFn;
  /** SES send function. Required to actually send; tests inject a fake. */
  sendEmail?: SendEmailFn;
  /** Fetches resume bytes for the attachment. Defaults to empty bytes. */
  fetchResume?: FetchResumeFn;
  /** Application_Tracker.create (task 16.3). Defaults to an in-memory synth. */
  createApplication?: CreateApplicationFn;
  /** User-notification sink (Req 16.8). Defaults to a structured log line. */
  notifyUser?: NotifyUserFn;
  /** Clock injection for deterministic timestamps. Defaults to `Date`. */
  now?: () => Date;
  /** Application-id generator for the default synthesiser. Defaults to UUID. */
  generateApplicationId?: () => string;
  logger?: Logger;
}

/* ------------------------------------------------------------------ *
 * Outcome (SendResult + the persisted/persistable descriptor)
 * ------------------------------------------------------------------ */

/**
 * The full outcome of a send/redirect.
 *
 *  - `result`: the {@link SendResult} returned by {@link ApplicationSender.send}.
 *  - `application`: the created (or synthesised) {@link Application} record.
 *  - `newApplication`: the {@link NewApplication} descriptor that was passed to
 *    `createApplication` — exposed so a caller that prefers to persist the
 *    record itself can do so (per the task's "return a NewApplication
 *    descriptor the caller persists" option).
 */
export interface SendOutcome {
  result: SendResult;
  application: Application;
  newApplication: NewApplication;
}

/* ------------------------------------------------------------------ *
 * Implementation
 * ------------------------------------------------------------------ */

const RESUME_ATTACHMENT_FILENAME = 'resume.pdf';
const RESUME_ATTACHMENT_CONTENT_TYPE = 'application/pdf';

export class ApplicationSenderImpl implements ApplicationSender {
  private readonly loadContext: LoadSendContextFn;
  private readonly sendEmail: SendEmailFn;
  private readonly fetchResume: FetchResumeFn;
  private readonly createApplication: CreateApplicationFn;
  private readonly notifyUser: NotifyUserFn;
  private readonly now: () => Date;
  private readonly generateApplicationId: () => string;
  private readonly logger: Logger;

  constructor(deps: ApplicationSenderDeps) {
    this.loadContext = deps.loadContext;
    this.sendEmail =
      deps.sendEmail ??
      (() => {
        throw new Error(
          'ApplicationSender: no SES sendEmail function configured',
        );
      });
    this.fetchResume = deps.fetchResume ?? (async () => new Uint8Array());
    this.now = deps.now ?? (() => new Date());
    this.generateApplicationId =
      deps.generateApplicationId ?? (() => randomUUID());
    this.logger =
      deps.logger ??
      createLogger({ context: { component: 'Application_Sender' } });
    this.createApplication =
      deps.createApplication ?? this.defaultCreateApplication.bind(this);
    this.notifyUser = deps.notifyUser ?? this.defaultNotifyUser.bind(this);
  }

  /**
   * Send (or redirect) a prepared application (Req 16.1–16.8, 15.6).
   *
   * Behaviour is selected purely by whether an employer contact email exists —
   * never by the Decision class (16.2) or the application's current state
   * (16.3):
   *
   *  - employer email present → SES send with the customised resume attached
   *    and the cover-letter text in the body; recipient = employer, reply-to =
   *    user, user CC'd (16.1, 16.4). On a bounce → `delivery_failed` + notify
   *    (16.8); otherwise a `sent` record (16.5).
   *  - no employer email → an external-redirect outcome exposing the source URL
   *    with the materials available, recorded as `redirected_external` (16.6,
   *    16.7).
   *
   * The edited cover-letter text, when provided, is used verbatim (15.6).
   *
   * @param applicationId - Id of the queued application to send.
   * @param editedCoverLetter - Optional user-edited cover-letter text (15.6).
   * @returns A {@link SendResult} describing the outcome.
   */
  async send(
    applicationId: string,
    editedCoverLetter?: string,
  ): Promise<SendResult> {
    const outcome = await this.sendWithOutcome(applicationId, editedCoverLetter);
    return outcome.result;
  }

  /**
   * Same as {@link send} but returns the full {@link SendOutcome}, including the
   * created {@link Application} and the {@link NewApplication} descriptor.
   */
  async sendWithOutcome(
    applicationId: string,
    editedCoverLetter?: string,
  ): Promise<SendOutcome> {
    const ctx = await this.loadContext(applicationId);
    const log = this.logger.child({
      user_id: ctx.user_id,
      job_id: ctx.job_id,
    });

    // Req 15.6: use the edited cover-letter text verbatim when provided.
    const coverLetterText =
      editedCoverLetter !== undefined ? editedCoverLetter : ctx.cover_letter_text;

    // Req 16.6/16.7: no employer email → external redirect path.
    if (!ctx.employer_email) {
      log.info('No employer email — exposing external redirect', {
        source_url: ctx.source_url,
      });
      return this.redirectOutcome(ctx, coverLetterText);
    }

    // Req 16.1/16.4: send via SES with resume attached + cover letter body.
    const attachment = await this.buildResumeAttachment(ctx);
    const sendResult = await this.sendEmail({
      to: ctx.employer_email,
      replyTo: ctx.user_email,
      cc: [ctx.user_email],
      subject: ctx.subject ?? this.defaultSubject(ctx),
      body: coverLetterText,
      attachments: [attachment],
    });

    // Req 16.8: SES bounce → delivery_failed + notify the user.
    if (sendResult.bounced) {
      log.warn('SES reported a bounce', { recipient: ctx.employer_email });
      return this.bounceOutcome(ctx, coverLetterText, sendResult);
    }

    // Req 16.5: successful send → `sent` record.
    log.info('Application sent via SES', {
      recipient: ctx.employer_email,
      thread_id: sendResult.threadId ?? null,
    });
    return this.sentOutcome(ctx, coverLetterText, sendResult);
  }

  /* ----------------------------- outcomes ----------------------------- */

  private async sentOutcome(
    ctx: SendContext,
    coverLetterText: string,
    sendResult: SendEmailResult,
  ): Promise<SendOutcome> {
    const threadId = sendResult.threadId ?? null;
    const newApplication = this.buildRecord(ctx, coverLetterText, {
      path: { kind: 'employer_email' },
      recipient_email: ctx.employer_email,
      email_thread_id: threadId,
      redirect_source_url: null,
      redirected_at: null,
    });
    const application = await this.createApplication(newApplication);
    return {
      result: {
        sent: true,
        applicationId: application.application_id,
        threadId,
      },
      application,
      newApplication,
    };
  }

  private async redirectOutcome(
    ctx: SendContext,
    coverLetterText: string,
  ): Promise<SendOutcome> {
    const redirectedAt = this.now().toISOString();
    const newApplication = this.buildRecord(ctx, coverLetterText, {
      path: { kind: 'no_employer_email' },
      recipient_email: null,
      email_thread_id: null,
      redirect_source_url: ctx.source_url,
      redirected_at: redirectedAt,
    });
    const application = await this.createApplication(newApplication);
    return {
      result: { sent: false, redirected: true, sourceUrl: ctx.source_url },
      application,
      newApplication,
    };
  }

  private async bounceOutcome(
    ctx: SendContext,
    coverLetterText: string,
    sendResult: SendEmailResult,
  ): Promise<SendOutcome> {
    const newApplication = this.buildRecord(ctx, coverLetterText, {
      path: { kind: 'bounce' },
      recipient_email: ctx.employer_email,
      email_thread_id: sendResult.threadId ?? null,
      redirect_source_url: null,
      redirected_at: null,
    });
    const application = await this.createApplication(newApplication);
    await this.notifyUser({
      user_id: ctx.user_id,
      type: 'delivery_failed',
      message: `Your application to ${ctx.company} for ${ctx.role_title} could not be delivered (the email bounced).`,
      application_id: application.application_id,
    });
    return {
      result: { sent: false, redirected: false, reason: 'delivery_failed' },
      application,
      newApplication,
    };
  }

  /* ----------------------------- helpers ----------------------------- */

  /**
   * Build the {@link NewApplication} descriptor for a given creation path.
   * The status is derived via {@link deriveInitialStatus} so the creation-path
   * → status mapping stays the single source of truth (Req 16.5/16.7/16.8).
   */
  private buildRecord(
    ctx: SendContext,
    coverLetterText: string,
    parts: {
      path: ApplicationCreationPath;
      recipient_email: string | null;
      email_thread_id: string | null;
      redirect_source_url: string | null;
      redirected_at: string | null;
    },
  ): NewApplication {
    return {
      user_id: ctx.user_id,
      job_id: ctx.job_id,
      verdict_id: ctx.verdict_id,
      company: ctx.company,
      role_title: ctx.role_title,
      customised_resume_s3_key: ctx.customised_resume_s3_key,
      customisation_applied: ctx.customisation_applied,
      cover_letter_text: coverLetterText,
      sent_at: this.now().toISOString(),
      recipient_email: parts.recipient_email,
      email_thread_id: parts.email_thread_id,
      status: deriveInitialStatus(parts.path),
      redirect_source_url: parts.redirect_source_url,
      redirected_at: parts.redirected_at,
    };
  }

  private async buildResumeAttachment(
    ctx: SendContext,
  ): Promise<EmailAttachment> {
    const content = await this.fetchResume(ctx.customised_resume_s3_key);
    return {
      filename: RESUME_ATTACHMENT_FILENAME,
      contentType: RESUME_ATTACHMENT_CONTENT_TYPE,
      content,
    };
  }

  private defaultSubject(ctx: SendContext): string {
    return `Application for ${ctx.role_title} at ${ctx.company}`;
  }

  /**
   * Default in-memory `create`: assigns an `application_id` and returns the full
   * record without persisting. Used when no Application_Tracker is injected so
   * the sender works standalone (the caller can persist `newApplication`).
   */
  private async defaultCreateApplication(
    record: NewApplication,
  ): Promise<Application> {
    const nowIso = this.now().toISOString();
    return {
      ...record,
      application_id: this.generateApplicationId(),
      status_updated_at: nowIso,
      classification_confidence: record.classification_confidence ?? 0,
    };
  }

  private async defaultNotifyUser(
    notification: UserNotification,
  ): Promise<void> {
    this.logger.warn('User notification', { ...notification });
  }
}

/** Convenience factory mirroring the {@link ApplicationSenderImpl} constructor. */
export function createApplicationSender(
  deps: ApplicationSenderDeps,
): ApplicationSenderImpl {
  return new ApplicationSenderImpl(deps);
}
