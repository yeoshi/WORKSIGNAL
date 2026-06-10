#!/usr/bin/env npx tsx
/**
 * runFullFlow.ts — Full pipeline: MCF + Exa scan → pre-filter → debate → DynamoDB
 *
 * Runs the complete WORKSIGNAL backend pipeline for Rose's demo user:
 *
 *   Step 1A  Scan MCF for jobs matching target roles (past 14 days, max 20).
 *            Jobs saved to DynamoDB Jobs table by the scanner.
 *
 *   Step 1B  Exa web search for additional jobs based on target roles/industries.
 *            One Singapore-scoped query per target role/industry ("X job openings
 *            hiring Singapore"). Results mapped to DiscoveredJob shape and merged
 *            with MCF results. Duplicates (same source_url) removed before Step 2.
 *            Skipped silently when EXA_API_KEY is not set.
 *
 *   Step 2   Pre-filter ALL discovered jobs against Rose's non-negotiables:
 *              salary_max >= 5000, full_time, hybrid/remote, Singapore.
 *            Exa-sourced jobs with no salary data (salary_max = 0) will fail the
 *            salary check — this is correct, the pre-filter is the hard gate.
 *
 *   Step 3   Run 4 Bedrock debate agents in parallel on each surviving job:
 *              Ambition · Realism · Risk (+Exa company research) · Opportunity
 *            Risk agent issues Singapore-scoped Exa queries on the company:
 *              financials, layoffs, Glassdoor, culture, and EP sponsorship.
 *            Each query fetches real text highlights for the agent to reason over.
 *            Results + Master decision saved to DynamoDB AgentVerdicts table.
 *
 *   Summary  Print outcomes and source breakdown (MCF vs Exa).
 *
 * Exa API key:
 *   Set EXA_API_KEY in .env.aws (or the environment) before running.
 *   Without a key, Step 1B is skipped and the Risk agent returns caution verdicts.
 *
 * Usage:
 *   cd /Users/roselin/Desktop/SUPERAI/WORKSIGNAL/backend
 *   npx tsx src/scripts/runFullFlow.ts
 */

import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import {
    BedrockRuntimeClient,
    InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import type { BedrockInvoke, BedrockRequest, ExaClient, ExaResult } from '../debate/agents/shared.js';

// ── Load .env.aws BEFORE any AWS SDK imports ─────────────────────────────────
// (DynamoDBWrapper reads AWS_DEFAULT_REGION at module-eval time, so it must be
//  set before the dynamic import below.)
try {
    const envPath = resolve(import.meta.dirname ?? '.', '../../../.env.aws');
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx < 0) continue;
        const key = trimmed.slice(0, eqIdx).replace(/^export\s+/, '').trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if (
            (val.startsWith('"') && val.endsWith('"')) ||
            (val.startsWith("'") && val.endsWith("'"))
        ) val = val.slice(1, -1);
        if (!process.env[key]) process.env[key] = val;
    }
    console.log('✓ Loaded credentials from .env.aws\n');
} catch {
    console.log('  No .env.aws found — using existing environment variables\n');
}

// ── Dynamic imports (run AFTER env is loaded) ─────────────────────────────────
const { DynamoDBWrapper, createLogger } = await import('@worksignal/shared');
const { createOpportunityScanner } = await import('../discovery/opportunityScanner.js');
const { buildExaQueries, mapExaResult } = await import('../discovery/exaFallback.js');
const { preFilter } = await import('../preFilter/preFilter.js');
const { runAndPersistAgentVerdicts } = await import('../debate/verdictPersistence.js');
const { resolveDegraded } = await import('../orchestrator/degradedResolution.js');

// ── Config ────────────────────────────────────────────────────────────────────
const USER_ID = '109848448123861557723';   // Rose's Google OAuth sub
const REGION = process.env.AWS_DEFAULT_REGION ?? 'us-east-1';
const MODEL_ID = process.env.BEDROCK_MODEL_ID ?? 'us.anthropic.claude-sonnet-4-6';
const EXA_KEY = process.env.EXA_API_KEY ?? '';

// ── Bedrock client ────────────────────────────────────────────────────────────
const bedrockClient = new BedrockRuntimeClient({ region: REGION });

