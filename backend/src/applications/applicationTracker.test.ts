/**
 * Unit tests for the Application_Tracker (task 16.4).
 *
 * Exercises the integration layer that wires the pure reply-progression and
 * ghosting logic to DynamoDB persistence, using an injected in-memory fake
 * `DynamoDBWrapper` and a fixed, controllable clock so the tests are
 * deterministic and never touch AWS or wall-clock time.
 *
 * Coverage (design.md → Application_Tracker):
 *  - Req 18.5: a reply with Classification_Confidence >= 60 updates the status
 *    from the classification (callback → callback, rejection → rejected).
 *  - Req 18.6: a reply with Classification_Confidence < 60 sets `needs_review`.
 *  - Req 18.7: a later >= 60 reply overrides any earlier classification.
 *  - Req 18.9: a `sent` application with no reply for >= 14 days is set to
 *    `ghosted`; one inside the window is left untouched.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  DynamoDBWrapper,
  createLogger,
  type Application,
  type Classification,
  type DynamoItem,
  type NewApplication,
} from '@worksignal/shared';
import {
  createApplicationTracker,
  isGhostingDue,
  GHOSTING_INTERVAL_MS,
  DEFAULT_APPLICATIONS_TABLE,
} from './applicationTracker.js';

/* ------------------------------------------------------------------ *
 * In-memory fake DynamoDBWrapper
 * ------------------------------------------------------------------ */

/**
 * A minimal in-memory stand-in for {@link DynamoDBWrapper} backed by a per-table
 * array of items. It implements only the surface the Application_Tracker uses
 * (`get` / `put` / `update` / `query`) and applies update expressions of the
 * exact `SET a = :x, b = :y` form the tracker emits.
 *
 * It extends the real wrapper purely for type compatibility with
 * `ApplicationTrackerDeps.db`; the dummy `client` passed to `super` is never
 * touched because every method below is overridden.
 */
class InMemoryDynamoDB extends DynamoDBWrapper {
  /** tableName → list of stored items. */
  readonly tables = new Map<string, DynamoItem[]>();

  constructor() {
    super({ client: { send: async () => ({}) } });
  }

  private table(name: string): DynamoItem[] {
    let t = this.tables.get(name);
    if (!t) {
      t = [];
      this.tables.set(name, t);
    }
    return t;
  }

  private static matchesKey(item: DynamoItem, key: DynamoItem): boolean {
    return Object.entries(key).every(([k, v]) => item[k] === v);
  }

  /** Identity used to de-duplicate writes (Applications PK / AgentVerdicts PK). */
  private static identity(item: DynamoItem): unknown {
    return item.application_id ?? item.verdict_id ?? JSON.stringify(item);
  }

  override async get<T extends DynamoItem = DynamoItem>(
    tableName: string,
    key: DynamoItem,
  ): Promise<T | undefined> {
    const found = this.table(tableName).find((i) =>
      InMemoryDynamoDB.matchesKey(i, key),
    );
    return found as T | undefined;
  }

  override async put<T extends DynamoItem = DynamoItem>(
    tableName: string,
    item: T,
  ): Promise<void> {
    const t = this.table(tableName);
    const id = InMemoryDynamoDB.identity(item);
    const idx = t.findIndex((i) => InMemoryDynamoDB.identity(i) === id);
    // Store a shallow clone so later mutations don't leak through references.
    const stored = { ...item };
    if (idx >= 0) t[idx] = stored;
    else t.push(stored);
  }

