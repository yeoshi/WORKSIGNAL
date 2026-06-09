/**
 * Integration tests for inbox monitoring (task 17.2).
 *
 * Feature: worksignal — Gmail_Monitor end-to-end poll behaviour.
 * Validates: Requirements 18.1, 18.2, 18.4
 *
 * These exercise the *wired-together* monitor (poll → fuzzy company match →
 * Bedrock classification → Application_Tracker.applyClassification → last_poll_at
 * stamp) against fully in-memory fakes — no real AWS, Gmail, or Bedrock:
 *
 *   - an in-memory fake `DynamoDBWrapper` seeded with a user (Gmail token +
 *     inbox_monitoring_available) and that user's applications under the
 *     Applications user-id GSI;
 *   - a fake Gmail client returning canned `InboundEmail`s and recording every
 *     `listMessages` call;
 *   - a fake Bedrock classifier returning JSON labels and recording every prompt;
 *   - a fake `Application_Tracker.applyClassification` recording its calls;
 *   - a fixed clock.
 *
 * Coverage:
 *   1. 30-minute poll gate (Req 18.1): no-op when < 30m since last_poll_at;
 *      runs (and advances last_poll_at) otherwise.
 *   2. Fuzzy company matching (Req 18.2): an email from a company's domain/name
 *      is attributed to that company's application without an exact recipient
 *      match.
 *   3. Classification call shape (Req 18.4): the Bedrock classifier is invoked
 *      with the reply, and the parsed label/confidence drive applyClassification.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DynamoDBWrapper,
  type Application,
  type Classification,
  type DynamoItem,
  type InboundEmail,
  type UserConfig,
} from '@worksignal/shared';
import {
  COMPANY_MATCH_THRESHOLD,
  POLL_INTERVAL_MS,
  createGmailMonitor,
  type ListMessagesArgs,
} from './gmailMonitor.js';

/* ------------------------------------------------------------------ *
 * Table names (match GmailMonitorImpl defaults)
 * ------------------------------------------------------------------ */

const USERS_TABLE = 'Users';
const APPLICATIONS_TABLE = 'Applications';

/* ------------------------------------------------------------------ *
 * In-memory fake DynamoDBWrapper
 * ------------------------------------------------------------------ */

/**
 * A minimal in-memory stand-in for {@link DynamoDBWrapper} supporting the three
 * operations the monitor uses: `get` (single item by key), `update` (apply a
 * `SET a = :x, b = :y` expression), and `query` (filter a table by the GSI's
 * `field = :placeholder` key condition). It extends the real wrapper so it is a
 * structural drop-in for the injected `db`; the real client is never touched
 * (a no-op send stub satisfies the base constructor).
 */
class FakeDynamoDB extends DynamoDBWrapper {
  private readonly tables = new Map<string, DynamoItem[]>();

  constructor() {
    super({ client: { send: async () => ({}) } });
  }

  /** Seed a single item into a table. Items are stored as plain DynamoItems. */
  seed(tableName: string, item: DynamoItem): void {
    const rows = this.tables.get(tableName) ?? [];
    rows.push(item);
    this.tables.set(tableName, rows);
  }

  /** Read back a stored item (test assertions on persisted state). */
  peek<T extends DynamoItem = DynamoItem>(
    tableName: string,
    key: DynamoItem,
  ): T | undefined {
    return this.findByKey(tableName, key) as T | undefined;
  }

  override async get<T extends DynamoItem = DynamoItem>(
    tableName: string,
    key: DynamoItem,
  ): Promise<T | undefined> {
    return this.findByKey(tableName, key) as T | undefined;
  }

  override async update<T extends DynamoItem = DynamoItem>(
    tableName: string,
    key: DynamoItem,
    params: {
      UpdateExpression?: string;
      ExpressionAttributeValues?: Record<string, unknown>;
    },
  ): Promise<T | undefined> {
    const item = this.findByKey(tableName, key);
    if (!item) return undefined;

    const expr = params.UpdateExpression ?? '';
    const values = params.ExpressionAttributeValues ?? {};
    const setClause = expr.replace(/^\s*SET\s+/i, '');
    for (const assignment of setClause.split(',')) {
      const [lhs, rhs] = assignment.split('=').map((s) => s.trim());
      if (lhs && rhs && rhs.startsWith(':')) {
        item[lhs] = values[rhs];
      }
    }
    return item as T;
  }

