#!/usr/bin/env npx tsx
/**
 * Live Debate Demo Script
 *
 * Invokes the 4 Bedrock debate agents (Ambition, Realism, Risk, Opportunity)
 * against a sample job posting, then runs the Master Orchestrator to produce
 * a final decision. Outputs full structured logs to the terminal.
 *
 * Usage:
 *   cd backend
 *   npx tsx src/scripts/runDebateDemo.ts
 *
 * Requires:
 *   - AWS credentials in ../.env.aws (or set via env vars)
 *   - AWS_DEFAULT_REGION or AWS_REGION set (e.g. us-west-2)
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Load credentials from ../.env.aws if it exists
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
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
        }
        if (!process.env[key]) {
            process.env[key] = val;
        }
    }
    console.log('Loaded credentials from .env.aws');
} catch {
    // No .env.aws file — rely on environment variables
}

import {
    BedrockRuntimeClient,
    InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import type { Job, UserConfig, VerdictSet, AgentName } from '@worksignal/shared';
import { runAmbitionAgent } from '../debate/agents/ambition.js';
import { runRealismAgent } from '../debate/agents/realism.js';
import { runRiskAgent } from '../debate/agents/risk.js';
import { runOpportunityAgent } from '../debate/agents/opportunity.js';
import { resolveDecision } from '../orchestrator/decisionTree.js';
import type { BedrockInvoke, BedrockRequest, ExaClient } from '../debate/agents/shared.js';
import { createMcfSearch, type RawMcfJob } from '../discovery/opportunityScanner.js';

// ─── Configuration ──────────────────────────────────────────────────────────

const REGION = process.env.AWS_DEFAULT_REGION || process.env.AWS_REGION || 'us-east-1';
const MODEL_ID = process.env.BEDROCK_MODEL_ID || 'us.anthropic.claude-sonnet-4-6';
const EXA_API_KEY = process.env.EXA_API_KEY ?? '';

// ─── Real Bedrock Client ────────────────────────────────────────────────────

const bedrockClient = new BedrockRuntimeClient({ region: REGION });

const bedrockInvoke: BedrockInvoke = async (request: BedrockRequest): Promise<string> => {
    const body = JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 2048,
        system: request.system,
        messages: [{ role: 'user', content: request.user }],
    });

    const command = new InvokeModelCommand({
        modelId: MODEL_ID,
        contentType: 'application/json',
        accept: 'application/json',
        body: new TextEncoder().encode(body),
    });

    const response = await bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    return responseBody.content[0].text;
};

// ─── Real Exa Client (for Risk agent research) ─────────────────────────────

const exaClient: ExaClient = async (query: string) => {
    console.log(`  [Exa] Research query: "${query}"`);
    if (!EXA_API_KEY) {
        console.warn('  [Exa] EXA_API_KEY not set — returning empty results');
        return [];
    }
    const res = await fetch('https://api.exa.ai/search', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            accept: 'application/json',
            'x-api-key': EXA_API_KEY,
        },
        body: JSON.stringify({ query, numResults: 5, type: 'auto', contents: { text: true } }),
    });
    if (!res.ok) {
        throw new Error(`Exa API error: HTTP ${res.status}`);
    }
    const data = (await res.json()) as {
        results?: Array<{ url?: string; title?: string; text?: string | null; publishedDate?: string | null }>;
    };
    const results = (data.results ?? []).map((r) => ({
        url: r.url ?? '',
        title: r.title,
        text: r.text ?? undefined,
        publishedDate: r.publishedDate ?? undefined,
    }));
    console.log(`  [Exa] ${results.length} result(s):`);
    for (const r of results) {
        console.log(`    • ${r.title ?? '(no title)'}`);
        console.log(`      ${r.url}`);
    }
    return results;
};

// ─── Sample Job ─────────────────────────────────────────────────────────────

const sampleJob: Job = {
    job_id: 'demo-job-001',
    user_id: 'demo-user',
    company: 'Grab Singapore',
    role_title: 'Software Engineer, Platform',
    salary_min: 8000,
    salary_max: 12000,
    jd_text: `Join Grab's Platform Engineering team to build and scale the infrastructure powering Southeast Asia's leading super-app.

Responsibilities:
- Design and implement distributed systems handling millions of requests/second
- Build fault-tolerant microservices using TypeScript, Go, and Kubernetes
- Collaborate with product teams to deliver reliable, low-latency APIs
- Participate in on-call rotation and incident response
- Mentor junior engineers and contribute to engineering culture

Requirements:
- 3+ years of experience in backend/platform engineering
- Strong in at least one of: TypeScript, Go, Java, or Python
- Experience with cloud infrastructure (AWS preferred)
- Understanding of distributed systems concepts (CAP theorem, eventual consistency)
- Experience with container orchestration (Kubernetes, Docker)
- Good communication skills and ability to work in cross-functional teams

Nice to have:
- Experience with Kafka or similar streaming platforms
- Knowledge of observability tools (Datadog, Grafana)
- Contributions to open-source projects`,
    posted_at: '2025-06-06T08:00:00.000Z',
    source_url: 'https://www.mycareersfuture.gov.sg/job/grab-platform-001',
    employer_email: 'talent@grab.com',
    employment_type: 'full_time',
    work_arrangement: 'hybrid_remote',
    location: 'Singapore',
    ep_sponsorship_signal: true,
    mcf_listing_days: 3,
    scanned_at: '2025-06-09T06:00:00.000Z',
};

// ─── Sample User ────────────────────────────────────────────────────────────

const sampleUser: UserConfig = {
    user_id: 'demo-user',
    email: 'rose.lin@example.com',
    name: 'Rose Lin',
    career_stage: 'early_career',
    residency_status: 'citizen',
    resume_s3_key: 'resumes/demo/base.pdf',
    profile: {
        current_role: 'Junior Software Engineer',
        years_experience: 2,
        skills: ['TypeScript', 'React', 'Node.js', 'AWS Lambda', 'DynamoDB', 'PostgreSQL', 'Docker'],
        education: 'BSc Computer Science',
        university: 'National University of Singapore',
        target_roles: ['Software Engineer', 'Platform Engineer', 'Backend Engineer'],
        target_industries: ['Technology', 'Fintech'],
        dream_companies: ['Grab', 'Stripe', 'Shopee'],
        priority_ranking: ['growth', 'salary', 'balance', 'brand', 'purpose', 'stability'],
    },
    non_negotiables: {
        min_salary: 6000,
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
    gmail_oauth_token: '',
    inbox_monitoring_available: false,
    onboarding_version: 1,
    updated_at: '2025-06-01T00:00:00.000Z',
    created_at: '2025-05-01T00:00:00.000Z',
} as UserConfig;

// ─── Helper: Pretty Print ───────────────────────────────────────────────────

function divider(title: string) {
    const line = '='.repeat(70);
    console.log(`\n${line}`);
    console.log(`  ${title}`);
    console.log(line);
}

function agentHeader(name: string, emoji: string) {
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`${emoji}  ${name} Agent`);
    console.log('─'.repeat(50));
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
    divider('WORKSIGNAL DEBATE ENGINE - LIVE DEMO');
    console.log(`\nModel: ${MODEL_ID}`);
    console.log(`Region: ${REGION}`);
    console.log(`Job: ${sampleJob.role_title} at ${sampleJob.company}`);
    console.log(`User: ${sampleUser.name} (${sampleUser.career_stage})`);

    // ─── MCF API check ──────────────────────────────────────────────────────
    divider('MCF (MyCareersFuture) API CHECK');
    const searchTerm = sampleUser.profile?.target_roles?.[0] ?? 'Software Engineer';
    console.log(`\nSearching MCF for: "${searchTerm}" (limit 5)`);
    try {
        const mcfSearch = createMcfSearch(fetch as unknown as Parameters<typeof createMcfSearch>[0]);
        const mcfJobs = await mcfSearch({ search: searchTerm, limit: 5 }) as RawMcfJob[];
        console.log(`\nMCF returned ${mcfJobs.length} job(s):`);
        for (const job of mcfJobs.slice(0, 5)) {
            const company = job.postedCompany?.name ?? job.hiringCompany?.name ?? '(unknown company)';
            console.log(`  • ${job.title ?? '(no title)'} — ${company}`);
            if (job.uuid) console.log(`    https://www.mycareersfuture.gov.sg/job/${job.uuid}`);
        }
    } catch (err) {
        console.error(`  MCF API error: ${String(err)}`);
    }

    divider('INVOKING 4 DEBATE AGENTS IN PARALLEL');

    const startTime = Date.now();

    // Invoke all 4 agents in parallel (just like the real debate machine)
    const [ambitionResult, realismResult, riskResult, opportunityResult] = await Promise.all([
        (async () => {
            agentHeader('Ambition', '🚀');
            console.log('  Invoking Bedrock...');
            const result = await runAmbitionAgent(sampleJob, sampleUser, bedrockInvoke);
            console.log('  Done.');
            return result;
        })(),
        (async () => {
            agentHeader('Realism', '🎯');
            console.log('  Invoking Bedrock...');
            const result = await runRealismAgent(sampleJob, sampleUser, bedrockInvoke);
            console.log('  Done.');
            return result;
        })(),
        (async () => {
            agentHeader('Risk', '🛡️');
            console.log('  Invoking Bedrock + Exa research...');
            const result = await runRiskAgent(sampleJob, sampleUser, bedrockInvoke, exaClient);
            console.log('  Done.');
            return result;
        })(),
        (async () => {
            agentHeader('Opportunity', '⚡');
            console.log('  Invoking Bedrock...');
            const result = await runOpportunityAgent(sampleJob, sampleUser, bedrockInvoke);
            console.log('  Done.');
            return result;
        })(),
    ]);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n⏱️  All 4 agents completed in ${elapsed}s`);

    // Print each verdict
    divider('AGENT VERDICTS');

    const agents: Array<{ name: string; emoji: string; result: unknown }> = [
        { name: 'Ambition', emoji: '🚀', result: ambitionResult },
        { name: 'Realism', emoji: '🎯', result: realismResult },
        { name: 'Risk', emoji: '🛡️', result: riskResult },
        { name: 'Opportunity', emoji: '⚡', result: opportunityResult },
    ];

    for (const { name, emoji, result } of agents) {
        agentHeader(name, emoji);
        console.log(JSON.stringify(result, null, 2));
    }

    // Check for invalid verdicts
    const validVerdicts: Partial<VerdictSet> = {};
    const agentNames: AgentName[] = ['ambition', 'realism', 'risk', 'opportunity'];
    const results = [ambitionResult, realismResult, riskResult, opportunityResult];

    let allValid = true;
    for (let i = 0; i < 4; i++) {
        const r = results[i] as unknown as Record<string, unknown>;
        if (r && 'valid' in r && r.valid === false) {
            console.log(`\n⚠️  ${agents[i]!.name} agent returned INVALID verdict`);
            allValid = false;
        } else {
            (validVerdicts as Record<string, unknown>)[agentNames[i]!] = r;
        }
    }

    // Run Master Orchestrator
    divider('MASTER ORCHESTRATOR RESOLUTION');

    if (!allValid) {
        console.log('\n⚠️  Some agents failed - running degraded resolution...');
    }

    try {
        const decision = resolveDecision(validVerdicts as VerdictSet);
        console.log('\n📋 Decision:', decision.decision);
        console.log('📝 Summary:', decision.summary || '(generated by Bedrock in production)');
        console.log('👍 Agents for:', decision.agents_for.join(', '));
        console.log('👎 Agents against:', decision.agents_against.join(', ') || '(none)');
        if (decision.dissent_note) {
            console.log('💬 Dissent:', decision.dissent_note);
        }
        console.log('⚠️  User action required:', decision.user_action_required);

        if (decision.resume_instructions) {
            console.log('\n📄 Resume instructions:', decision.resume_instructions);
        }
        if (decision.cover_letter_angle) {
            console.log('✉️  Cover letter angle:', decision.cover_letter_angle);
        }
    } catch (err) {
        console.error('\n❌ Master Orchestrator failed:', err);
    }

    divider('DEMO COMPLETE');
    console.log(`\nTotal time: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
}

main().catch((err) => {
    console.error('\n❌ Fatal error:', err);
    process.exit(1);
});
