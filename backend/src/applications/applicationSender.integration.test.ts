/**
 * Integration tests for the Application_Sender send path (task 16.2).
 *
 * These are DISTINCT from the task-16.1 unit tests (`applicationSender.test.ts`,
 * which drive the sender's control flow through lightweight fakes). Here the
 * sender is wired end to end into the surrounding infrastructure seams:
 *
 *  - A mocked SES transport (`FakeSes`) that captures the full
 *    {@link SendEmailParams} (recipient, reply-to, CC, subject, body, and the
 *    attachment headers) so the over-the-wire shape can be asserted (Req 16.1,
 *    16.4).
 *  - The REAL {@link ApplicationTrackerImpl}, backed by an in-memory DynamoDB
 *    document client, so each created record flows through the tracker's
 *    `create` → creation-path status machine → persistence (Req 16.5/16.7/16.8).
 *    A thin recording wrapper around the tracker's `create` also captures the
 *    {@link NewApplication} descriptor the sender built.
 *  - An in-memory S3 resume store fronted by the `fetchResume` seam, so the
 *    customised-resume bytes are genuinely fetched and attached as
 *    `application/pdf` (Req 16.1).
 *
 * End-to-end scenarios:
 *   1. Employer-email send → SES recipient = employer, reply-to = user, user
 *      CC'd, customised resume attached (application/pdf), cover-letter body;
 *      persisted record status `sent` with recipient / thread id / timestamp
 *      (Req 16.1, 16.4, 16.5).
 *   2. SES bounce → persisted record status `delivery_failed` + user notified
 *      (Req 16.8).
 *   3. No employer email → redirect outcome exposing the source URL with
 *      materials available; persisted record status `redirected_external`
 *      (Req 16.6, 16.7).
 *
 * _Requirements: 16.1, 16.4, 16.6, 16.8_
 */
import { describe, expect, it } from 'vitest';
import {
  DynamoDBWrapper,
  type Application,
  type DynamoItem,
  type NewApplication,
} from '@worksignal/shared';
import {
  createApplicationSender,
  type SendContext,
  type SendEmailParams,
  type SendEmailResult,
  type UserNotification,
} from './applicationSender.js';
import {
  ApplicationTrackerImpl,
  DEFAULT_APPLICATIONS_TABLE,
} from './applicationTracker.js';

const FIXED_NOW = new Date('2024-03-01T10:30:00.000Z');

/* ------------------------------------------------------------------ *
 * In-memory DynamoDB document client (Put/Get/Query/Update)
 * ------------------------------------------------------------------ */

/**
 * Minimal in-memory stand-in for a DynamoDB Document client. Switches on the
 * SDK command's constructor name and operates on a per-table primary-key map.
 * Only the operations the tracker's `create`/`get`/`list` paths use are
 * implemented; that is enough to persist and read back send-path records.
 */
class InMemoryDocumentClient {
  readonly tables = new Map<string, Map<string, DynamoItem>>();

  private table(name: string): Map<string, DynamoItem> {
    let t = this.tables.get(name);
    if (!t) {
      t = new Map();
      this.tables.set(name, t);
    }
    return t;
  }

  private static keyOf(key: DynamoItem): string {
    return Object.keys(key)
      .sort()
      .map((k) => `${k}=${String(key[k])}`)
      .join('|');
  }

  async send(command: { constructor: { name: string }; input: DynamoItem }) {
    const name = command.constructor.name;
    const input = command.input as Record<string, unknown>;
    const tableName = String(input.TableName);

    switch (name) {
      case 'PutCommand': {
        const item = input.Item as DynamoItem;
        const pk = item.application_id ?? item.verdict_id ?? item.user_id;
        this.table(tableName).set(
          InMemoryDocumentClient.keyOf({ pk: String(pk) }),
          item,
        );
        return {};
      }
      case 'GetCommand': {
        const item = this.table(tableName).get(
          InMemoryDocumentClient.keyOf({
            pk: String((input.Key as DynamoItem).application_id),
          }),
        );
        return { Item: item };
      }
      case 'QueryCommand': {
        return { Items: [...this.table(tableName).values()] };
      }
      default:
        throw new Error(`InMemoryDocumentClient: unsupported ${name}`);
    }
  }
}

/* ------------------------------------------------------------------ *
 * Mocked SES transport
 * ------------------------------------------------------------------ */

class FakeSes {
  readonly sent: SendEmailParams[] = [];
  constructor(private readonly result: SendEmailResult) {}

