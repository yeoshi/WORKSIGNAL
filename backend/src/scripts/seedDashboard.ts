#!/usr/bin/env npx tsx
/**
 * Seed script — populates DynamoDB with realistic demo data for Rose's user
 * so the real dashboard route (GET /api/dashboard) returns non-empty data.
 *
 * What gets seeded:
 *   Users          — 1 record (Rose's Google OAuth user_id)
 *   Jobs           — 3 scanned jobs (MCF-style)
 *   AgentVerdicts  — 3 verdicts:
 *                      job-001: consensus apply  → becomes an Application
 *                      job-002: consensus apply  → becomes an Application
 *                      job-003: deadlock_escalate user_action_required=true
 *                               → appears in action_needed (no Application yet)
 *   Applications   — 2 records (job-001 sent, job-002 callback)
 *   SkillGaps      — 3 rows (Python, SQL, Cloud)
 *   RecalibrationLog — 1 weekly record
 *
 * Usage:
 *   cd /Users/roselin/Desktop/SUPERAI/WORKSIGNAL/backend
 *   npx tsx src/scripts/seedDashboard.ts
 *
 * To wipe and re-seed, run again — put-item is idempotent (overwrites).
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ── Load credentials from .env.aws ───────────────────────────────────────────
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
        if (!process.env[key]) process.env[key] = val;
    }
    console.log('✓ Loaded credentials from .env.aws');
} catch {
    console.log('  No .env.aws — using environment variables');
}

// Dynamic import — runs AFTER .env.aws is loaded so DEFAULT_REGION picks up us-east-1
const { DynamoDBWrapper } = await import('@worksignal/shared');

// ── Seed config ───────────────────────────────────────────────────────────────
const USER_ID = '109848448123861557723';   // Rose's Google OAuth sub
const NOW     = new Date().toISOString();
const db      = new DynamoDBWrapper();

// ── Helper ────────────────────────────────────────────────────────────────────
async function seed(table: string, item: Record<string, unknown>) {
    await db.put(table, item);
    console.log(`  ✓ ${table}:`, Object.entries(item).slice(0, 2).map(([k,v]) => `${k}=${String(v).slice(0,30)}`).join(', '));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── Users ──────────────────────────────────────────────────────');
await seed('Users', {
    user_id: USER_ID,
    email: 'lx.rose.lin@gmail.com',
    name: 'Rose Lin',
    last_scan_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hrs ago
    created_at: '2026-06-10T00:00:00.000Z',
    profile: {
        current_role: 'Data Scientist',
        years_experience: 2,
        skills: ['Python', 'SQL', 'Machine Learning', 'Tableau', 'Airflow'],
        education: 'BSc Data Science',
        university: 'National University of Singapore',
        target_roles: ['Data Engineer', 'ML Engineer', 'Software Engineer'],
        target_industries: ['Technology', 'Finance'],
        dream_companies: ['Grab', 'Sea Limited', 'GovTech'],
        priority_ranking: ['growth', 'salary', 'balance', 'brand', 'purpose', 'stability'],
    },
    career_stage: 'early_career',
    residency_status: 'citizen',
    resume_s3_key: null,
    agent_weights: {
        ambition_threshold: 70,
        realism_threshold: 80,
        risk_max_acceptable: 70,
        opportunity_urgency_boost: true,
    },
    non_negotiables: {
        min_salary: 4000,
        employment_type: ['full_time'],
        work_arrangement: 'hybrid_remote',
        ep_sponsorship_required: false,
        custom: [],
    },
});

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── Jobs ───────────────────────────────────────────────────────');
const JOBS = [
    {
        job_id: 'seed-job-001',
        user_id: USER_ID,
        company: 'Grab',
        role_title: 'Data Engineer',
        salary_min: 6000,
        salary_max: 8500,
        jd_text: 'Build and maintain data pipelines for Grab\'s regional analytics platform. Work with Python, Spark, and Airflow.',
        posted_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        source_url: 'https://www.mycareersfuture.gov.sg/job/data-engineer-grab',
        employer_email: 'talent@grab.com',
        employment_type: 'full_time',
        work_arrangement: 'hybrid_remote',
        location: 'Singapore',
        ep_sponsorship_signal: false,
        mcf_listing_days: 5,
        scanned_at: NOW,
    },
    {
        job_id: 'seed-job-002',
        user_id: USER_ID,
        company: 'Sea Limited',
        role_title: 'ML Engineer',
        salary_min: 7000,
        salary_max: 10000,
        jd_text: 'Deploy and scale ML models for Shopee recommendations. Strong Python and MLOps background needed.',
        posted_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        source_url: 'https://www.mycareersfuture.gov.sg/job/ml-engineer-sea',
        employer_email: null,
        employment_type: 'full_time',
        work_arrangement: 'hybrid_remote',
        location: 'Singapore',
        ep_sponsorship_signal: true,
        mcf_listing_days: 3,
        scanned_at: NOW,
    },
    {
        job_id: 'seed-job-003',
        user_id: USER_ID,
        company: 'ByteDance',
        role_title: 'Data Analyst, TikTok SG',
        salary_min: 4500,
        salary_max: 6000,
        jd_text: 'Analyse TikTok content performance and creator monetisation. High-pressure environment, fast growth.',
        posted_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        source_url: 'https://www.mycareersfuture.gov.sg/job/data-analyst-bytedance',
        employer_email: null,
        employment_type: 'full_time',
        work_arrangement: 'onsite',
        location: 'Singapore',
        ep_sponsorship_signal: false,
        mcf_listing_days: 1,
        scanned_at: NOW,
    },
];
for (const job of JOBS) await seed('Jobs', job);

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── AgentVerdicts ──────────────────────────────────────────────');
const VERDICTS = [
    {
        verdict_id: 'seed-verdict-001',
        job_id: 'seed-job-001',
        user_id: USER_ID,
        ambition:  { verdict: 'apply', score: 85, reasoning: 'Grab is a tier-1 tech company, strong for career growth.', key_argument: 'Brand value + regional exposure.' },
        realism:   { verdict: 'apply', score: 78, reasoning: 'Salary aligns. Python + SQL match well.', key_argument: 'Solid profile match.', gaps: [], wlb_flags: [] },
        risk:      { verdict: 'safe', score: 15, reasoning: 'Grab is a stable employer.', key_argument: 'Established company.', red_flags: [], glassdoor_score: 4.0 },
        opportunity: { verdict: 'act_now', score: 88, reasoning: 'Posted 5 days ago. Strong fit.', key_argument: 'Act before applications flood in.', timing_factors: ['Recent posting', 'Strong match'] },
        master_decision: {
            decision: 'apply_consensus',
            summary: 'All four agents agree. Strong brand, aligned salary, good skill match.',
            agents_for: ['ambition', 'realism', 'risk', 'opportunity'],
            agents_against: [],
            dissent_note: null,
            user_action_required: false,
            resume_instructions: 'Lead with Spark pipeline work and Python data engineering experience.',
            cover_letter_angle: 'Regional data platform ambition.',
        },
        agent_failures: [],
        created_at: NOW,
    },
    {
        verdict_id: 'seed-verdict-002',
        job_id: 'seed-job-002',
        user_id: USER_ID,
        ambition:  { verdict: 'apply', score: 90, reasoning: 'Sea Limited is a top-tier tech company.', key_argument: 'Excellent career trajectory.' },
        realism:   { verdict: 'apply', score: 72, reasoning: 'ML skills are a partial match. Strong upside if you land it.', key_argument: 'Stretch role — worth applying.', gaps: ['MLOps depth'], wlb_flags: [] },
        risk:      { verdict: 'safe', score: 20, reasoning: 'Sea Limited has strong fundamentals.', key_argument: 'Financially stable.', red_flags: [], glassdoor_score: 3.9 },
        opportunity: { verdict: 'act_now', score: 82, reasoning: 'Posted 3 days ago. EP sponsorship available.', key_argument: 'Rare EP-sponsoring ML role.', timing_factors: ['EP sponsorship', 'Recent posting'] },
        master_decision: {
            decision: 'apply_consensus',
            summary: 'Strong consensus. EP sponsorship and top-tier company make this a high-priority application.',
            agents_for: ['ambition', 'realism', 'risk', 'opportunity'],
            agents_against: [],
            dissent_note: null,
            user_action_required: false,
            resume_instructions: 'Highlight ML model deployment experience.',
            cover_letter_angle: 'ML at scale, Shopee recommendations impact.',
        },
        agent_failures: [],
        created_at: NOW,
    },
    {
        // This verdict has user_action_required=true — will appear in action_needed
        // because there is no Application record for seed-job-003
        verdict_id: 'seed-verdict-003',
        job_id: 'seed-job-003',
        user_id: USER_ID,
        ambition:  { verdict: 'apply', score: 60, reasoning: 'TikTok has growth but lower prestige.', key_argument: 'Fast-paced growth environment.' },
        realism:   { verdict: 'apply', score: 70, reasoning: 'Good skill match.', key_argument: 'Salary is below your minimum though.', gaps: [], wlb_flags: ['High-pressure culture'] },
        risk:      { verdict: 'caution', score: 55, reasoning: 'ByteDance has high churn and limited EP sponsorship clarity.', key_argument: 'Culture risk is real.', red_flags: ['High churn reported', 'Salary below minimum'], glassdoor_score: 3.4 },
        opportunity: { verdict: 'act_now', score: 75, reasoning: 'Fresh posting. TikTok SG is hiring now.', key_argument: 'Time-sensitive.', timing_factors: ['1 day old listing'] },
        master_decision: {
            decision: 'deadlock_escalate',
            summary: 'Agents split 2-2. Ambition and Opportunity say apply; Realism and Risk flag salary below minimum and high churn. Your call.',
            agents_for: ['ambition', 'opportunity'],
            agents_against: ['realism', 'risk'],
            dissent_note: 'Salary $4,500 is below your stated minimum of $5,000.',
            user_action_required: true,
            resume_instructions: null,
            cover_letter_angle: null,
        },
        agent_failures: [],
        created_at: NOW,
    },
];
for (const v of VERDICTS) await seed('AgentVerdicts', v);

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── Applications ───────────────────────────────────────────────');
// Only job-001 and job-002 have applications. job-003 intentionally has none
// so it appears in the action_needed join.
const APPLICATIONS = [
    {
        application_id: 'seed-app-001',
        user_id: USER_ID,
        job_id: 'seed-job-001',
        verdict_id: 'seed-verdict-001',
        company: 'Grab',
        role_title: 'Data Engineer',
        customised_resume_s3_key: null,
        customisation_applied: false,
        cover_letter_text: 'Dear Hiring Manager, I am excited to apply for the Data Engineer role at Grab...',
        sent_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        recipient_email: 'talent@grab.com',
        email_thread_id: 'thread-seed-001',
        status: 'sent',
        redirect_source_url: null,
        redirected_at: null,
        status_updated_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        classification_confidence: 0,
    },
    {
        application_id: 'seed-app-002',
        user_id: USER_ID,
        job_id: 'seed-job-002',
        verdict_id: 'seed-verdict-002',
        company: 'Sea Limited',
        role_title: 'ML Engineer',
        customised_resume_s3_key: null,
        customisation_applied: false,
        cover_letter_text: 'Dear Hiring Manager, I am writing about the ML Engineer position at Sea...',
        sent_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        recipient_email: null,
        email_thread_id: null,
        status: 'callback',
        redirect_source_url: 'https://sea.com/careers/ml-engineer',
        redirected_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        status_updated_at: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
        classification_confidence: 91,
    },
];
for (const app of APPLICATIONS) await seed('Applications', app);

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── SkillGaps ──────────────────────────────────────────────────');
const SKILL_GAPS = [
    {
        user_id: USER_ID,
        skill: 'Apache Spark / Data Engineering',
        times_flagged: 4,
        first_flagged_at: '2026-06-05T00:00:00.000Z',
        flagged_job_ids: ['seed-job-001'],
        roadmap: { projected_match_improvement: '+22%', networking_opportunities: [] },
        status: 'identified',
    },
    {
        user_id: USER_ID,
        skill: 'MLOps & Model Deployment',
        times_flagged: 3,
        first_flagged_at: '2026-06-06T00:00:00.000Z',
        flagged_job_ids: ['seed-job-002'],
        roadmap: { projected_match_improvement: '+18%', networking_opportunities: [] },
        status: 'identified',
    },
    {
        user_id: USER_ID,
        skill: 'AWS Cloud Architecture',
        times_flagged: 2,
        first_flagged_at: '2026-06-07T00:00:00.000Z',
        flagged_job_ids: ['seed-job-001', 'seed-job-002'],
        roadmap: { projected_match_improvement: '+15%', networking_opportunities: [] },
        status: 'identified',
    },
];
for (const sg of SKILL_GAPS) await seed('SkillGaps', sg);

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── RecalibrationLog ───────────────────────────────────────────');
await seed('RecalibrationLog', {
    recalibration_id: 'seed-recal-001',
    user_id: USER_ID,
    week_of: '2026-06-09',
    metrics: {
        applications_sent: 2,
        callbacks: 1,
        rejections: 0,
        ghosted: 0,
        callback_rate: 0.5,
    },
    agent_performance: {
        ambition:    { correct: 2, incorrect: 0 },
        realism:     { correct: 2, incorrect: 0 },
        risk:        { correct: 2, incorrect: 0 },
        opportunity: { correct: 2, incorrect: 0 },
    },
    adjustments_made: [],
    emergency: false,
    brief_text: 'Strong start — 50% callback rate on first 2 applications. Sea Limited ML Engineer callback received.',
    created_at: NOW,
});

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n✅ Seed complete. Dashboard should now return real data.');
console.log('   Visit http://localhost:3000/api/dashboard to verify.\n');
