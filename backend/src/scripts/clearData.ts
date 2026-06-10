#!/usr/bin/env npx tsx
/**
 * clearData.ts — Delete all Jobs and AgentVerdicts for Rose's user.
 *
 * Usage:
 *   cd /Users/roselin/Desktop/SUPERAI/WORKSIGNAL/backend
 *   npx tsx src/scripts/clearData.ts
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

const { DynamoDBWrapper } = await import('@worksignal/shared');

const RESET  = '\x1b[0m';
const BOLD   = '\x1b[1m';
const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const GRAY   = '\x1b[90m';

const USER_ID = '109848448123861557723';
const REGION  = process.env.AWS_DEFAULT_REGION ?? 'us-east-1';

console.log(`${BOLD}WORKSIGNAL — CLEAR DATA${RESET}`);
console.log(`  Region : ${REGION}`);
console.log(`  User   : ${USER_ID}\n`);

const db = new DynamoDBWrapper();

// ── 1. Find all jobs for this user ────────────────────────────────────────────
console.log('Querying Jobs table…');
const jobs = await db.query('Jobs', {
    IndexName: 'user_id-index',
    KeyConditionExpression: 'user_id = :u',
    ExpressionAttributeValues: { ':u': USER_ID },
});
console.log(`  Found ${BOLD}${jobs.length}${RESET} job(s)\n`);

if (jobs.length === 0) {
    console.log(`${GREEN}✓ Nothing to delete — DynamoDB is already empty for this user.${RESET}\n`);
    process.exit(0);
}

// ── 2. For each job, delete its verdicts then the job itself ──────────────────
let deletedJobs     = 0;
let deletedVerdicts = 0;

for (const job of jobs) {
    const jobId = job.job_id as string;
    const title = `${String(job.role_title ?? '?')} @ ${String(job.company ?? '?')}`;

    const verdicts = await db.query('AgentVerdicts', {
        IndexName: 'job_id-user_id-index',
        KeyConditionExpression: 'job_id = :j AND user_id = :u',
        ExpressionAttributeValues: { ':j': jobId, ':u': USER_ID },
    });

    for (const v of verdicts) {
        const vid = v.verdict_id as string;
        await db.delete('AgentVerdicts', { verdict_id: vid });
        console.log(`  ${RED}✗ AgentVerdicts${RESET}  verdict_id: ${GRAY}${vid}${RESET}`);
        deletedVerdicts++;
    }

    await db.delete('Jobs', { job_id: jobId });
    console.log(`  ${RED}✗ Jobs${RESET}           job_id: ${GRAY}${jobId}${RESET}  ${title}`);
    deletedJobs++;
}

// ── 3. Summary ────────────────────────────────────────────────────────────────
console.log(`\n${GREEN}✓ Done.${RESET}`);
console.log(`  Deleted ${BOLD}${deletedJobs}${RESET} job(s) and ${BOLD}${deletedVerdicts}${RESET} verdict(s) from DynamoDB.`);
console.log(`\n  Run the pipeline to repopulate:`);
console.log(`  ${GRAY}npx tsx src/scripts/runFullFlow.ts${RESET}\n`);
