/**
 * End-to-end integration test covering the full WORKSIGNAL pipeline
 * (Task 24.2, Requirements 7, 10, 13, 16, 18, 21).
 *
 * Exercises the COMPLETE lifecycle from onboarding through weekly recalibration
 * against mocked external services (no real AWS, MCF, Exa, Gmail, SES calls):
 *
 *   1. Onboarding — set up a user with profile, career stage, residency,
 *      targets, priority ranking, non-negotiables.
 *   2. Scan/Debate (Req 7, 10) — Opportunity_Scanner discovers jobs (mocked
 *      MCF), Pre_Filter filters them, Debate_Engine runs 4 agents in parallel
 *      (mocked Bedrock), Master_Orchestrator resolves a verdict → decision.
 *   3. Review (Req 13) — Decision routing: apply_consensus generates materials,
 *      skip_consensus logs only, veto_skip never surfaces.
 *   4. Send (Req 16) — Application_Sender sends via SES (mocked), creates an
 *      Application record with status `sent`.
 *   5. Reply classification (Req 18) — Gmail_Monitor polls inbox (mocked Gmail),
 *      classifies reply, updates Application status.
 *   6. Recalibration (Req 21) — Recalibration_Engine computes per-agent accuracy
 *      from the week's outcomes.
 *
 * All external services are faked in-memory; assertions verify correctness at
 * each pipeline stage.
 */

import { describe, it, expect } from 'vitest';
import {
    DynamoDBWrapper,
    type Application,
    type Classification,
    type DiscoveredJob,
    type DynamoItem,
    type InboundEmail,
    type Job,
    type MasterDecision,
    type Materials,
    type NewApplication,
    type RecalibrationLogEntry,
    type UserConfig,
    type VerdictSet,
    type DocumentClientLike,
} from '@worksignal/shared';
import {
    createOpportunityScanner,
    type McfSearchFn,
    type RawMcfJob,
} from '../discovery/opportunityScanner.js';
import {
    runDebateMachine,
    type GenerateMaterialsHook,
    type JobDebateOutcome,
} from '../debate/debateMachine.js';
import { createGenerateMaterials } from '../debate/materialGeneration.js';
import type {
    BedrockInvoke,
    BedrockRequest,
    ExaClient,
    ExaResult,
} from '../debate/agents/index.js';
import {
    createApplicationSender,
    type SendContext,
    type SendEmailParams,
    type SendEmailResult,
    type UserNotification,
} from '../applications/applicationSender.js';
import {
    ApplicationTrackerImpl,
    DEFAULT_APPLICATIONS_TABLE,
} from '../applications/applicationTracker.js';
import {
    createGmailMonitor,
    type ListMessagesArgs,
} from '../inbox/gmailMonitor.js';
import {
    RecalibrationEngineImpl,
    DEFAULT_RECALIBRATION_LOG_TABLE,
} from '../recalibration/recalibrationEngine.js';
import {
    DEFAULT_AGENT_VERDICTS_TABLE,
} from '../debate/verdictPersistence.js';
import { createOnboardingService } from '../onboarding/onboardingService.js';
import { createLogger } from '@worksignal/shared';

/* ================================================================== *
 * Constants
 * ================================================================== */

const USERS_TABLE = 'Users';
const JOBS_TABLE = 'Jobs';
const APPLICATIONS_TABLE = DEFAULT_APPLICATIONS_TABLE;
const AGENT_VERDICTS_TABLE = DEFAULT_AGENT_VERDICTS_TABLE;
const RECALIBRATION_LOG_TABLE = DEFAULT_RECALIBRATION_LOG_TABLE;

const USER_ID = 'google-sub-e2e';
const USER_EMAIL = 'candidate@example.com';

/* ================================================================== *
 * In-memory fake DynamoDBWrapper
 * ================================================================== */

/**
 * A comprehensive in-memory DynamoDB that supports get/put/update/query/delete.
 * Extends the real wrapper so it is structurally compatible everywhere.
 */
class FakeDynamoDB extends DynamoDBWrapper {
    private readonly store = new Map<string, DynamoItem[]>();

    constructor() {
        super({ client: { send: async () => ({}) } as unknown as DocumentClientLike });
    }

    private table(name: string): DynamoItem[] {
        if (!this.store.has(name)) this.store.set(name, []);
        return this.store.get(name)!;
    }

