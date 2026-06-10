#!/usr/bin/env npx tsx
/**
 * runFullFlow.ts — Full pipeline: MCF scan → pre-filter → debate → DynamoDB
 *
 * Runs the complete WORKSIGNAL backend pipeline for Rose's demo user:
 *
 *   Step 1  Scan MCF for jobs matching target roles (past 14 days, max 20)
 *           Jobs are saved to DynamoDB Jobs table by the scanner.
 *
 *   Step 2  Pre-filter each job against Rose's non-negotiables:
 *             salary_max >= 5000, full_time, hybrid/remote, Singapore
 *           Filtered-out jobs are never surfaced to the user.
 *
 *   Step 3  Run 4 Bedrock debate agents in parallel on each surviving job:
 *             Ambition · Realism · Risk (+Exa research) · Opportunity
 *           Results + Master decision are saved to DynamoDB AgentVerdicts table.
 *
 *   Step 4  Print summary — dashboard reads real data from DynamoDB.
 *
 * Usage:
 *   cd /Users/roselin/Desktop/SUPERAI/WORKSIGNAL/backend
 *   npx tsx src/scripts/runFullFlow.ts
 *
 * Note: Bedrock calls take ~15–30s per job. With 5–10 surviving jobs expect
 *       ~2–5 minutes total. Progress is printed as each job completes.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    BedrockRuntimeClient,
    InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import {
    SESClient,
    SendEmailCommand,
} from '@aws-sdk/client-ses';
import type { BedrockInvoke, BedrockRequest, ExaClient } from '../debate/agents/shared.js';

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

// ── Exa client (used by Risk agent for company research) ─────────────────────
const exa: ExaClient = async (query: string) => {
    if (!EXA_KEY) {
        console.log(`    [Exa] No API key — skipping company research`);
        return [];
    }
    console.log(`    [Exa] Researching company risks/opportunities for "${query}"… `);
    const res = await fetch('https://api.exa.ai/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json', 'x-api-key': EXA_KEY },
        body: JSON.stringify({ query, numResults: 3, type: 'auto', contents: { text: false } }),
    });
    if (!res.ok) return [];
    const data = await res.json() as { results?: Array<{ url?: string; title?: string }> };
    return (data.results ?? []).map((r) => ({ url: r.url ?? '', title: r.title }));
};

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
console.log(`\n  Region : ${REGION}`);
console.log(`  Model  : ${MODEL_ID}`);
console.log(`  User   : ${USER_ID}`);

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

// ── STEP 1: MCF scan ──────────────────────────────────────────────────────────
divider('STEP 1 — MCF SCAN');

// scanIntervalMs: 0 bypasses the daily gate so we can always run on demand.
// In production, the EventBridge trigger respects the 24h gate natively.
const scanner = createOpportunityScanner({ scanIntervalMs: 0, logger: scannerLogger });

console.log('\n  Scanning MyCareersFuture… (this may take a few seconds)');
const startScan = Date.now();

// scan() does 3 things: fetches MCF, saves each job to DynamoDB Jobs table,
// updates Users.last_scan_at. Returns the saved DiscoveredJob array.
const discovered = await scanner.scan(USER_ID);

const scanMs = Date.now() - startScan;
console.log(`\n  ✓ Found ${BOLD}${discovered.length} jobs${RESET} from MCF (${(scanMs / 1000).toFixed(1)}s)`);
console.log(`  ✓ Saved to DynamoDB Jobs table\n`);

if (discovered.length === 0) {
    console.log(`  ${YELLOW}No jobs returned from MCF. Check that your target roles`);
    console.log(`  are set on the user record (role might be too specific).${RESET}\n`);
}

for (let i = 0; i < discovered.length; i++) {
    const j = discovered[i]!;
    console.log(`  ${GRAY}${String(i + 1).padStart(2)}.${RESET} ${j.role_title} — ${BOLD}${j.company}${RESET}`);
    console.log(`      ${GRAY}${salaryStr(j.salary_min, j.salary_max)} · ${j.employment_type} · ${j.work_arrangement} · ${j.mcf_listing_days}d old${RESET}`);
}

// ── STEP 2: Pre-filter ────────────────────────────────────────────────────────
divider('STEP 2 — PRE-FILTER (non-negotiables)');
console.log('');

type DiscoveredJob = (typeof discovered)[0];
const survivors: DiscoveredJob[] = [];
const rejected: Array<{ job: DiscoveredJob; reasons: string[] }> = [];

for (const job of discovered) {
    const result = preFilter(job, user);
    if (result.pass) {
        survivors.push(job);
        console.log(`  ${GREEN}✓ PASS${RESET}  ${job.role_title} @ ${job.company}`);
    } else {
        const reasons = result.pass === false ? result.violated : [];
        rejected.push({ job, reasons });
        console.log(`  ${RED}✗ FAIL${RESET}  ${job.role_title} @ ${job.company}`);
        console.log(`         ${GRAY}blocked by: ${reasons.join(', ') || 'non-negotiable filter'}${RESET}`);
    }
}

console.log(`\n  Survivors : ${BOLD}${GREEN}${survivors.length}${RESET} passed`);
console.log(`  Rejected  : ${BOLD}${RED}${rejected.length}${RESET} filtered out`);

if (survivors.length === 0) {
    console.log(`\n  ${YELLOW}All jobs were filtered out. Consider relaxing non-negotiables:`);
    console.log(`    - Increase min_salary threshold`);
    console.log(`    - Accept more employment types or work arrangements${RESET}\n`);
    process.exit(0);
}

// ── STEP 3: Debate + Persist ──────────────────────────────────────────────────
divider(`STEP 3 — DEBATE (${survivors.length} jobs)`);

console.log(`\n  Running 4 Bedrock agents per job in parallel.`);
console.log(`  ${GRAY}Each job takes ~15–30s for Bedrock calls.${RESET}\n`);

type DecisionSummary = {
    job: DiscoveredJob;
    verdictId: string;
    decision: string;
    agentFailures: string[];
    summaryText: string | null;
};

const outcomes: DecisionSummary[] = [];
const overallStart = Date.now();

for (let idx = 0; idx < survivors.length; idx++) {
    const job = survivors[idx]!;
    const label = `${String(idx + 1)}/${survivors.length}`;

    console.log(`  ${CYAN}[${label}]${RESET} ${BOLD}${job.role_title}${RESET} @ ${job.company}`);
    console.log(`       ${GRAY}${salaryStr(job.salary_min, job.salary_max)} · ${job.mcf_listing_days}d old${RESET}`);

    const t0 = Date.now();

    // runAndPersistAgentVerdicts:
    //   1. Fans out 4 Bedrock calls in parallel (Ambition, Realism, Risk, Opportunity)
    //   2. Risk agent also calls Exa for company research
    //   3. Validates all 4 verdicts against their schemas
    //   4. Calls resolveDegraded to get the Master decision
    //   5. Writes one AgentVerdicts record to DynamoDB
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

    // Print per-agent scores
    const v = persistResult.verdicts;
    if (v.ambition) console.log(`       🚀 Ambition   : ${v.ambition.verdict} (${v.ambition.ambition_score})`);
    if (v.realism) console.log(`       🎯 Realism    : ${v.realism.verdict} (${v.realism.match_score})`);
    if (v.risk) console.log(`       🛡  Risk       : ${v.risk.verdict} (${v.risk.risk_score})`);
    if (v.opportunity) console.log(`       ⚡ Opportunity : ${v.opportunity.verdict} (${v.opportunity.urgency_score})`);

    if (persistResult.agent_failures.length > 0) {
        console.log(`       ${YELLOW}⚠  Agent failures: ${persistResult.agent_failures.join(', ')}${RESET}`);
    }

    console.log(`       ${decisionLabel(dec)}  ${GRAY}(${elapsed}s)${RESET}`);
    console.log(`       ${GRAY}verdict_id: ${persistResult.verdict_id}${RESET}\n`);

    outcomes.push({
        job,
        verdictId: persistResult.verdict_id,
        decision: dec,
        agentFailures: persistResult.agent_failures,
        summaryText: degResult.decision?.summary ?? null,
    });
}

// ── SUMMARY ───────────────────────────────────────────────────────────────────
divider('SUMMARY');

const totalMs = Date.now() - overallStart;
const tally: Record<string, number> = {};
for (const o of outcomes) {
    tally[o.decision] = (tally[o.decision] ?? 0) + 1;
}

console.log(`\n  Scanned     : ${discovered.length} jobs from MCF`);
console.log(`  Filtered    : ${rejected.length} rejected by pre-filter`);
console.log(`  Debated     : ${survivors.length} jobs`);
console.log(`  Debate time : ${(totalMs / 1000).toFixed(1)}s total\n`);

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
        console.log(`    • ${o.job.role_title} @ ${o.job.company}`);
    }
}

if (escalated.length > 0) {
    console.log(`\n  ${YELLOW}Needs your decision (deadlock):${RESET}`);
    for (const o of escalated) {
        console.log(`    • ${o.job.role_title} @ ${o.job.company}`);
        if (o.summaryText) console.log(`      ${GRAY}${o.summaryText}${RESET}`);
    }
}

// ── STEP 4: SES email digest ──────────────────────────────────────────────────
divider('STEP 4 — EMAIL DIGEST (SES)');

const SES_FROM = process.env.SES_FROM_EMAIL ?? '';
const SES_TO = process.env.DIGEST_DEMO_RECIPIENT ?? SES_FROM;
const SES_REGION_VAL = process.env.SES_REGION ?? REGION;

if (!SES_FROM || !SES_TO) {
    console.log(`\n  ${YELLOW}Skipped — set SES_FROM_EMAIL and DIGEST_DEMO_RECIPIENT in .env.aws to enable.${RESET}\n`);
} else if (queued.length === 0) {
    console.log(`\n  ${GRAY}No apply-equivalent jobs to report — skipping email.${RESET}\n`);
} else {
    const runDate = new Intl.DateTimeFormat('en-SG', {
        timeZone: SGT_TIME_ZONE,
        year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).format(new Date());

    const jobRows = queued.map((o, i) => {
        const label = o.decision === 'apply_consensus' ? 'Consensus Apply' : 'Apply with Caveat';
        const salary = salaryStr(o.job.salary_min, o.job.salary_max);
        const url = o.job.source_url ? `\n     Apply: ${o.job.source_url}` : '';
        const caveat = o.summaryText ? `\n     Note: ${o.summaryText}` : '';
        return `${i + 1}. ${o.job.role_title} @ ${o.job.company}\n   ${salary} · ${label}${url}${caveat}`;
    }).join('\n\n');

    const textBody = [
        `WorkSignal — Apply Digest`,
        `${runDate}`,
        ``,
        `${queued.length} job(s) classified as Apply:`,
        ``,
        jobRows,
        ``,
        `──────────────────────────────────────────`,
        `${survivors.length} debated · ${queued.length} apply · ${escalated.length} deadlock · ${outcomes.filter(o => o.decision === 'skip_consensus' || o.decision === 'veto_skip').length} skip`,
        ``,
        `View full dashboard: http://localhost:3000/dashboard`,
    ].join('\n');

    const htmlRows = queued.map((o, i) => {
        const label = o.decision === 'apply_consensus'
            ? '<span style="color:#16a34a;font-weight:bold">Consensus Apply</span>'
            : '<span style="color:#ca8a04;font-weight:bold">Apply with Caveat</span>';
        const salary = salaryStr(o.job.salary_min, o.job.salary_max);
        const urlHtml = o.job.source_url
            ? `<br><a href="${o.job.source_url}" style="color:#2563eb">View listing →</a>`
            : '';
        const caveatHtml = o.summaryText
            ? `<br><span style="color:#6b7280;font-size:13px">${o.summaryText}</span>`
            : '';
        return `<tr style="border-bottom:1px solid #e5e7eb">
          <td style="padding:12px 8px;font-weight:600">${i + 1}. ${o.job.role_title}</td>
          <td style="padding:12px 8px">${o.job.company}</td>
          <td style="padding:12px 8px;color:#6b7280">${salary}</td>
          <td style="padding:12px 8px">${label}${caveatHtml}${urlHtml}</td>
        </tr>`;
    }).join('\n');

    const htmlBody = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head><body style="font-family:sans-serif;max-width:700px;margin:0 auto;padding:24px">
<h2 style="margin:0 0 4px">WorkSignal — Apply Digest</h2>
<p style="color:#6b7280;margin:0 0 24px">${runDate}</p>
<p><strong>${queued.length} job(s) ready to apply</strong></p>
<table style="width:100%;border-collapse:collapse;font-size:14px">
  <thead><tr style="background:#f3f4f6;text-align:left">
    <th style="padding:8px">#&nbsp;Role</th>
    <th style="padding:8px">Company</th>
    <th style="padding:8px">Salary</th>
    <th style="padding:8px">Verdict</th>
  </tr></thead>
  <tbody>${htmlRows}</tbody>
</table>
<p style="margin-top:24px;color:#6b7280;font-size:13px">
  ${survivors.length} debated · ${queued.length} apply · ${escalated.length} deadlock ·
  <a href="http://localhost:3000/dashboard">Open dashboard →</a>
</p>
</body></html>`;

    try {
        const ses = new SESClient({ region: SES_REGION_VAL });
        await ses.send(new SendEmailCommand({
            Source: SES_FROM,
            Destination: { ToAddresses: [SES_TO] },
            Message: {
                Subject: { Data: `WorkSignal: ${queued.length} job(s) ready to apply — ${runDate}` },
                Body: {
                    Text: { Data: textBody, Charset: 'UTF-8' },
                    Html: { Data: htmlBody, Charset: 'UTF-8' },
                },
            },
        }));
        console.log(`\n  ${GREEN}✓ Digest sent via SES${RESET}`);
        console.log(`    From : ${SES_FROM}`);
        console.log(`    To   : ${SES_TO}`);
        console.log(`    Jobs : ${queued.length} apply-equivalent\n`);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`\n  ${RED}✗ SES send failed: ${msg}${RESET}`);
        console.log(`  ${GRAY}Check that ${SES_FROM} is verified in SES and your AWS credentials have ses:SendEmail permission.${RESET}\n`);
    }
}

divider('COMPLETE');
console.log(`\n  DynamoDB now has real Jobs + AgentVerdicts for ${USER_ID}.`);
console.log(`  Visit http://localhost:3000/dashboard (sign in first) to see live data.\n`);