const bedrock: BedrockInvoke = async (req: BedrockRequest): Promise<string> => {
    const cmd = new InvokeModelCommand({
        modelId: MODEL_ID,
        contentType: 'application/json',
        accept: 'application/json',
        body: new TextEncoder().encode(JSON.stringify({
            anthropic_version: 'bedrock-2023-05-31',
            max_tokens: 2048,
            system: req.system,
            messages: [{ role: 'user', content: req.user }],
        })),
    });
    const res = await bedrockClient.send(cmd);
    const body = JSON.parse(new TextDecoder().decode(res.body)) as { content: Array<{ text: string }> };
    const text = body.content[0]?.text;
    if (text === undefined) throw new Error('Bedrock response missing content[0].text');
    return text;
};

// ── Exa client for company risk research (Step 3 — Risk agent) ───────────────
// Fetches real text highlights (numSentences: 3) so the Risk agent can reason
// over actual content, not just titles and URLs.
const exa: ExaClient = async (query: string): Promise<ExaResult[]> => {
    if (!EXA_KEY) {
        console.log(`    ${GRAY}[Exa/Risk] No API key — skipping company research for this query${RESET}`);
        return [];
    }
    console.log(`    ${CYAN}[Exa/Risk]${RESET} ${GRAY}Querying: "${query}"${RESET}`);
    const res = await fetch('https://api.exa.ai/search', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            accept: 'application/json',
            'x-api-key': EXA_KEY,
        },
        body: JSON.stringify({
            query,
            numResults: 5,
            type: 'auto',
            contents: {
                highlights: { numSentences: 3, highlightsPerUrl: 2 },
            },
        }),
    });
    if (!res.ok) {
        console.log(`    ${YELLOW}[Exa/Risk] HTTP ${res.status} for query — skipping${RESET}`);
        return [];
    }
    const data = await res.json() as {
        results?: Array<{
            url?: string;
            title?: string;
            publishedDate?: string;
            highlights?: string[];
        }>;
    };
    const results = (data.results ?? []).map((r): ExaResult => ({
        url: r.url ?? '',
        title: r.title,
        publishedDate: r.publishedDate ?? undefined,
        text: r.highlights?.join(' … ') ?? undefined,
    }));
    console.log(`    ${GRAY}[Exa/Risk] → ${results.length} result(s)${RESET}`);
    return results;
};

// ── Exa job discovery helper (Step 1B) ───────────────────────────────────────
// Runs Singapore-scoped queries for each of the user's target roles/industries
// and maps Exa results into DiscoveredJob shape for the pre-filter.
type RawExaJobResult = {
    id?: string;
    url?: string;
    title?: string;
    text?: string | null;
    publishedDate?: string | null;
    author?: string | null;
};