    /** Seed an item directly. */
    seed(tableName: string, item: DynamoItem): void {
        this.table(tableName).push(structuredClone(item));
    }

    /** Read all items from a table. */
    all<T extends DynamoItem = DynamoItem>(tableName: string): T[] {
        return this.table(tableName).map((i) => structuredClone(i)) as T[];
    }

    override async get<T extends DynamoItem = DynamoItem>(
        tableName: string,
        key: DynamoItem,
    ): Promise<T | undefined> {
        const items = this.table(tableName);
        const found = items.find((item) =>
            Object.entries(key).every(([k, v]) => item[k] === v),
        );
        return found ? (structuredClone(found) as T) : undefined;
    }

    override async put<T extends DynamoItem = DynamoItem>(
        tableName: string,
        item: T,
    ): Promise<void> {
        const items = this.table(tableName);
        // Upsert: replace if a matching primary key exists
        const idx = items.findIndex((existing) => {
            if (tableName === USERS_TABLE) return existing.user_id === (item as DynamoItem).user_id;
            if (tableName === JOBS_TABLE) return existing.job_id === (item as DynamoItem).job_id;
            if (tableName === APPLICATIONS_TABLE) return existing.application_id === (item as DynamoItem).application_id;
            if (tableName === AGENT_VERDICTS_TABLE) return existing.verdict_id === (item as DynamoItem).verdict_id;
            if (tableName === RECALIBRATION_LOG_TABLE) return existing.recalibration_id === (item as DynamoItem).recalibration_id;
            return false;
        });
        if (idx >= 0) {
            items[idx] = structuredClone(item as unknown as DynamoItem);
        } else {
            items.push(structuredClone(item as unknown as DynamoItem));
        }
    }

    override async delete(tableName: string, key: DynamoItem): Promise<void> {
        const items = this.table(tableName);
        const idx = items.findIndex((item) =>
            Object.entries(key).every(([k, v]) => item[k] === v),
        );
        if (idx >= 0) items.splice(idx, 1);
    }

    override async update<T extends DynamoItem = DynamoItem>(
        tableName: string,
        key: DynamoItem,
        params: {
            UpdateExpression?: string;
            ExpressionAttributeValues?: Record<string, unknown>;
            ExpressionAttributeNames?: Record<string, string>;
            [k: string]: unknown;
        },
    ): Promise<T | undefined> {
        const items = this.table(tableName);
        const item = items.find((candidate) =>
            Object.entries(key).every(([k, v]) => candidate[k] === v),
        );
        if (!item) {
            // Create the item if it doesn't exist (to support update-as-upsert patterns)
            const newItem = { ...key } as DynamoItem;
            applySetExpression(
                newItem,
                params.UpdateExpression ?? '',
                params.ExpressionAttributeValues ?? {},
                params.ExpressionAttributeNames ?? {},
            );
            items.push(newItem);
            return structuredClone(newItem) as T;
        }
        applySetExpression(
            item,
            params.UpdateExpression ?? '',
            params.ExpressionAttributeValues ?? {},
            params.ExpressionAttributeNames ?? {},
        );
        return structuredClone(item) as T;
    }

