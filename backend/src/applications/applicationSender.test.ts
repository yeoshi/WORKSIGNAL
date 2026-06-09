/**
 * Unit tests for the Application_Sender (task 16.1).
 *
 * These exercise the sender's pure control flow through injected fakes (no AWS,
 * no S3, no Application_Tracker). They are distinct from the task-16.2
 * integration tests, which drive the SES/AWS-mocked send path end to end.
 *
 * Covers Req 15.6, 16.1, 16.2, 16.3, 16.4, 16.6, 16.8.
 */
import { describe, expect, it, vi } from 'vitest';
import type { Application, NewApplication } from '@worksignal/shared';
import {
  ApplicationSenderImpl,
  createApplicationSender,
  type SendContext,
  type SendEmailParams,
  type SendEmailResult,
  type UserNotification,
} from './applicationSender.js';

const FIXED_NOW = new Date('2024-01-15T08:00:00.000Z');

function baseContext(overrides: Partial<SendContext> = {}): SendContext {
  return {
    user_id: 'user-1',
    job_id: 'job-1',
    verdict_id: 'verdict-1',
    company: 'Acme',
    role_title: 'Backend Engineer',
    user_email: 'user@example.com',
    employer_email: 'jobs@acme.example',
    source_url: 'https://acme.example/jobs/1',
    customised_resume_s3_key: 'resumes/user-1/job-1.pdf',
    customisation_applied: true,
    cover_letter_text: 'Dear Acme, I am keen to apply.',
    ...overrides,
  };
}

interface Harness {
  sender: ApplicationSenderImpl;
  sentEmails: SendEmailParams[];
  createdRecords: NewApplication[];
  notifications: UserNotification[];
  fetchedKeys: string[];
}

function makeHarness(opts: {
  context: SendContext;
  sendResult?: SendEmailResult;
}): Harness {
  const sentEmails: SendEmailParams[] = [];
  const createdRecords: NewApplication[] = [];
  const notifications: UserNotification[] = [];
  const fetchedKeys: string[] = [];

  let seq = 0;

  const sender = createApplicationSender({
    loadContext: async () => opts.context,
    sendEmail: async (params) => {
      sentEmails.push(params);
      return opts.sendResult ?? { messageId: 'msg-1', threadId: 'thread-1' };
    },
    fetchResume: async (key) => {
      fetchedKeys.push(key);
      return new Uint8Array([1, 2, 3]);
    },
    createApplication: async (record): Promise<Application> => {
      createdRecords.push(record);
      seq += 1;
      return {
        ...record,
        application_id: `app-${seq}`,
        status_updated_at: FIXED_NOW.toISOString(),
        classification_confidence: 0,
      };
    },
    notifyUser: async (n) => {
      notifications.push(n);
    },
    now: () => FIXED_NOW,
  });

  return { sender, sentEmails, createdRecords, notifications, fetchedKeys };
}

describe('ApplicationSender — employer email present (Req 16.1, 16.4, 16.5)', () => {
  it('sends via SES with the resume attached and cover-letter body', async () => {
    const h = makeHarness({ context: baseContext() });

    const result = await h.sender.send('app-queued');

    expect(result).toEqual({
      sent: true,
      applicationId: 'app-1',
      threadId: 'thread-1',
    });

    expect(h.sentEmails).toHaveLength(1);
    const email = h.sentEmails[0]!;
    // Req 16.4: recipient = employer, reply-to = user, user CC'd.
    expect(email.to).toBe('jobs@acme.example');
    expect(email.replyTo).toBe('user@example.com');
    expect(email.cc).toEqual(['user@example.com']);
    // Req 16.1: cover-letter text in the body + customised resume attached.
    expect(email.body).toBe('Dear Acme, I am keen to apply.');
    expect(email.attachments).toHaveLength(1);
    expect(email.attachments[0]!.contentType).toBe('application/pdf');
    expect(email.attachments[0]!.content).toEqual(new Uint8Array([1, 2, 3]));
    expect(h.fetchedKeys).toEqual(['resumes/user-1/job-1.pdf']);

    // Req 16.5: a `sent` record with recipient, timestamp, and thread id.
    expect(h.createdRecords).toHaveLength(1);
    const rec = h.createdRecords[0]!;
    expect(rec.status).toBe('sent');
    expect(rec.recipient_email).toBe('jobs@acme.example');
    expect(rec.email_thread_id).toBe('thread-1');
    expect(rec.sent_at).toBe(FIXED_NOW.toISOString());
    expect(rec.redirect_source_url).toBeNull();
  });

  it('uses the edited cover-letter text verbatim (Req 15.6)', async () => {
    const h = makeHarness({ context: baseContext() });

    await h.sender.send('app-queued', 'Edited body, used as-is.');

    expect(h.sentEmails[0]!.body).toBe('Edited body, used as-is.');
    expect(h.createdRecords[0]!.cover_letter_text).toBe('Edited body, used as-is.');
  });

  it('treats an empty-string edited cover letter as a real override', async () => {
    const h = makeHarness({ context: baseContext() });

    await h.sender.send('app-queued', '');

    expect(h.sentEmails[0]!.body).toBe('');
  });
});