  override async query<T extends DynamoItem = DynamoItem>(
    tableName: string,
    params: {
      KeyConditionExpression?: string;
      ExpressionAttributeValues?: Record<string, unknown>;
    },
  ): Promise<T[]> {
    const rows = this.tables.get(tableName) ?? [];
    const condition = params.KeyConditionExpression ?? '';
    const values = params.ExpressionAttributeValues ?? {};

    // Parse a simple "field = :placeholder" key condition.
    const match = /^\s*(\w+)\s*=\s*(:\w+)\s*$/.exec(condition);
    if (!match) return rows.slice() as T[];

    const [, field, placeholder] = match;
    const expected = values[placeholder!];
    return rows.filter((row) => row[field!] === expected) as T[];
  }

  private findByKey(tableName: string, key: DynamoItem): DynamoItem | undefined {
    const rows = this.tables.get(tableName) ?? [];
    return rows.find((row) =>
      Object.entries(key).every(([k, v]) => row[k] === v),
    );
  }
}

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

/** Fixed clock for deterministic poll-gate arithmetic. */
const NOW = new Date('2024-06-01T12:00:00.000Z');
const fixedClock = () => NOW;

/** An ISO timestamp `minutes` before {@link NOW}. */
function minutesBefore(minutes: number): string {
  return new Date(NOW.getTime() - minutes * 60 * 1000).toISOString();
}

type SeededUser = UserConfig & { last_poll_at?: string } & DynamoItem;