  override async update<T extends DynamoItem = DynamoItem>(
    tableName: string,
    key: DynamoItem,
    params: {
      UpdateExpression?: string;
      ExpressionAttributeNames?: Record<string, string>;
      ExpressionAttributeValues?: Record<string, unknown>;
    },
  ): Promise<T | undefined> {
    const item = this.table(tableName).find((i) =>
      InMemoryDynamoDB.matchesKey(i, key),
    );
    if (!item) return undefined;

    const expr = (params.UpdateExpression ?? '').replace(/^\s*SET\s+/i, '');
    const names = params.ExpressionAttributeNames ?? {};
    const values = params.ExpressionAttributeValues ?? {};

    for (const assignment of expr.split(',')) {
      const [lhsRaw, rhsRaw] = assignment.split('=').map((s) => s.trim());
      if (!lhsRaw || rhsRaw === undefined) continue;
      const attr = lhsRaw.startsWith('#') ? (names[lhsRaw] ?? lhsRaw) : lhsRaw;
      item[attr] = values[rhsRaw];
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
    const cond = (params.KeyConditionExpression ?? '').trim();
    const values = params.ExpressionAttributeValues ?? {};
    // Parse the single equality predicate the tracker uses: `attr = :v`.
    const [attr, , placeholder] = cond.split(/\s+/);
    const items = this.table(tableName);
    if (!attr || placeholder === undefined) return [...items] as T[];
    const want = values[placeholder];
    return items.filter((i) => i[attr] === want) as T[];
  }
}

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

const USER_ID = 'user-123';
const SILENT_LOGGER = createLogger({
  context: { component: 'test' },
  sink: () => {},
});

/** A fixed reference "now" so elapsed-time logic is deterministic. */
const NOW = new Date('2025-01-30T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

/** Build a `sent` NewApplication, with overridable fields. */
function newSentApplication(
  overrides: Partial<NewApplication> = {},
): NewApplication {
  return {
    user_id: USER_ID,
    job_id: 'job-1',
    verdict_id: 'verdict-1',
    company: 'Acme Corp',
    role_title: 'Software Engineer',
    customised_resume_s3_key: 's3://resumes/r1.pdf',
    customisation_applied: true,
    cover_letter_text: 'Dear hiring manager...',
    sent_at: NOW.toISOString(),
    recipient_email: 'jobs@acme.example',
    email_thread_id: 'thread-1',
    status: 'sent',
    redirect_source_url: null,
    redirected_at: null,
    ...overrides,
  };
}

/**
 * Spin up a tracker over a fresh in-memory DB with a controllable clock.
 * `clock.now` can be reassigned between calls to advance time.
 */
function makeHarness() {
  const db = new InMemoryDynamoDB();
  const clock = { now: NOW };
  let counter = 0;
  const tracker = createApplicationTracker({
    db,
    now: () => clock.now,
    generateApplicationId: () => `app-${++counter}`,
    logger: SILENT_LOGGER,
  });
  return { db, clock, tracker };
}

function classification(
  label: Classification['label'],
  confidence: number,
): Classification {
  return { label, confidence };
}

/** Read the current status of an application straight from the fake store. */
async function readStatus(
  db: InMemoryDynamoDB,
  applicationId: string,
): Promise<Application | undefined> {
  return db.get<Application & DynamoItem>(DEFAULT_APPLICATIONS_TABLE, {
    application_id: applicationId,
  });
}

/* ------------------------------------------------------------------ *
 * 18.5 — high-confidence reply sets status from the classification
 * ------------------------------------------------------------------ */

describe('Application_Tracker.applyClassification — high confidence (Req 18.5)', () => {
  let h: ReturnType<typeof makeHarness>;
  beforeEach(() => {
    h = makeHarness();
  });

  it('a callback reply with confidence >= 60 sets status to callback', async () => {
    const app = await h.tracker.create(newSentApplication());
    await h.tracker.applyClassification(
      app.application_id,
      classification('callback', 85),
    );

    const updated = await readStatus(h.db, app.application_id);
    expect(updated?.status).toBe('callback');
    expect(updated?.classification_confidence).toBe(85);
  });

  it('a rejection reply with confidence >= 60 sets status to rejected', async () => {
    const app = await h.tracker.create(newSentApplication());
    await h.tracker.applyClassification(
      app.application_id,
      classification('rejection', 92),
    );

    const updated = await readStatus(h.db, app.application_id);
    expect(updated?.status).toBe('rejected');
    expect(updated?.classification_confidence).toBe(92);
  });

  it('confidence of exactly 60 is treated as high confidence (boundary)', async () => {
    const app = await h.tracker.create(newSentApplication());
    await h.tracker.applyClassification(
      app.application_id,
      classification('callback', 60),
    );

    const updated = await readStatus(h.db, app.application_id);
    expect(updated?.status).toBe('callback');
  });
});

/* ------------------------------------------------------------------ *
 * 18.6 — low-confidence reply sets needs_review
 * ------------------------------------------------------------------ */

describe('Application_Tracker.applyClassification — low confidence (Req 18.6)', () => {
  it('a reply with confidence < 60 sets status to needs_review', async () => {
    const h = makeHarness();
    const app = await h.tracker.create(newSentApplication());

    await h.tracker.applyClassification(
      app.application_id,
      classification('callback', 59),
    );

    const updated = await readStatus(h.db, app.application_id);
    expect(updated?.status).toBe('needs_review');
    expect(updated?.classification_confidence).toBe(59);
  });

  it('a confident-label rejection below the threshold still routes to needs_review', async () => {
    const h = makeHarness();
    const app = await h.tracker.create(newSentApplication());

    await h.tracker.applyClassification(
      app.application_id,
      classification('rejection', 10),
    );

    const updated = await readStatus(h.db, app.application_id);
    expect(updated?.status).toBe('needs_review');
  });
});

/* ------------------------------------------------------------------ *
 * 18.7 — a later >= 60 reply overrides an earlier classification
 * ------------------------------------------------------------------ */

describe('Application_Tracker — later high-confidence reply overrides (Req 18.7)', () => {
  it('a later callback (>=60) overrides an earlier rejection via applyClassification', async () => {
    const h = makeHarness();
    const app = await h.tracker.create(newSentApplication());

    await h.tracker.applyClassification(
      app.application_id,
      classification('rejection', 90),
    );
    expect((await readStatus(h.db, app.application_id))?.status).toBe('rejected');

    await h.tracker.applyClassification(
      app.application_id,
      classification('callback', 80),
    );

    const updated = await readStatus(h.db, app.application_id);
    expect(updated?.status).toBe('callback');
    expect(updated?.classification_confidence).toBe(80);
  });

  it('a later high-confidence reply overrides an earlier low-confidence needs_review', async () => {
    const h = makeHarness();
    const app = await h.tracker.create(newSentApplication());

    await h.tracker.applyClassification(
      app.application_id,
      classification('other', 30),
    );
    expect((await readStatus(h.db, app.application_id))?.status).toBe(
      'needs_review',
    );

    await h.tracker.applyClassification(
      app.application_id,
      classification('rejection', 95),
    );

    expect((await readStatus(h.db, app.application_id))?.status).toBe('rejected');
  });

  it('applyReplies folds an ordered batch to the effect of the most recent reply', async () => {
    const h = makeHarness();
    const app = await h.tracker.create(newSentApplication());

    await h.tracker.applyReplies(app.application_id, [
      classification('acknowledgement', 70), // -> opened
      classification('rejection', 88), // -> rejected
      classification('callback', 75), // -> callback (most recent, wins)
    ]);

    const updated = await readStatus(h.db, app.application_id);
    expect(updated?.status).toBe('callback');
    expect(updated?.classification_confidence).toBe(75);
  });
});

/* ------------------------------------------------------------------ *
 * 18.9 — ghosting after 14 days with no reply
 * ------------------------------------------------------------------ */

describe('Application_Tracker — ghosting after 14 days (Req 18.9)', () => {
  it('checkGhosting marks a sent application ghosted once 14 days elapse with no reply', async () => {
    const h = makeHarness();
    const sentAt = new Date(NOW.getTime() - 15 * DAY_MS);
    const app = await h.tracker.create(
      newSentApplication({ sent_at: sentAt.toISOString() }),
    );

    const result = await h.tracker.checkGhosting(app.application_id);

    expect(result?.status).toBe('ghosted');
    expect((await readStatus(h.db, app.application_id))?.status).toBe('ghosted');
  });

  it('checkGhosting leaves a sent application untouched inside the 14-day window', async () => {
    const h = makeHarness();
    const sentAt = new Date(NOW.getTime() - 13 * DAY_MS);
    const app = await h.tracker.create(
      newSentApplication({ sent_at: sentAt.toISOString() }),
    );

    const result = await h.tracker.checkGhosting(app.application_id);

    expect(result).toBeNull();
    expect((await readStatus(h.db, app.application_id))?.status).toBe('sent');
  });

  it('checkGhosting does not ghost an application that already received a reply', async () => {
    const h = makeHarness();
    const sentAt = new Date(NOW.getTime() - 30 * DAY_MS);
    const app = await h.tracker.create(
      newSentApplication({ sent_at: sentAt.toISOString() }),
    );
    // A callback reply moves it off `sent`; ghosting must no longer apply.
    await h.tracker.applyClassification(
      app.application_id,
      classification('callback', 90),
    );

    const result = await h.tracker.checkGhosting(app.application_id);

    expect(result).toBeNull();
    expect((await readStatus(h.db, app.application_id))?.status).toBe('callback');
  });

  it('sweepGhosting ghosts only the overdue sent applications for a user', async () => {
    const h = makeHarness();
    const overdue = await h.tracker.create(
      newSentApplication({
        sent_at: new Date(NOW.getTime() - 20 * DAY_MS).toISOString(),
      }),
    );
    const recent = await h.tracker.create(
      newSentApplication({
        job_id: 'job-2',
        verdict_id: 'verdict-2',
        sent_at: new Date(NOW.getTime() - 2 * DAY_MS).toISOString(),
      }),
    );

    const ghosted = await h.tracker.sweepGhosting(USER_ID);

    expect(ghosted.map((a) => a.application_id)).toEqual([overdue.application_id]);
    expect((await readStatus(h.db, overdue.application_id))?.status).toBe(
      'ghosted',
    );
    expect((await readStatus(h.db, recent.application_id))?.status).toBe('sent');
  });

  it('isGhostingDue treats exactly 14 days as due (inclusive boundary)', () => {
    const sentAt = new Date(NOW.getTime() - GHOSTING_INTERVAL_MS);
    expect(
      isGhostingDue({ status: 'sent', sent_at: sentAt.toISOString() }, NOW),
    ).toBe(true);

    const justUnder = new Date(NOW.getTime() - GHOSTING_INTERVAL_MS + 1);
    expect(
      isGhostingDue({ status: 'sent', sent_at: justUnder.toISOString() }, NOW),
    ).toBe(false);
  });
});