async function runExaJobSearch(
    queries: string[],
    userId: string,
    scannedAt: string,
): Promise<Array<{ job: ReturnType<typeof mapExaResult>; query: string }>> {
    const settled = await Promise.allSettled(
        queries.map(async (query) => {
            console.log(`  ${CYAN}[Exa/Jobs]${RESET} ${GRAY}Searching: "${query}"${RESET}`);
            const res = await fetch('https://api.exa.ai/search', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    accept: 'application/json',
                    'x-api-key': EXA_KEY,
                },
                body: JSON.stringify({
                    query,
                    numResults: 5,
                    type: 'auto',
                    contents: { text: true },
                }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json() as { results?: RawExaJobResult[] };
            const results = data.results ?? [];
            console.log(`  ${GRAY}[Exa/Jobs] → ${results.length} result(s) for "${query}"${RESET}`);
            return results.map((r) => ({
                job: mapExaResult(r, userId, scannedAt, { generateJobId: () => randomUUID() }),
                query,
            }));
        }),
    );

    const out: Array<{ job: ReturnType<typeof mapExaResult>; query: string }> = [];
    for (const result of settled) {
        if (result.status === 'fulfilled') {
            out.push(...result.value);
        }
    }
    return out;
}

// ── Display helpers ───────────────────────────────────────────────────────────
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const GRAY = '\x1b[90m';
const YELLOW = '\x1b[33m';
const SGT_TIME_ZONE = 'Asia/Singapore';

function formatSgt(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;

    const parts = new Intl.DateTimeFormat('en-SG', {
        timeZone: SGT_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(date);

    const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${lookup.year}-${lookup.month}-${lookup.day} ${lookup.hour}:${lookup.minute}:${lookup.second} SGT`;
}

const scannerLogger = createLogger({
    sink: (entry) => {
        const rendered: Record<string, unknown> = {
            ...entry,
            timestamp: formatSgt(entry.timestamp),
        };
        if (typeof rendered.last_scan_at === 'string') {
            rendered.last_scan_at = formatSgt(rendered.last_scan_at);
        }
        const line = JSON.stringify(rendered);
        if (entry.level === 'error') {
            console.error(line);
        } else if (entry.level === 'warn') {
            console.warn(line);
        } else {
            console.log(line);
        }
    },
});

function divider(title: string) {
    console.log(`\n${BOLD}${'─'.repeat(58)}${RESET}`);
    console.log(`${BOLD}  ${title}${RESET}`);
    console.log(`${BOLD}${'─'.repeat(58)}${RESET}`);
}

function decisionLabel(d: string): string {
    switch (d) {
        case 'apply_consensus': return `${GREEN}✅ APPLY — consensus${RESET}`;
        case 'apply_with_caveat': return `${GREEN}✅ APPLY — with caveat${RESET}`;
        case 'deadlock_escalate': return `${YELLOW}⚠️  DEADLOCK — your decision needed${RESET}`;
        case 'skip_consensus': return `${GRAY}⏩ SKIP — agents agree${RESET}`;
        case 'veto_skip': return `${RED}🚫 VETO — risk agent blocked this${RESET}`;
        default: return `${GRAY}? ${d}${RESET}`;
    }
}

function salaryStr(min: number, max: number): string {
    if (!min && !max) return 'salary undisclosed';
    if (!min) return `up to $${max}`;
    if (!max) return `from $${min}`;
    return `$${min}–$${max}`;
}

// ── Load user ─────────────────────────────────────────────────────────────────
divider('WORKSIGNAL — FULL PIPELINE FLOW');
console.log(`\n  Region    : ${REGION}`);
console.log(`  Model     : ${MODEL_ID}`);
console.log(`  User      : ${USER_ID}`);
console.log(`  Exa key   : ${EXA_KEY ? `${EXA_KEY.slice(0, 8)}… (set)` : `${RED}NOT SET — Step 1B and risk research disabled${RESET}`}`);

const db = new DynamoDBWrapper();
const rawUser = await db.get('Users', { user_id: USER_ID });

if (!rawUser) {
    console.error(`\n${RED}❌ User not found in DynamoDB.${RESET}`);
    console.error('   Run the seed script first:');
    console.error('   npx tsx src/scripts/seedDashboard.ts\n');
    process.exit(1);
}

const user = rawUser as unknown as Parameters<typeof preFilter>[1];
const profile = (user.profile as unknown) as Record<string, unknown>;
console.log(`\n  ✓ Loaded user: ${BOLD}${String(user.name ?? USER_ID)}${RESET}`);
console.log(`    Target roles     : ${(profile?.target_roles as string[] | undefined)?.join(', ') ?? '(none)'}`);
console.log(`    Target industries: ${(profile?.target_industries as string[] | undefined)?.join(', ') ?? '(none)'}`);
const nn = (user.non_negotiables as unknown) as Record<string, unknown>;
console.log(`    Min salary       : $${String(nn?.min_salary ?? 0)}`);
console.log(`    Employment type  : ${(nn?.employment_type as string[] | undefined)?.join(', ') ?? 'any'}`);
console.log(`    Work arrangement : ${String(nn?.work_arrangement ?? 'any')}`);

// ── STEP 1A: MCF scan ─────────────────────────────────────────────────────────
divider('STEP 1A — MCF SCAN (MyCareersFuture)');

// scanIntervalMs: 0 bypasses the daily gate so we can always run on demand.
// In production the EventBridge trigger respects the 24h gate natively.
const scanner = createOpportunityScanner({ scanIntervalMs: 0, logger: scannerLogger });

console.log('\n  Scanning MyCareersFuture… (this may take a few seconds)');
const startScan = Date.now();

// scan() fetches MCF, saves each job to DynamoDB Jobs table, updates
// Users.last_scan_at. Returns the saved DiscoveredJob array.
const mcfJobs = await scanner.scan(USER_ID);

const scanMs = Date.now() - startScan;
console.log(`\n  ✓ MCF returned ${BOLD}${mcfJobs.length} job(s)${RESET} (${(scanMs / 1000).toFixed(1)}s)`);
console.log(`  ✓ Saved to DynamoDB Jobs table\n`);

if (mcfJobs.length === 0) {
    console.log(`  ${YELLOW}No jobs returned from MCF. Check that your target roles`);
    console.log(`  are set on the user record (role might be too specific).${RESET}\n`);
}

for (let i = 0; i < mcfJobs.length; i++) {
    const j = mcfJobs[i]!;
    console.log(`  ${GRAY}${String(i + 1).padStart(2)}.${RESET} [MCF] ${j.role_title} — ${BOLD}${j.company}${RESET}`);
    console.log(`      ${GRAY}${salaryStr(j.salary_min, j.salary_max)} · ${j.employment_type} · ${j.work_arrangement} · ${j.mcf_listing_days}d old${RESET}`);
}

// ── STEP 1B: Exa web job search ───────────────────────────────────────────────
type DiscoveredJob = (typeof mcfJobs)[0];

divider('STEP 1B — EXA WEB JOB SEARCH');

let exaJobs: DiscoveredJob[] = [];

if (!EXA_KEY) {
    console.log(`\n  ${YELLOW}Skipped — EXA_API_KEY not set.${RESET}`);
    console.log(`  Add EXA_API_KEY=<key> to .env.aws to enable web job discovery.\n`);
} else {
    const exaQueries = buildExaQueries(user);
    console.log(`\n  Building Singapore-scoped queries from user targets:`);
    for (const q of exaQueries) {
        console.log(`    ${GRAY}• "${q}"${RESET}`);
    }
    console.log(`\n  Running ${exaQueries.length} Exa query(ies)…`);

    const startExa = Date.now();
    const scannedAt = new Date().toISOString();
    const exaWithQuery = await runExaJobSearch(exaQueries, USER_ID, scannedAt);

    // Deduplicate: remove Exa results whose source_url matches an MCF job.
    const mcfUrls = new Set(mcfJobs.map((j) => j.source_url).filter(Boolean));
    const seen = new Set<string>();
    for (const { job } of exaWithQuery) {
        if (job.source_url && mcfUrls.has(job.source_url)) continue;
        if (job.source_url && seen.has(job.source_url)) continue;
        if (job.source_url) seen.add(job.source_url);
        exaJobs.push(job);
    }

    const exaMs = Date.now() - startExa;
    console.log(`\n  ✓ Exa returned ${BOLD}${exaWithQuery.length} raw result(s)${RESET}, ${BOLD}${exaJobs.length} unique${RESET} after dedup (${(exaMs / 1000).toFixed(1)}s)`);

    if (exaJobs.length > 0) {
        console.log('');
        for (let i = 0; i < exaJobs.length; i++) {
            const j = exaJobs[i]!;
            console.log(`  ${GRAY}${String(i + 1).padStart(2)}.${RESET} [EXA] ${j.role_title} — ${BOLD}${j.company}${RESET}`);
            console.log(`      ${GRAY}${salaryStr(j.salary_min, j.salary_max)} · ${j.source_url}${RESET}`);
        }
    } else {
        console.log(`  ${GRAY}  No unique Exa jobs to add (all were duplicates or queries returned nothing).${RESET}`);
    }
}

// ── Combine MCF + Exa results ─────────────────────────────────────────────────
const discovered: DiscoveredJob[] = [...mcfJobs, ...exaJobs];
console.log(`\n  Combined : ${BOLD}${mcfJobs.length}${RESET} MCF + ${BOLD}${exaJobs.length}${RESET} Exa = ${BOLD}${discovered.length} total${RESET} jobs entering pre-filter`);

// ── STEP 2: Pre-filter ────────────────────────────────────────────────────────
divider('STEP 2 — PRE-FILTER (non-negotiables)');
console.log(`\n  Checking all ${discovered.length} job(s) against hard gates`);
console.log(`  ${GRAY}(salary ≥ $${String(nn?.min_salary ?? 0)}, employment type, work arrangement, location)${RESET}\n`);

const survivors: DiscoveredJob[] = [];
const rejected: Array<{ job: DiscoveredJob; reasons: string[]; source: string }> = [];

for (const job of discovered) {
    const source = mcfJobs.includes(job) ? '[MCF]' : '[EXA]';
    const result = preFilter(job, user);
    if (result.pass) {
        survivors.push(job);
        console.log(`  ${GREEN}✓ PASS${RESET}  ${source} ${job.role_title} @ ${job.company}`);
    } else {
        const reasons = result.pass === false ? result.violated : [];
        rejected.push({ job, reasons, source });
        console.log(`  ${RED}✗ FAIL${RESET}  ${source} ${job.role_title} @ ${job.company}`);
        console.log(`         ${GRAY}blocked by: ${reasons.join(', ') || 'non-negotiable filter'}${RESET}`);
    }
}

console.log(`\n  Survivors : ${BOLD}${GREEN}${survivors.length}${RESET} passed`);
console.log(`  Rejected  : ${BOLD}${RED}${rejected.length}${RESET} filtered out`);

const survivorsMcf = survivors.filter((j) => mcfJobs.includes(j)).length;
const survivorsExa = survivors.length - survivorsMcf;
if (exaJobs.length > 0) {
    console.log(`  ${GRAY}(${survivorsMcf} from MCF, ${survivorsExa} from Exa)${RESET}`);
}

if (survivors.length === 0) {
    console.log(`\n  ${YELLOW}All jobs were filtered out. Consider relaxing non-negotiables:`);
    console.log(`    - Increase min_salary threshold`);
    console.log(`    - Accept more employment types or work arrangements${RESET}\n`);
    process.exit(0);
}

// ── STEP 3: Debate + Persist ──────────────────────────────────────────────────
divider(`STEP 3 — DEBATE (${survivors.length} job(s))`);

console.log(`\n  4 Bedrock agents run in parallel per job:`);
console.log(`    🚀 Ambition   — career trajectory fit`);
console.log(`    🎯 Realism    — skills and experience match`);
console.log(`    🛡  Risk       — company research via Exa (4–5 queries/job)`);
console.log(`    ⚡ Opportunity — timing, urgency, FCF window`);
console.log(`\n  ${GRAY}Each job takes ~15–30s for Bedrock calls.${RESET}`);
if (EXA_KEY) {
    console.log(`  ${GRAY}Risk agent Exa queries are printed as they run.${RESET}`);
} else {
    console.log(`  ${YELLOW}No EXA_API_KEY — Risk agent will return caution verdicts (insufficient data).${RESET}`);
}
console.log('');

type DecisionSummary = {
    job: DiscoveredJob;
    verdictId: string;
    decision: string;
    agentFailures: string[];
    summaryText: string | null;
    source: string;
};

const outcomes: DecisionSummary[] = [];
const overallStart = Date.now();

for (let idx = 0; idx < survivors.length; idx++) {
    const job = survivors[idx]!;
    const source = mcfJobs.includes(job) ? '[MCF]' : '[EXA]';
    const label = `${String(idx + 1)}/${survivors.length}`;

    console.log(`  ${CYAN}[${label}]${RESET} ${BOLD}${job.role_title}${RESET} @ ${job.company}  ${GRAY}${source}${RESET}`);
    console.log(`       ${GRAY}${salaryStr(job.salary_min, job.salary_max)} · ${job.mcf_listing_days}d old${RESET}`);
    console.log(`       ${GRAY}Running agents… (Exa/Risk queries below)${RESET}`);

    const t0 = Date.now();

    // runAndPersistAgentVerdicts fans out all 4 agents in parallel:
    //   - Ambition, Realism, Opportunity call Bedrock directly
    //   - Risk calls exa() for each company research query, then Bedrock
    //   - All 4 verdicts are validated and written to AgentVerdicts in DynamoDB
    const persistResult = await runAndPersistAgentVerdicts({
        job,
        user,
        bedrock,
        exa,
    });

    // Resolve master decision from the valid verdicts
    const degResult = resolveDegraded(persistResult.verdicts);

    // Re-persist with master decision embedded (update the same record)
    if (degResult.decision) {
        const db2 = new DynamoDBWrapper();
        await db2.update(
            'AgentVerdicts',
            { verdict_id: persistResult.verdict_id },
            {
                UpdateExpression: 'SET master_decision = :md',
                ExpressionAttributeValues: { ':md': degResult.decision },
            },
        );
    }

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    const dec = degResult.decision?.decision ?? 'no_decision';
    const md = degResult.decision;

    // ── Agent verdicts with full model reasoning ──────────────────────────────
    const v = persistResult.verdicts;
    const forSet = new Set<string>(md?.agents_for ?? []);

    function voteTag(agent: string): string {
        return forSet.has(agent)
            ? `${GREEN}✓ for${RESET}`
            : `${RED}✗ against${RESET}`;
    }

    console.log(`\n       ${BOLD}┌─ AGENT VERDICTS ${'─'.repeat(32)}${RESET}`);

    if (v.ambition) {
        const isFor = forSet.has('ambition');
        console.log(`       ${BOLD}│${RESET} 🚀 AMBITION    ${isFor ? GREEN : RED}${v.ambition.verdict}${RESET}  score: ${BOLD}${v.ambition.ambition_score}${RESET}  ${voteTag('ambition')}`);
        console.log(`       ${BOLD}│${RESET}   ${GRAY}Reasoning : ${v.ambition.reasoning}${RESET}`);
        console.log(`       ${BOLD}│${RESET}   ${GRAY}Key arg   : ${v.ambition.key_argument}${RESET}`);
    }

    if (v.realism) {
        const isFor = forSet.has('realism');
        console.log(`       ${BOLD}│${RESET}`);
        console.log(`       ${BOLD}│${RESET} 🎯 REALISM     ${isFor ? GREEN : RED}${v.realism.verdict}${RESET}  score: ${BOLD}${v.realism.match_score}${RESET}  ${voteTag('realism')}`);
        console.log(`       ${BOLD}│${RESET}   ${GRAY}Reasoning : ${v.realism.reasoning}${RESET}`);
        console.log(`       ${BOLD}│${RESET}   ${GRAY}Key arg   : ${v.realism.key_argument}${RESET}`);
        if (v.realism.key_gaps?.length) {
            console.log(`       ${BOLD}│${RESET}   ${GRAY}Key gaps  : ${v.realism.key_gaps.join(', ')}${RESET}`);
        }
    }

    if (v.risk) {
        const isFor = forSet.has('risk');
        console.log(`       ${BOLD}│${RESET}`);
        console.log(`       ${BOLD}│${RESET} 🛡  RISK        ${isFor ? GREEN : RED}${v.risk.verdict}${RESET}  score: ${BOLD}${v.risk.risk_score}${RESET}  ${voteTag('risk')}`);
        console.log(`       ${BOLD}│${RESET}   ${GRAY}Reasoning : ${v.risk.reasoning}${RESET}`);
        console.log(`       ${BOLD}│${RESET}   ${GRAY}Key arg   : ${v.risk.key_argument}${RESET}`);
        if (v.risk.glassdoor_score != null) {
            console.log(`       ${BOLD}│${RESET}   ${GRAY}Glassdoor : ${v.risk.glassdoor_score}/5${RESET}`);
        }
        if (v.risk.red_flags?.length) {
            for (const rf of v.risk.red_flags) {
                const sev = rf.severity === 'high' ? RED : rf.severity === 'medium' ? YELLOW : GRAY;
                console.log(`       ${BOLD}│${RESET}   ${sev}⚑ [${rf.severity}] ${rf.flag}${RESET}  ${GRAY}${rf.source}${RESET}`);
            }
        }
    }

    if (v.opportunity) {
        const isFor = forSet.has('opportunity');
        console.log(`       ${BOLD}│${RESET}`);
        console.log(`       ${BOLD}│${RESET} ⚡ OPPORTUNITY  ${isFor ? GREEN : RED}${v.opportunity.verdict}${RESET}  score: ${BOLD}${v.opportunity.urgency_score}${RESET}  ${voteTag('opportunity')}`);
        console.log(`       ${BOLD}│${RESET}   ${GRAY}Reasoning : ${v.opportunity.reasoning}${RESET}`);
        console.log(`       ${BOLD}│${RESET}   ${GRAY}Key arg   : ${v.opportunity.key_argument}${RESET}`);
    }

    console.log(`       ${BOLD}└${'─'.repeat(49)}${RESET}`);

    // ── Decision breakdown ────────────────────────────────────────────────────
    const nFor = md?.agents_for?.length ?? 0;
    const nPresent = Object.values(v).filter(Boolean).length;
    console.log(`\n       ${BOLD}DECISION BREAKDOWN${RESET}`);
    console.log(`         Apply-equivalent : ${BOLD}${nFor}/${nPresent}${RESET} agents voted for`);
    if (md?.agents_for?.length) {
        console.log(`         For             : ${GREEN}${md.agents_for.join(', ')}${RESET}`);
    }
    if (md?.agents_against?.length) {
        console.log(`         Against         : ${RED}${md.agents_against.join(', ')}${RESET}`);
    }
    if (md?.dissent_note) {
        console.log(`         Dissent         : ${YELLOW}${md.dissent_note}${RESET}`);
    }

    if (persistResult.agent_failures.length > 0) {
        console.log(`         ${YELLOW}⚠ Failed agents : ${persistResult.agent_failures.join(', ')} (degraded mode)${RESET}`);
    }

    console.log(`\n       ${decisionLabel(dec)}  ${GRAY}(${elapsed}s total)${RESET}`);
    console.log(`       ${GRAY}verdict_id: ${persistResult.verdict_id}${RESET}\n`);

    outcomes.push({
        job,
        verdictId: persistResult.verdict_id,
        decision: dec,
        agentFailures: persistResult.agent_failures,
        summaryText: degResult.decision?.summary ?? null,
        source,
    });
}

// ── SUMMARY ───────────────────────────────────────────────────────────────────
divider('SUMMARY');

const totalMs = Date.now() - overallStart;
const tally: Record<string, number> = {};
for (const o of outcomes) {
    tally[o.decision] = (tally[o.decision] ?? 0) + 1;
}

console.log(`\n  Discovery`);
console.log(`    MCF scan   : ${mcfJobs.length} job(s)`);
console.log(`    Exa search : ${exaJobs.length} job(s) (unique, after dedup)`);
console.log(`    Combined   : ${discovered.length} job(s) total`);
console.log(`\n  Pre-filter`);
console.log(`    Passed     : ${survivors.length} (${survivorsMcf} MCF, ${survivorsExa} Exa)`);
console.log(`    Rejected   : ${rejected.length}`);
console.log(`\n  Debate`);
console.log(`    Jobs run   : ${survivors.length}`);
console.log(`    Time taken : ${(totalMs / 1000).toFixed(1)}s total\n`);

console.log('  Outcomes:');
for (const [dec, count] of Object.entries(tally)) {
    console.log(`    ${decisionLabel(dec)} — ${count} job(s)`);
}

const queued = outcomes.filter((o) =>
    o.decision === 'apply_consensus' || o.decision === 'apply_with_caveat'
);
const escalated = outcomes.filter((o) => o.decision === 'deadlock_escalate');

if (queued.length > 0) {
    console.log(`\n  ${GREEN}Queued for your review (apply-equivalent):${RESET}`);
    for (const o of queued) {
        console.log(`    • ${o.job.role_title} @ ${o.job.company}  ${GRAY}${o.source}${RESET}`);
    }
}

if (escalated.length > 0) {
    console.log(`\n  ${YELLOW}Needs your decision (deadlock):${RESET}`);
    for (const o of escalated) {
        console.log(`    • ${o.job.role_title} @ ${o.job.company}  ${GRAY}${o.source}${RESET}`);
        if (o.summaryText) console.log(`      ${GRAY}${o.summaryText}${RESET}`);
    }
}

divider('COMPLETE');
console.log(`\n  DynamoDB now has real Jobs + AgentVerdicts for ${USER_ID}.`);
console.log(`  Visit http://localhost:3000/api/dashboard (sign in first) to see live data.\n`);