function makeUser(overrides: Partial<SeededUser> = {}): SeededUser {
  return {
    user_id: 'user-1',
    email: 'seeker@example.com',
    name: 'Job Seeker',
    career_stage: 'mid_career',
    residency_status: 'citizen',
    profile: {} as UserConfig['profile'],
    non_negotiables: {} as UserConfig['non_negotiables'],
    agent_weights: {} as UserConfig['agent_weights'],
    gmail_oauth_token: 'valid-token',
    inbox_monitoring_available: true,
    onboarding_version: 1,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeApplication(overrides: Partial<Application>): Application {
  return {
    application_id: 'app-default',
    user_id: 'user-1',
    job_id: 'job-1',
    verdict_id: 'verdict-1',
    company: 'Acme',
    role_title: 'Backend Engineer',
    customised_resume_s3_key: 's3://resume',
    customisation_applied: true,
    cover_letter_text: 'cover',
    sent_at: '2024-05-01T00:00:00.000Z',
    recipient_email: 'talent@acme-hr.example',
    email_thread_id: null,
    status: 'sent',
    redirect_source_url: null,
    redirected_at: null,
    status_updated_at: '2024-05-01T00:00:00.000Z',
    classification_confidence: 0,
    ...overrides,
  };
}

function makeEmail(overrides: Partial<InboundEmail> = {}): InboundEmail {
  return {
    message_id: 'msg-1',
    thread_id: 'thread-unknown',
    sender_email: 'recruiting@acme.io',
    sender_domain: 'acme.io',
    subject: 'Re: your application',
    body: 'Thanks for applying. We will be in touch.',
    received_at: '2024-06-01T11:30:00.000Z',
    ...overrides,
  };
}

/* ------------------------------------------------------------------ *
 * Fake collaborators
 * ------------------------------------------------------------------ */

/** Fake Gmail client recording every call and returning canned emails. */
function makeFakeGmail(emails: InboundEmail[]) {
  const calls: ListMessagesArgs[] = [];
  return {
    calls,
    listMessages: vi.fn(async (args: ListMessagesArgs) => {
      calls.push(args);
      return emails;
    }),
  };
}

/** Fake Bedrock classifier recording every prompt and returning canned JSON. */
function makeFakeClassifier(responseJson: string) {
  const prompts: string[] = [];
  return {
    prompts,
    invoke: vi.fn(async (prompt: string) => {
      prompts.push(prompt);
      return responseJson;
    }),
  };
}

/** Fake Application_Tracker recording applyClassification calls. */
function makeFakeTracker() {
  const calls: Array<{ applicationId: string; classification: Classification }> =
    [];
  return {
    calls,
    applyClassification: vi.fn(
      async (applicationId: string, classification: Classification) => {
        calls.push({ applicationId, classification });
      },
    ),
  };
}

/** Build a monitor wired to the supplied fakes (sleep stubbed; fixed clock). */
function buildMonitor(opts: {
  db: FakeDynamoDB;
  gmail: ReturnType<typeof makeFakeGmail>;
  classifier: ReturnType<typeof makeFakeClassifier>;
  tracker: ReturnType<typeof makeFakeTracker>;
}) {
  return createGmailMonitor({
    gmail: opts.gmail,
    bedrockInvoke: opts.classifier.invoke,
    tracker: opts.tracker,
    db: opts.db,
    now: fixedClock,
    sleep: async () => {},
  });
}

/* ------------------------------------------------------------------ *
 * 1. Poll gate — Req 18.1
 * ------------------------------------------------------------------ */

describe('Gmail_Monitor inbox monitoring integration', () => {
  let db: FakeDynamoDB;

  beforeEach(() => {
    db = new FakeDynamoDB();
  });

  describe('30-minute poll gate [Validates: Requirements 18.1]', () => {
    it('is a no-op when fewer than 30 minutes have elapsed since last_poll_at', async () => {
      db.seed(USERS_TABLE, makeUser({
        last_poll_at: minutesBefore(10),
      }) as unknown as DynamoItem);
      db.seed(
        APPLICATIONS_TABLE,
        makeApplication({ application_id: 'app-1' }) as unknown as DynamoItem,
      );

      const gmail = makeFakeGmail([makeEmail()]);
      const classifier = makeFakeClassifier('{"label":"callback","confidence":90}');
      const tracker = makeFakeTracker();
      const monitor = buildMonitor({ db, gmail, classifier, tracker });

      await monitor.poll('user-1');

      // No inbox query, no classification, no status update.
      expect(gmail.listMessages).not.toHaveBeenCalled();
      expect(classifier.invoke).not.toHaveBeenCalled();
      expect(tracker.applyClassification).not.toHaveBeenCalled();
      // last_poll_at left untouched.
      const persisted = db.peek<SeededUser>(USERS_TABLE, { user_id: 'user-1' });
      expect(persisted?.last_poll_at).toBe(minutesBefore(10));
    });

    it('runs the poll and advances last_poll_at once 30 minutes have elapsed', async () => {
      db.seed(USERS_TABLE, makeUser({
        last_poll_at: minutesBefore(31),
      }) as unknown as DynamoItem);
      db.seed(
        APPLICATIONS_TABLE,
        makeApplication({ application_id: 'app-1' }) as unknown as DynamoItem,
      );

      const gmail = makeFakeGmail([]); // empty inbox keeps this focused on the gate
      const classifier = makeFakeClassifier('{"label":"other","confidence":0}');
      const tracker = makeFakeTracker();
      const monitor = buildMonitor({ db, gmail, classifier, tracker });

      await monitor.poll('user-1');

      // Inbox was queried with the user's token, scoped from last_poll_at.
      expect(gmail.listMessages).toHaveBeenCalledTimes(1);
      expect(gmail.calls[0]).toMatchObject({
        userId: 'user-1',
        token: 'valid-token',
        since: minutesBefore(31),
      });
      // last_poll_at advanced to the fixed clock's "now".
      const persisted = db.peek<SeededUser>(USERS_TABLE, { user_id: 'user-1' });
      expect(persisted?.last_poll_at).toBe(NOW.toISOString());
    });

    it('runs immediately for a never-polled user (no last_poll_at)', async () => {
      const user = makeUser();
      delete user.last_poll_at;
      db.seed(USERS_TABLE, user as unknown as DynamoItem);

      const gmail = makeFakeGmail([]);
      const classifier = makeFakeClassifier('{"label":"other","confidence":0}');
      const tracker = makeFakeTracker();
      const monitor = buildMonitor({ db, gmail, classifier, tracker });

      await monitor.poll('user-1');

      expect(gmail.listMessages).toHaveBeenCalledTimes(1);
      // No prior timestamp → listMessages called without `since`.
      expect(gmail.calls[0]?.since).toBeUndefined();
      const persisted = db.peek<SeededUser>(USERS_TABLE, { user_id: 'user-1' });
      expect(persisted?.last_poll_at).toBe(NOW.toISOString());
    });
  });

  /* ---------------------------------------------------------------- *
   * 2. Fuzzy company matching — Req 18.2
   * ---------------------------------------------------------------- */

  describe('fuzzy company matching [Validates: Requirements 18.2]', () => {
    it('attributes an email to a company application via sender domain, with no exact recipient match', () => {
      const acme = makeApplication({
        application_id: 'app-acme',
        company: 'Acme',
        recipient_email: 'talent@acme-hr.example', // NOT the sender domain
        email_thread_id: 'thread-A',
      });
      const globex = makeApplication({
        application_id: 'app-globex',
        company: 'Globex',
        recipient_email: 'jobs@globex.example',
        email_thread_id: 'thread-B',
      });

      const email = makeEmail({
        sender_email: 'recruiting@acme.io',
        sender_domain: 'acme.io', // fuzzy domain → Acme, no exact recipient match
        thread_id: 'thread-unrelated',
        subject: 'Re: your recent application',
        body: 'Thanks for your interest.',
      });

      const monitor = buildMonitor({
        db,
        gmail: makeFakeGmail([]),
        classifier: makeFakeClassifier('{"label":"other","confidence":0}'),
        tracker: makeFakeTracker(),
      });

      const result = monitor.matchApplication(email, [acme, globex]);

      expect(result.matched).toBe(true);
      if (result.matched) {
        expect(result.applicationId).toBe('app-acme');
        expect(result.score).toBeGreaterThanOrEqual(COMPANY_MATCH_THRESHOLD);
      }
      // Confirm there was genuinely no exact recipient match to lean on.
      expect(acme.recipient_email).not.toBe(email.sender_email);
    });

    it('matches by company name + thread id without any domain or exact-recipient match', () => {
      const initech = makeApplication({
        application_id: 'app-initech',
        company: 'Initech',
        recipient_email: 'hr@initech.example',
        email_thread_id: 'thread-initech', // known application thread
      });

      const email = makeEmail({
        sender_email: 'noreply@mail-service.test',
        sender_domain: 'mail-service.test', // unrelated domain — no domain signal
        thread_id: 'thread-initech', // belongs to the application's thread
        subject: 'Update on your application',
        body: 'Thank you for applying to Initech for the role.',
      });

      const monitor = buildMonitor({
        db,
        gmail: makeFakeGmail([]),
        classifier: makeFakeClassifier('{"label":"other","confidence":0}'),
        tracker: makeFakeTracker(),
      });

      const result = monitor.matchApplication(email, [initech]);
      expect(result.matched).toBe(true);
      if (result.matched) expect(result.applicationId).toBe('app-initech');
    });

    it('drives applyClassification for the fuzzily-matched application through a full poll', async () => {
      db.seed(USERS_TABLE, makeUser() as unknown as DynamoItem);
      db.seed(
        APPLICATIONS_TABLE,
        makeApplication({
          application_id: 'app-acme',
          company: 'Acme',
          recipient_email: 'talent@acme-hr.example',
        }) as unknown as DynamoItem,
      );
      db.seed(
        APPLICATIONS_TABLE,
        makeApplication({
          application_id: 'app-globex',
          company: 'Globex',
          recipient_email: 'jobs@globex.example',
        }) as unknown as DynamoItem,
      );

      const email = makeEmail({
        sender_email: 'recruiting@acme.io',
        sender_domain: 'acme.io',
        subject: 'Re: your application to Acme',
        body: 'We would love to chat.',
      });
      const gmail = makeFakeGmail([email]);
      const classifier = makeFakeClassifier('{"label":"callback","confidence":92}');
      const tracker = makeFakeTracker();
      const monitor = buildMonitor({ db, gmail, classifier, tracker });

      await monitor.poll('user-1');

      // Only the Acme application receives the classification.
      expect(tracker.calls).toHaveLength(1);
      expect(tracker.calls[0]?.applicationId).toBe('app-acme');
    });
  });

  /* ---------------------------------------------------------------- *
   * 3. Classification call shape — Req 18.4
   * ---------------------------------------------------------------- */

  describe('Bedrock classification call shape [Validates: Requirements 18.4]', () => {
    it('invokes the classifier with the reply and applies the parsed label/confidence', async () => {
      db.seed(USERS_TABLE, makeUser() as unknown as DynamoItem);
      db.seed(
        APPLICATIONS_TABLE,
        makeApplication({
          application_id: 'app-acme',
          company: 'Acme',
        }) as unknown as DynamoItem,
      );

      const email = makeEmail({
        sender_email: 'careers@acme.io',
        sender_domain: 'acme.io',
        subject: 'Interview invitation',
        body: 'We would like to invite you to interview next week.',
      });
      const gmail = makeFakeGmail([email]);
      const classifier = makeFakeClassifier('{"label":"callback","confidence":88}');
      const tracker = makeFakeTracker();
      const monitor = buildMonitor({ db, gmail, classifier, tracker });

      await monitor.poll('user-1');

      // The classifier was invoked exactly once with a prompt carrying the reply.
      expect(classifier.invoke).toHaveBeenCalledTimes(1);
      const prompt = classifier.prompts[0]!;
      expect(prompt).toContain('classifier');
      expect(prompt).toContain('acknowledgement');
      expect(prompt).toContain('callback');
      expect(prompt).toContain('rejection');
      expect(prompt).toContain(email.subject);
      expect(prompt).toContain(email.body);

      // The parsed label + confidence drive applyClassification verbatim.
      expect(tracker.calls).toHaveLength(1);
      expect(tracker.calls[0]).toEqual({
        applicationId: 'app-acme',
        classification: { label: 'callback', confidence: 88 },
      });
    });

    it('passes the parsed rejection label and confidence through to the tracker', async () => {
      db.seed(USERS_TABLE, makeUser() as unknown as DynamoItem);
      db.seed(
        APPLICATIONS_TABLE,
        makeApplication({
          application_id: 'app-acme',
          company: 'Acme',
        }) as unknown as DynamoItem,
      );

      const gmail = makeFakeGmail([
        makeEmail({ sender_domain: 'acme.io', subject: 'Re: application' }),
      ]);
      const classifier = makeFakeClassifier('{"label":"rejection","confidence":40}');
      const tracker = makeFakeTracker();
      const monitor = buildMonitor({ db, gmail, classifier, tracker });

      await monitor.poll('user-1');

      expect(tracker.calls[0]?.classification).toEqual({
        label: 'rejection',
        confidence: 40,
      });
    });

    it('does not classify when no application matches the inbound email', async () => {
      db.seed(USERS_TABLE, makeUser() as unknown as DynamoItem);
      db.seed(
        APPLICATIONS_TABLE,
        makeApplication({
          application_id: 'app-acme',
          company: 'Acme',
        }) as unknown as DynamoItem,
      );

      // Sender domain + body reference no seeded company.
      const gmail = makeFakeGmail([
        makeEmail({
          sender_email: 'news@unrelated-vendor.test',
          sender_domain: 'unrelated-vendor.test',
          subject: 'Weekly newsletter',
          body: 'Here are this week updates from a vendor.',
        }),
      ]);
      const classifier = makeFakeClassifier('{"label":"other","confidence":0}');
      const tracker = makeFakeTracker();
      const monitor = buildMonitor({ db, gmail, classifier, tracker });

      await monitor.poll('user-1');

      expect(classifier.invoke).not.toHaveBeenCalled();
      expect(tracker.applyClassification).not.toHaveBeenCalled();
      // Poll still completed → last_poll_at stamped.
      const persisted = db.peek<SeededUser>(USERS_TABLE, { user_id: 'user-1' });
      expect(persisted?.last_poll_at).toBe(NOW.toISOString());
    });
  });

  it('verifies the 30-minute interval constant matches Req 18.1', () => {
    expect(POLL_INTERVAL_MS).toBe(30 * 60 * 1000);
  });
});