describe('ApplicationSender — no employer email (Req 16.6, 16.7)', () => {
  it('returns a redirect outcome and records redirected_external', async () => {
    const h = makeHarness({ context: baseContext({ employer_email: null }) });

    const result = await h.sender.send('app-queued');

    expect(result).toEqual({
      sent: false,
      redirected: true,
      sourceUrl: 'https://acme.example/jobs/1',
    });
    // No SES send attempted.
    expect(h.sentEmails).toHaveLength(0);

    // Req 16.7: record with status redirected_external + source URL + timestamp.
    const rec = h.createdRecords[0]!;
    expect(rec.status).toBe('redirected_external');
    expect(rec.redirect_source_url).toBe('https://acme.example/jobs/1');
    expect(rec.redirected_at).toBe(FIXED_NOW.toISOString());
    expect(rec.recipient_email).toBeNull();
    // Req 16.6: materials remain available on the record.
    expect(rec.customised_resume_s3_key).toBe('resumes/user-1/job-1.pdf');
    expect(rec.cover_letter_text).toBe('Dear Acme, I am keen to apply.');
  });
});

describe('ApplicationSender — bounce (Req 16.8)', () => {
  it('records delivery_failed and notifies the user', async () => {
    const h = makeHarness({
      context: baseContext(),
      sendResult: { messageId: 'msg-1', threadId: 'thread-1', bounced: true },
    });

    const result = await h.sender.send('app-queued');

    expect(result).toEqual({
      sent: false,
      redirected: false,
      reason: 'delivery_failed',
    });
    expect(h.createdRecords[0]!.status).toBe('delivery_failed');

    expect(h.notifications).toHaveLength(1);
    expect(h.notifications[0]!).toMatchObject({
      user_id: 'user-1',
      type: 'delivery_failed',
      application_id: 'app-1',
    });
  });
});

describe('ApplicationSender — sends regardless of decision/state (Req 16.2, 16.3)', () => {
  it('does not consult any decision class or current status to send', async () => {
    // The SendContext carries no decision/status fields; the sender sends
    // purely on the presence of an employer email. This test documents that
    // the only signal driving the send is the employer email.
    const loadContext = vi.fn(async () => baseContext());
    const sendEmail = vi.fn(
      async (): Promise<SendEmailResult> => ({ messageId: 'm', threadId: 't' }),
    );
    const sender = createApplicationSender({
      loadContext,
      sendEmail,
      createApplication: async (record) => ({
        ...record,
        application_id: 'app-x',
        status_updated_at: FIXED_NOW.toISOString(),
        classification_confidence: 0,
      }),
      now: () => FIXED_NOW,
    });

    const result = await sender.send('any-id');

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(result.sent).toBe(true);
  });
});

describe('ApplicationSender — standalone default create (no tracker injected)', () => {
  it('synthesises an application id and returns the descriptor for the caller', async () => {
    const sender = createApplicationSender({
      loadContext: async () => baseContext(),
      sendEmail: async () => ({ messageId: 'm', threadId: 't' }),
      generateApplicationId: () => 'generated-id',
      now: () => FIXED_NOW,
    });

    const outcome = await sender.sendWithOutcome('any-id');

    expect(outcome.application.application_id).toBe('generated-id');
    expect(outcome.newApplication.status).toBe('sent');
    expect(outcome.result).toEqual({
      sent: true,
      applicationId: 'generated-id',
      threadId: 't',
    });
  });
});