  send = async (params: SendEmailParams): Promise<SendEmailResult> => {
    this.sent.push(params);
    return this.result;
  };
}

/* ------------------------------------------------------------------ *
 * Test wiring
 * ------------------------------------------------------------------ */

function baseContext(overrides: Partial<SendContext> = {}): SendContext {
  return {
    user_id: 'user-42',
    job_id: 'job-99',
    verdict_id: 'verdict-7',
    company: 'Globex',
    role_title: 'Platform Engineer',
    user_email: 'candidate@example.com',
    employer_email: 'careers@globex.example',
    source_url: 'https://globex.example/careers/platform-engineer',
    customised_resume_s3_key: 'resumes/user-42/job-99.pdf',
    customisation_applied: true,
    cover_letter_text: 'Dear Globex team, I would love to join the platform org.',
    ...overrides,
  };
}

interface Rig {
  send: (id: string, edited?: string) => Promise<Application>;
  ses: FakeSes;
  store: InMemoryDocumentClient;
  recordedNew: NewApplication[];
  notifications: UserNotification[];
  fetchedKeys: string[];
}

/**
 * Build the fully wired sender + real tracker over an in-memory store.
 *
 * `createApplication` delegates to the real {@link ApplicationTrackerImpl}
 * (recording the {@link NewApplication} the sender produced first), so a
 * successful send genuinely persists a record we can read back from the store.
 */
function makeRig(opts: {
  context: SendContext;
  sendResult: SendEmailResult;
}): Rig {
  const store = new InMemoryDocumentClient();
  const db = new DynamoDBWrapper({ client: store });

  let appSeq = 0;
  const tracker = new ApplicationTrackerImpl({
    db,
    now: () => FIXED_NOW,
    generateApplicationId: () => `app-${(appSeq += 1)}`,
  });

  const ses = new FakeSes(opts.sendResult);
  const recordedNew: NewApplication[] = [];
  const notifications: UserNotification[] = [];
  const fetchedKeys: string[] = [];

  // In-memory "S3": resume bytes keyed by the customised-resume S3 key.
  const resumeBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // "%PDF"
  const resumeStore = new Map<string, Uint8Array>([
    [opts.context.customised_resume_s3_key, resumeBytes],
  ]);

  const sender = createApplicationSender({
    loadContext: async () => opts.context,
    sendEmail: ses.send,
    fetchResume: async (key) => {
      fetchedKeys.push(key);
      return resumeStore.get(key) ?? new Uint8Array();
    },
    createApplication: async (record) => {
      recordedNew.push(record);
      return tracker.create(record);
    },
    notifyUser: async (n) => {
      notifications.push(n);
    },
    now: () => FIXED_NOW,
  });

  return {
    send: async (id, edited) => {
      const outcome = await sender.sendWithOutcome(id, edited);
      return outcome.application;
    },
    ses,
    store,
    recordedNew,
    notifications,
    fetchedKeys,
  };
}

/** Read a persisted application back out of the in-memory store. */
function persisted(store: InMemoryDocumentClient, applicationId: string): Application {
  const table = store.tables.get(DEFAULT_APPLICATIONS_TABLE);
  const item = [...(table?.values() ?? [])].find(
    (i) => i.application_id === applicationId,
  );
  if (!item) throw new Error(`no persisted application ${applicationId}`);
  return item as unknown as Application;
}

/* ------------------------------------------------------------------ *
 * 1. Employer-email send path (Req 16.1, 16.4, 16.5)
 * ------------------------------------------------------------------ */