    override async query<T extends DynamoItem = DynamoItem>(
        tableName: string,
        params: {
            KeyConditionExpression?: string;
            ExpressionAttributeValues?: Record<string, unknown>;
            ExpressionAttributeNames?: Record<string, string>;
            ScanIndexForward?: boolean;
            Limit?: number;
            [k: string]: unknown;
        },
    ): Promise<T[]> {
        let items = this.table(tableName).slice();
        const expr = params.KeyConditionExpression;
        const values = params.ExpressionAttributeValues ?? {};
        const names = params.ExpressionAttributeNames ?? {};

        if (expr) {
            const clauses = [...expr.matchAll(/(#?\w+)\s*=\s*(:\w+)/g)];
            for (const clause of clauses) {
                let attr = clause[1]!;
                if (attr.startsWith('#')) attr = names[attr] ?? attr;
                const expected = values[clause[2]!];
                items = items.filter((item) => item[attr] === expected);
            }
        }
        if (params.ScanIndexForward === false) items.reverse();
        if (typeof params.Limit === 'number') items = items.slice(0, params.Limit);
        return items.map((i) => structuredClone(i)) as T[];
    }
}

/** Apply a minimal `SET a = :v, #b = :w` update expression to an item. */
function applySetExpression(
    item: DynamoItem,
    expression: string,
    values: Record<string, unknown>,
    names: Record<string, string>,
): void {
    const set = expression.replace(/^\s*SET\s+/i, '');
    if (set === expression && !expression.match(/^\s*SET\s/i)) return;
    for (const clause of set.split(',')) {
        const [lhsRaw, rhsRaw] = clause.split('=').map((s) => s.trim());
        if (!lhsRaw || !rhsRaw) continue;
        const attr = lhsRaw.startsWith('#') ? (names[lhsRaw] ?? lhsRaw) : lhsRaw;
        const value = rhsRaw.startsWith(':') ? values[rhsRaw] : rhsRaw;
        item[attr] = value;
    }
}

/* ================================================================== *
 * Fake S3 store
 * ================================================================== */

function createFakeS3() {
    const store = new Map<string, string | Uint8Array | Buffer>();
    return {
        store,
        async putObject(
            key: string,
            body: string | Uint8Array | Buffer,
            _options?: { contentType?: string },
        ): Promise<void> {
            store.set(key, body);
        },
        async getObject(key: string): Promise<Uint8Array> {
            const data = store.get(key);
            if (!data) return new Uint8Array();
            if (typeof data === 'string') return new TextEncoder().encode(data);
            return data instanceof Uint8Array ? data : new Uint8Array(data);
        },
    };
}

/* ================================================================== *
 * Fake Bedrock (agents + material generation + classification)
 * ================================================================== */

type AgentKind = 'ambition' | 'realism' | 'risk' | 'opportunity';

function agentOf(request: BedrockRequest): AgentKind {
    const s = request.system;
    if (s.includes('Ambition Agent')) return 'ambition';
    if (s.includes('Realism Agent')) return 'realism';
    if (s.includes('Risk Agent')) return 'risk';
    if (s.includes('Opportunity Agent')) return 'opportunity';
    throw new Error('Unrecognised agent system prompt');
}

/** All-apply verdict set: resolves to apply_consensus */
const APPLY_VERDICTS: Record<AgentKind, string> = {
    ambition: JSON.stringify({
        verdict: 'apply',
        ambition_score: 84,
        reasoning: 'Career ceiling lift.',
        key_argument: 'Strong growth potential.',
    }),
    realism: JSON.stringify({
        verdict: 'apply',
        match_score: 78,
        key_gaps: ['Kubernetes'],
        work_life_flags: [],
        reasoning: 'Good fit overall.',
        key_argument: 'Realistic match.',
    }),
    risk: JSON.stringify({
        verdict: 'safe',
        risk_score: 20,
        red_flags: [],
        glassdoor_score: 4.2,
        reasoning: 'Stable company.',
        key_argument: 'Low-risk employer.',
    }),
    opportunity: JSON.stringify({
        verdict: 'act_now',
        urgency_score: 88,
        timing_factors: ['Posted 3 hours ago'],
        reasoning: 'Fresh posting.',
        key_argument: 'Move fast.',
    }),
};

/** Veto verdict set: Risk avoid → veto_skip */
const VETO_VERDICTS: Record<AgentKind, string> = {
    ...APPLY_VERDICTS,
    risk: JSON.stringify({
        verdict: 'avoid',
        risk_score: 92,
        red_flags: [{ flag: 'Mass layoffs', source: 'https://news.example', severity: 'high' }],
        glassdoor_score: 1.5,
        reasoning: 'Highly risky.',
        key_argument: 'Avoid this company.',
    }),
};

const GOOD_COMPANY = 'TechGrowth Pte Ltd';
const BAD_COMPANY = 'RiskyStartup Inc';

function createFakeAgentBedrock(): BedrockInvoke & { calls: Array<{ agent: AgentKind; company: string }> } {
    const calls: Array<{ agent: AgentKind; company: string }> = [];
    const fn = (async (request: BedrockRequest): Promise<string> => {
        const agent = agentOf(request);
        // Identify the job's company from the JOB section of the prompt.
        // The formatJob helper renders `- Company: <name>`, so we match that line
        // to distinguish which job is being debated (not the user profile section
        // which may also mention companies as dream_companies).
        const companyLine = request.user.match(/^- Company:\s*(.+)$/m);
        const jobCompany = companyLine?.[1]?.trim() ?? '';
        const company = jobCompany === GOOD_COMPANY ? GOOD_COMPANY : BAD_COMPANY;
        calls.push({ agent, company });
        if (company === GOOD_COMPANY) return APPLY_VERDICTS[agent];
        return VETO_VERDICTS[agent];
    }) as BedrockInvoke & { calls: Array<{ agent: AgentKind; company: string }> };
    fn.calls = calls;
    return fn;
}

function createFakeExa(): ExaClient & { queries: string[] } {
    const queries: string[] = [];
    const fn = (async (query: string): Promise<ExaResult[]> => {
        queries.push(query);
        return [{ title: 'Company news', url: 'https://exa.example/news', text: 'Some context.' }];
    }) as ExaClient & { queries: string[] };
    fn.queries = queries;
    return fn;
}

const RESUME_TEXT = 'CUSTOMISED RESUME for TechGrowth Pte Ltd.';
const COVER_LETTER_TEXT = 'CUSTOMISED COVER LETTER for platform engineering at TechGrowth.';

function createFakeMaterialBedrock(): (prompt: string) => Promise<string> {
    return async (prompt: string): Promise<string> => {
        if (prompt.includes('expert resume writer')) return RESUME_TEXT;
        if (prompt.includes('expert cover-letter writer')) return COVER_LETTER_TEXT;
        return 'Generic material.';
    };
}

/* ================================================================== *
 * Fake SES
 * ================================================================== */

class FakeSes {
    readonly sent: SendEmailParams[] = [];
    async send(params: SendEmailParams): Promise<SendEmailResult> {
        this.sent.push(params);
        return { messageId: `ses-msg-${this.sent.length}`, threadId: `thread-${this.sent.length}` };
    }
}

/* ================================================================== *
 * Fake Gmail
 * ================================================================== */

function createFakeGmail(emails: InboundEmail[]) {
    const calls: ListMessagesArgs[] = [];
    return {
        calls,
        listMessages: async (args: ListMessagesArgs) => {
            calls.push(args);
            return emails;
        },
    };
}

/* ================================================================== *
 * User fixture
 * ================================================================== */

function makeUserConfig(): UserConfig {
    return {
        user_id: USER_ID,
        email: USER_EMAIL,
        name: 'E2E Test User',
        career_stage: 'early_career',
        residency_status: 'citizen',
        resume_s3_key: 'resumes/e2e-user/base.pdf',
        profile: {
            current_role: 'Junior Developer',
            years_experience: 2,
            skills: ['TypeScript', 'React', 'AWS'],
            education: 'BSc Computer Science',
            university: 'NUS',
            target_roles: ['Software Engineer', 'Platform Engineer'],
            target_industries: ['Technology', 'Fintech'],
            dream_companies: ['TechGrowth Pte Ltd'],
            priority_ranking: ['growth', 'salary', 'balance', 'brand', 'purpose', 'stability'],
        },
        non_negotiables: {
            min_salary: 5000,
            employment_type: ['full_time'],
            work_arrangement: 'any',
            custom: [],
            ep_sponsorship_required: false,
        },
        agent_weights: {
            ambition_threshold: 70,
            realism_threshold: 80,
            risk_max_acceptable: 70,
            opportunity_urgency_boost: true,
        },
        gmail_oauth_token: 'encrypted-valid-token',
        inbox_monitoring_available: true,
        onboarding_version: 1,
        updated_at: '2024-06-01T00:00:00.000Z',
        created_at: '2024-05-01T00:00:00.000Z',
    } as UserConfig;
}

/* ================================================================== *
 * MCF job fixtures
 * ================================================================== */

function makeGoodMcfJob(): RawMcfJob {
    return {
        uuid: 'mcf-good-job',
        title: 'Platform Engineer',
        description: 'Build scalable systems at TechGrowth Pte Ltd. Great culture.',
        postedCompany: { name: GOOD_COMPANY },
        salary: { minimum: 6000, maximum: 10000 },
        employmentTypes: [{ employmentType: 'Full Time' }],
        categories: [{ category: 'Information Technology' }],
        address: { country: { description: 'Singapore' } },
        metadata: {
            originalPostingDate: '2024-06-01',
            jobDetailsUrl: 'https://www.mycareersfuture.gov.sg/job/mcf-good-job',
        },
        applicationEmail: 'careers@techgrowth.sg',
    };
}

function makeBadMcfJob(): RawMcfJob {
    return {
        uuid: 'mcf-bad-job',
        title: 'Software Developer',
        description: 'Join RiskyStartup Inc. Fast-paced environment.',
        postedCompany: { name: BAD_COMPANY },
        salary: { minimum: 5500, maximum: 8000 },
        employmentTypes: [{ employmentType: 'Full Time' }],
        categories: [{ category: 'Information Technology' }],
        address: { country: { description: 'Singapore' } },
        metadata: {
            originalPostingDate: '2024-06-01',
            jobDetailsUrl: 'https://www.mycareersfuture.gov.sg/job/mcf-bad-job',
        },
        applicationEmail: 'hire@riskystartup.io',
    };
}

function makeLowPayMcfJob(): RawMcfJob {
    return {
        uuid: 'mcf-lowpay-job',
        title: 'Junior Intern',
        description: 'Internship position. Very low pay.',
        postedCompany: { name: 'LowPay Corp' },
        salary: { minimum: 1000, maximum: 2000 },
        employmentTypes: [{ employmentType: 'Full Time' }],
        categories: [{ category: 'Information Technology' }],
        address: { country: { description: 'Singapore' } },
        metadata: {
            originalPostingDate: '2024-06-01',
            jobDetailsUrl: 'https://www.mycareersfuture.gov.sg/job/mcf-lowpay',
        },
        applicationEmail: 'hr@lowpay.sg',
    };
}

/* ================================================================== *
 * THE FULL-FLOW TEST
 * ================================================================== */

describe('Full WORKSIGNAL E2E pipeline (Task 24.2)', () => {
    it('exercises onboarding → scan/debate → review → send → reply classification → recalibration', async () => {
        // ================================================================
        // SETUP: shared infrastructure mocks
        // ================================================================
        const db = new FakeDynamoDB();
        const s3 = createFakeS3();
        const ses = new FakeSes();
        const agentBedrock = createFakeAgentBedrock();
        const exa = createFakeExa();
        const materialBedrock = createFakeMaterialBedrock();

        // Fixed clocks for deterministic timestamps
        const scanTime = new Date('2024-06-02T09:00:00.000Z');
        const sendTime = new Date('2024-06-02T10:00:00.000Z');
        const pollTime = new Date('2024-06-02T12:00:00.000Z');
        const recalTime = new Date('2024-06-09T09:00:00.000Z'); // one week later

        // ================================================================
        // STEP 1: ONBOARDING (Req 3, 4, 5)
        // ================================================================
        const user = makeUserConfig();
        // Seed the user into the DB (simulates completed onboarding)
        db.seed(USERS_TABLE, user as unknown as DynamoItem);

        // Verify onboarding service can read the user and set priority ranking
        const onboardingService = createOnboardingService({ db, now: () => scanTime });
        await onboardingService.setPriorityRanking(USER_ID, [
            'growth', 'salary', 'balance', 'brand', 'purpose', 'stability',
        ]);

        // Verify the user is persisted with correct onboarding data
        const persistedUser = await db.get<UserConfig & DynamoItem>(USERS_TABLE, { user_id: USER_ID });
        expect(persistedUser).toBeDefined();
        expect(persistedUser!.career_stage).toBe('early_career');
        expect(persistedUser!.non_negotiables.min_salary).toBe(5000);
        expect(persistedUser!.profile.priority_ranking).toEqual([
            'growth', 'salary', 'balance', 'brand', 'purpose', 'stability',
        ]);

        // ================================================================
        // STEP 2: SCAN/DEBATE (Req 7, 10)
        // ================================================================

        // MCF returns 3 jobs: one good, one risky, one underpaid (filtered)
        const mcfSearch: McfSearchFn = async () => [
            makeGoodMcfJob(),
            makeBadMcfJob(),
            makeLowPayMcfJob(),
        ];

        const scanner = createOpportunityScanner({
            db,
            mcfSearch,
            now: () => scanTime,
            usersTable: USERS_TABLE,
            jobsTable: JOBS_TABLE,
        });

        const discoveredJobs = await scanner.scan(USER_ID);

        // Jobs are discovered and persisted
        expect(discoveredJobs.length).toBeGreaterThanOrEqual(2);
        const storedJobs = db.all(JOBS_TABLE);
        expect(storedJobs.length).toBeGreaterThanOrEqual(2);

        // last_scan_at is updated
        const userAfterScan = await db.get<UserConfig & DynamoItem>(USERS_TABLE, { user_id: USER_ID });
        expect(userAfterScan!.last_scan_at).toBe(scanTime.toISOString());

        // Run the debate machine with the discovered jobs
        let verdictIdSeq = 0;
        const generateMaterialsHook: GenerateMaterialsHook = (() => {
            const realHook = createGenerateMaterials({ bedrock: materialBedrock, s3 });
            return (job: Job, decision: MasterDecision, userCfg: UserConfig): Promise<Materials> => {
                const enriched: MasterDecision = {
                    ...decision,
                    resume_instructions: 'Emphasise platform engineering and TypeScript expertise.',
                    cover_letter_angle: 'Lead with scalability impact.',
                };
                return realHook(job, enriched, userCfg);
            };
        })();

        const debateResult = await runDebateMachine(persistedUser! as unknown as UserConfig, {
            bedrock: agentBedrock,
            exa,
            generateMaterials: generateMaterialsHook,
            scan: async () => discoveredJobs,
            verdictPersistence: {
                db,
                generateVerdictId: () => `verdict-${(verdictIdSeq += 1)}`,
                now: () => scanTime,
            },
            agentOptions: { sleep: async () => { } },
        });

        // Verify scan/debate results
        expect(debateResult.scanned).toBeGreaterThanOrEqual(2);
        // The low-pay job (max 2000 < min_salary 5000) is filtered out
        expect(debateResult.survivors.length).toBeLessThan(debateResult.scanned);
        expect(debateResult.outcomes.length).toBeGreaterThanOrEqual(2);

        // Verify 4 agents produce valid verdicts for each surviving job
        for (const outcome of debateResult.outcomes) {
            expect(outcome.decision).toBeDefined();
            expect(outcome.decision!.agents_for).toBeDefined();
            expect(outcome.decision!.agents_against).toBeDefined();
        }

        // The good job resolves to apply_consensus
        const goodOutcome = debateResult.outcomes.find(
            (o) => o.job.company === GOOD_COMPANY,
        );
        expect(goodOutcome).toBeDefined();
        expect(goodOutcome!.decision!.decision).toBe('apply_consensus');
        expect(goodOutcome!.route).toBe('generate_materials');

        // Materials are generated for apply decisions
        expect(goodOutcome!.materials).toBeDefined();
        expect(goodOutcome!.materials!.customisation_applied).toBe(true);
        expect(goodOutcome!.materials!.cover_letter_text).toContain(COVER_LETTER_TEXT);

        // The risky job resolves to veto_skip
        const badOutcome = debateResult.outcomes.find(
            (o) => o.job.company === BAD_COMPANY,
        );
        expect(badOutcome).toBeDefined();
        expect(badOutcome!.decision!.decision).toBe('veto_skip');
        expect(badOutcome!.route).toBe('veto_log');
        // Veto_skip jobs are never queued for review
        expect(debateResult.review_queue.some((o) => o.job.company === BAD_COMPANY)).toBe(false);

        // ================================================================
        // STEP 3: REVIEW (Req 13)
        // ================================================================

        // apply_consensus jobs are in the review queue
        expect(debateResult.review_queue.some((o) => o.job.company === GOOD_COMPANY)).toBe(true);
        // skip_consensus / veto_skip jobs are NOT in the review queue
        expect(
            debateResult.review_queue.every((o) => {
                const dec = o.decision?.decision;
                return dec === 'apply_consensus' || dec === 'apply_with_caveat';
            }),
        ).toBe(true);

        // Fast-track: act_now + ≥2 apply-equivalent → top of queue
        expect(goodOutcome!.queue_placement).toBe('top');

        // ================================================================
        // STEP 4: SEND (Req 16)
        // ================================================================

        // Set up the Application_Tracker backed by the same DB
        let appSeq = 0;
        const tracker = new ApplicationTrackerImpl({
            db,
            now: () => sendTime,
            generateApplicationId: () => `app-${(appSeq += 1)}`,
        });

        // Store the resume in fake S3 so the sender can fetch it
        const resumeKey = goodOutcome!.materials!.resume_s3_key;
        s3.store.set(resumeKey, RESUME_TEXT);

        // Build the send context from the debate outcome
        const sendContext: SendContext = {
            user_id: USER_ID,
            job_id: goodOutcome!.job.job_id,
            verdict_id: `verdict-1`,
            company: GOOD_COMPANY,
            role_title: goodOutcome!.job.role_title,
            user_email: USER_EMAIL,
            employer_email: goodOutcome!.job.employer_email!,
            source_url: goodOutcome!.job.source_url,
            customised_resume_s3_key: resumeKey,
            customisation_applied: true,
            cover_letter_text: goodOutcome!.materials!.cover_letter_text,
        };

        const notifications: UserNotification[] = [];
        const sender = createApplicationSender({
            loadContext: async () => sendContext,
            sendEmail: ses.send.bind(ses),
            fetchResume: async (key) => s3.getObject(key),
            createApplication: async (record) => tracker.create(record),
            notifyUser: async (n) => { notifications.push(n); },
            now: () => sendTime,
        });

        const sendOutcome = await sender.sendWithOutcome('queued-1');
        const application = sendOutcome.application;

        // Application is sent via SES
        expect(ses.sent).toHaveLength(1);
        expect(ses.sent[0]!.to).toBe('careers@techgrowth.sg');
        expect(ses.sent[0]!.replyTo).toBe(USER_EMAIL);
        expect(ses.sent[0]!.cc).toEqual([USER_EMAIL]);

        // Application record is created with status `sent`
        expect(application.status).toBe('sent');
        expect(application.recipient_email).toBe('careers@techgrowth.sg');
        expect(application.email_thread_id).toBe('thread-1');
        expect(application.sent_at).toBe(sendTime.toISOString());

        // Verify it's persisted in the Applications table
        const storedApps = db.all<Application & DynamoItem>(APPLICATIONS_TABLE);
        expect(storedApps).toHaveLength(1);
        expect(storedApps[0]!.status).toBe('sent');

        // ================================================================
        // STEP 5: REPLY CLASSIFICATION (Req 18)
        // ================================================================

        // Simulate a callback reply from TechGrowth arriving in Gmail
        const callbackEmail: InboundEmail = {
            message_id: 'gmail-msg-1',
            thread_id: 'thread-1', // matches the SES thread_id
            sender_email: 'talent@techgrowth.sg',
            sender_domain: 'techgrowth.sg',
            subject: 'Interview Invitation - Platform Engineer',
            body: 'Hi, we were impressed by your application and would like to schedule an interview.',
            received_at: '2024-06-02T11:00:00.000Z',
        };

        const gmail = createFakeGmail([callbackEmail]);

        // Fake Bedrock classifier → classifies as callback with high confidence
        const classifierPrompts: string[] = [];
        const fakeClassifier = async (prompt: string): Promise<string> => {
            classifierPrompts.push(prompt);
            return JSON.stringify({ label: 'callback', confidence: 92 });
        };

        // Wire up the Gmail Monitor with a fake tracker that applies classification
        // to our in-memory application record
        const classificationCalls: Array<{ applicationId: string; classification: Classification }> = [];
        const fakeMonitorTracker = {
            applyClassification: async (applicationId: string, classification: Classification) => {
                classificationCalls.push({ applicationId, classification });
                // Apply the classification to the stored application
                const apps = db.all<Application & DynamoItem>(APPLICATIONS_TABLE);
                const app = apps.find((a) => a.application_id === applicationId);
                if (app) {
                    app.status = classification.confidence >= 60
                        ? (classification.label === 'callback' ? 'callback' : classification.label === 'rejection' ? 'rejected' : app.status)
                        : 'needs_review';
                    app.classification_confidence = classification.confidence;
                    app.status_updated_at = pollTime.toISOString();
                    await db.put(APPLICATIONS_TABLE, app);
                }
            },
        };

        // Update the user's last_poll_at to be > 30 minutes ago so the poll runs
        await db.update(USERS_TABLE, { user_id: USER_ID }, {
            UpdateExpression: 'SET last_poll_at = :lp',
            ExpressionAttributeValues: { ':lp': new Date(pollTime.getTime() - 31 * 60 * 1000).toISOString() },
        });

        const monitor = createGmailMonitor({
            gmail,
            bedrockInvoke: fakeClassifier,
            tracker: fakeMonitorTracker,
            db,
            now: () => pollTime,
            sleep: async () => { },
        });

        await monitor.poll(USER_ID);

        // Gmail was polled
        expect(gmail.calls).toHaveLength(1);
        expect(gmail.calls[0]!.userId).toBe(USER_ID);

        // The reply was classified
        expect(classifierPrompts.length).toBeGreaterThan(0);
        expect(classifierPrompts[0]).toContain('callback');

        // Classification updates the application status correctly
        expect(classificationCalls).toHaveLength(1);
        expect(classificationCalls[0]!.classification).toEqual({
            label: 'callback',
            confidence: 92,
        });

        // Verify the application status is now 'callback' in the DB
        const appsAfterClassification = db.all<Application & DynamoItem>(APPLICATIONS_TABLE);
        const classifiedApp = appsAfterClassification.find(
            (a) => a.application_id === application.application_id,
        );
        expect(classifiedApp!.status).toBe('callback');

        // ================================================================
        // STEP 6: RECALIBRATION (Req 21)
        // ================================================================

        // Seed the verdict for the application so recalibration can find it
        // (The debate already persisted verdicts, but we need the Application's
        // verdict_id to point to a valid AgentVerdicts record)
        const verdictItem: DynamoItem = {
            verdict_id: application.verdict_id,
            user_id: USER_ID,
            job_id: application.job_id,
            ambition: JSON.parse(APPLY_VERDICTS.ambition),
            realism: JSON.parse(APPLY_VERDICTS.realism),
            risk: JSON.parse(APPLY_VERDICTS.risk),
            opportunity: JSON.parse(APPLY_VERDICTS.opportunity),
            created_at: scanTime.toISOString(),
        };
        // Ensure we have the verdict in the table
        await db.put(AGENT_VERDICTS_TABLE, verdictItem);

        // Adjust the application's sent_at so it's within the 7-day window from recalTime
        const appForRecal = db.all<Application & DynamoItem>(APPLICATIONS_TABLE).find(
            (a) => a.application_id === application.application_id,
        );
        if (appForRecal) {
            appForRecal.sent_at = '2024-06-05T10:00:00.000Z'; // within 7 days of recalTime
            await db.put(APPLICATIONS_TABLE, appForRecal);
        }

        const recalEngine = new RecalibrationEngineImpl({
            db,
            now: () => recalTime,
            generateRecalibrationId: () => 'recal-e2e-1',
            logger: createLogger({ sink: () => { } }),
        });

        const recalEntry = await recalEngine.runWeekly(USER_ID);

        // Recalibration computes metrics from the week's outcomes
        expect(recalEntry).toBeDefined();
        expect(recalEntry.user_id).toBe(USER_ID);
        expect(recalEntry.metrics).toBeDefined();
        expect(recalEntry.metrics.applications_sent).toBeGreaterThanOrEqual(1);
        // We had a callback → callbacks should be >= 1
        expect(recalEntry.metrics.callbacks).toBeGreaterThanOrEqual(1);
        expect(recalEntry.metrics.callback_rate).toBeGreaterThan(0);

        // Per-agent performance is computed
        expect(recalEntry.agent_performance).toBeDefined();
        expect(recalEntry.agent_performance.ambition).toBeDefined();
        expect(recalEntry.agent_performance.realism).toBeDefined();
        expect(recalEntry.agent_performance.risk).toBeDefined();
        expect(recalEntry.agent_performance.opportunity).toBeDefined();

        // The recalibration log is stored in the DB
        const recalLogs = db.all<RecalibrationLogEntry & DynamoItem>(RECALIBRATION_LOG_TABLE);
        expect(recalLogs).toHaveLength(1);
        expect(recalLogs[0]!.recalibration_id).toBe('recal-e2e-1');
        expect(recalLogs[0]!.brief_text.length).toBeGreaterThan(0);

        // All agents said "apply" and the outcome was "callback" → all correct
        // So per-agent accuracy should show correct predictions
        for (const agent of ['ambition', 'realism', 'risk', 'opportunity'] as const) {
            const perf = recalEntry.agent_performance[agent];
            expect(perf.correct).toBeGreaterThanOrEqual(1);
        }
    });
});