describe('Application_Sender integration — employer-email send path', () => {
  it('emails the employer with correct headers + PDF attachment and persists a sent record', async () => {
    const rig = makeRig({
      context: baseContext(),
      sendResult: { messageId: 'ses-msg-1', threadId: 'thread-abc' },
    });

    const application = await rig.send('queued-app');

    // --- SES over-the-wire shape (Req 16.1, 16.4) ---
    expect(rig.ses.sent).toHaveLength(1);
    const email = rig.ses.sent[0]!;
    expect(email.to).toBe('careers@globex.example'); // recipient = employer
    expect(email.replyTo).toBe('candidate@example.com'); // reply-to = user
    expect(email.cc).toEqual(['candidate@example.com']); // user CC'd
    expect(email.subject).toBe('Application for Platform Engineer at Globex');
    expect(email.body).toBe(
      'Dear Globex team, I would love to join the platform org.',
    );

    // Customised resume attached as application/pdf, bytes fetched from "S3".
    expect(rig.fetchedKeys).toEqual(['resumes/user-42/job-99.pdf']);
    expect(email.attachments).toHaveLength(1);
    const attachment = email.attachments[0]!;
    expect(attachment.contentType).toBe('application/pdf');
    expect(attachment.filename).toBe('resume.pdf');
    expect(attachment.content).toEqual(new Uint8Array([0x25, 0x50, 0x44, 0x46]));

    // --- Persisted record via the real tracker (Req 16.5) ---
    expect(application.status).toBe('sent');
    expect(application.recipient_email).toBe('careers@globex.example');
    expect(application.email_thread_id).toBe('thread-abc');
    expect(application.sent_at).toBe(FIXED_NOW.toISOString());
    expect(application.redirect_source_url).toBeNull();

    const stored = persisted(rig.store, application.application_id);
    expect(stored.status).toBe('sent');
    expect(stored.email_thread_id).toBe('thread-abc');
    expect(stored.customised_resume_s3_key).toBe('resumes/user-42/job-99.pdf');

    // The NewApplication descriptor the sender produced was recorded.
    expect(rig.recordedNew).toHaveLength(1);
    expect(rig.recordedNew[0]!.status).toBe('sent');

    // No bounce notification on the happy path.
    expect(rig.notifications).toHaveLength(0);
  });

  it('uses the edited cover-letter text verbatim in the SES body (Req 15.6 over the send path)', async () => {
    const rig = makeRig({
      context: baseContext(),
      sendResult: { messageId: 'ses-msg-2', threadId: 'thread-xyz' },
    });

    await rig.send('queued-app', 'Hand-edited cover letter, sent as-is.');

    expect(rig.ses.sent[0]!.body).toBe('Hand-edited cover letter, sent as-is.');
    expect(rig.recordedNew[0]!.cover_letter_text).toBe(
      'Hand-edited cover letter, sent as-is.',
    );
  });
});

/* ------------------------------------------------------------------ *
 * 2. Bounce path (Req 16.8)
 * ------------------------------------------------------------------ */

describe('Application_Sender integration — SES bounce', () => {
  it('persists delivery_failed and notifies the user when SES reports a bounce', async () => {
    const rig = makeRig({
      context: baseContext(),
      sendResult: { messageId: 'ses-msg-3', threadId: 'thread-b', bounced: true },
    });

    const application = await rig.send('queued-app');

    // The email is still attempted via SES before the bounce is observed.
    expect(rig.ses.sent).toHaveLength(1);

    // Status persisted as delivery_failed (Req 16.8).
    expect(application.status).toBe('delivery_failed');
    expect(persisted(rig.store, application.application_id).status).toBe(
      'delivery_failed',
    );

    // User notified about the failed delivery (Req 16.8).
    expect(rig.notifications).toHaveLength(1);
    expect(rig.notifications[0]!).toMatchObject({
      user_id: 'user-42',
      type: 'delivery_failed',
      application_id: application.application_id,
    });
    expect(rig.notifications[0]!.message).toContain('Globex');
  });
});

/* ------------------------------------------------------------------ *
 * 3. No-employer redirect path (Req 16.6, 16.7)
 * ------------------------------------------------------------------ */

describe('Application_Sender integration — no employer email (redirect)', () => {
  it('exposes the source URL with materials and persists redirected_external', async () => {
    const rig = makeRig({
      context: baseContext({ employer_email: null }),
      // sendResult is irrelevant: SES must not be called on this path.
      sendResult: { messageId: 'unused' },
    });

    const application = await rig.send('queued-app');

    // Req 16.6: no SES send is attempted; the user is redirected instead.
    expect(rig.ses.sent).toHaveLength(0);

    // Req 16.7: record persisted with redirected_external + source URL + ts.
    expect(application.status).toBe('redirected_external');
    expect(application.redirect_source_url).toBe(
      'https://globex.example/careers/platform-engineer',
    );
    expect(application.redirected_at).toBe(FIXED_NOW.toISOString());
    expect(application.recipient_email).toBeNull();

    // Req 16.6: materials remain available on the record for manual submission.
    expect(application.customised_resume_s3_key).toBe(
      'resumes/user-42/job-99.pdf',
    );
    expect(application.cover_letter_text).toBe(
      'Dear Globex team, I would love to join the platform org.',
    );

    const stored = persisted(rig.store, application.application_id);
    expect(stored.status).toBe('redirected_external');
    expect(stored.redirect_source_url).toBe(
      'https://globex.example/careers/platform-engineer',
    );

    // No bounce notification on the redirect path.
    expect(rig.notifications).toHaveLength(0);
  });
});
