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
// Additional jobs — high ambition score, low realism score pattern
// These show the Ambition Agent over-recommending stretch roles
console.log('\n── Additional Jobs (high ambition / low realism) ──────────────');
const EXTRA_JOBS = [
    { job_id: 'seed-job-004', company: 'Shopee', role_title: 'Senior Data Scientist', salary_min: 8000, salary_max: 12000, jd_text: 'Lead ML research for Shopee recommendations. Requires 5+ years ML research, deep PyTorch expertise, publication track record.', days_ago: 4 },
    { job_id: 'seed-job-005', company: 'GoTo', role_title: 'Platform Engineer', salary_min: 9000, salary_max: 13000, jd_text: 'Build distributed data platform. Strong Golang, Kafka, and Kubernetes required. 4+ years backend experience.', days_ago: 3 },
    { job_id: 'seed-job-006', company: 'Stripe', role_title: 'Senior Data Engineer', salary_min: 10000, salary_max: 15000, jd_text: 'Design fault-tolerant pipelines at Stripe scale. Scala, Spark, distributed systems, 4+ years required.', days_ago: 5 },
    { job_id: 'seed-job-007', company: 'Lazada', role_title: 'ML Engineer', salary_min: 7000, salary_max: 10000, jd_text: 'Deploy ML models to production. Kubernetes, Docker, MLflow, AWS SageMaker, 3+ years MLOps required.', days_ago: 2 },
    { job_id: 'seed-job-008', company: 'DBS Bank', role_title: 'Lead Data Scientist', salary_min: 8500, salary_max: 12000, jd_text: 'Lead model governance for credit risk models. 5+ years finance ML, model risk frameworks, Python and R.', days_ago: 6 },
    { job_id: 'seed-job-009', company: 'OCBC', role_title: 'Analytics Engineer', salary_min: 6500, salary_max: 9000, jd_text: 'Build data warehouse on Snowflake. dbt, data modelling, 3+ years data engineering experience.', days_ago: 4 },
    { job_id: 'seed-job-010', company: 'Singtel', role_title: 'AI Platform Engineer', salary_min: 7500, salary_max: 11000, jd_text: 'Build GPU training infrastructure. PyTorch, CUDA, Kubernetes, production ML systems at scale.', days_ago: 3 },
    { job_id: 'seed-job-011', company: 'Carousell', role_title: 'Senior Data Engineer', salary_min: 7000, salary_max: 10000, jd_text: 'Build real-time data pipelines. Apache Kafka, Flink, Spark Streaming, 4+ years experience required.', days_ago: 5 },
    { job_id: 'seed-job-012', company: 'Foodpanda', role_title: 'Data Scientist', salary_min: 6000, salary_max: 9000, jd_text: 'Run causal inference and experimentation for delivery optimisation. A/B testing, R, Bayesian methods, 3+ years.', days_ago: 2 },
    { job_id: 'seed-job-013', company: 'Nium', role_title: 'Data Engineer', salary_min: 6500, salary_max: 9500, jd_text: 'Build data infrastructure on AWS. Terraform, Airflow at scale, Redshift, 3+ years cloud data engineering.', days_ago: 4 },
];
for (const j of EXTRA_JOBS) {
    await seed('Jobs', {
        job_id: j.job_id,
        user_id: USER_ID,
        company: j.company,
        role_title: j.role_title,
        salary_min: j.salary_min,
        salary_max: j.salary_max,
        jd_text: j.jd_text,
        posted_at: new Date(Date.now() - j.days_ago * 24 * 60 * 60 * 1000).toISOString(),
        source_url: `https://www.mycareersfuture.gov.sg/job/${j.role_title.toLowerCase().replace(/\s+/g, '-')}-${j.company.toLowerCase()}`,
        employer_email: null,
        employment_type: 'full_time',
        work_arrangement: 'hybrid_remote',
        location: 'Singapore',
        ep_sponsorship_signal: false,
        mcf_listing_days: j.days_ago,
        scanned_at: NOW,
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Verdicts for extra jobs — high ambition (78-90), low realism (45-62)
console.log('\n── AgentVerdicts (stretch-role pattern) ───────────────────────');
const EXTRA_VERDICTS = [
    { job: 'seed-job-004', vid: 'seed-verdict-004', aScore: 88, rScore: 52, gaps: ['PyTorch / Deep Learning', 'ML Research', 'AWS Cloud Architecture'] },
    { job: 'seed-job-005', vid: 'seed-verdict-005', aScore: 84, rScore: 45, gaps: ['Distributed Systems', 'Golang', 'Apache Kafka / Streaming'] },
    { job: 'seed-job-006', vid: 'seed-verdict-006', aScore: 90, rScore: 48, gaps: ['Distributed Systems', 'Scala', 'AWS Cloud Architecture'] },
    { job: 'seed-job-007', vid: 'seed-verdict-007', aScore: 82, rScore: 55, gaps: ['Kubernetes & Docker', 'Production ML / MLOps', 'AWS Cloud Architecture'] },
    { job: 'seed-job-008', vid: 'seed-verdict-008', aScore: 78, rScore: 58, gaps: ['Finance Domain ML', 'Model Governance', 'Production ML / MLOps'] },
    { job: 'seed-job-009', vid: 'seed-verdict-009', aScore: 76, rScore: 60, gaps: ['Data Warehouse / dbt', 'Snowflake', 'AWS Cloud Architecture'] },
    { job: 'seed-job-010', vid: 'seed-verdict-010', aScore: 80, rScore: 50, gaps: ['PyTorch / Deep Learning', 'Kubernetes & Docker', 'Production ML / MLOps'] },
    { job: 'seed-job-011', vid: 'seed-verdict-011', aScore: 85, rScore: 62, gaps: ['Apache Kafka / Streaming', 'Kubernetes & Docker', 'AWS Cloud Architecture'] },
    { job: 'seed-job-012', vid: 'seed-verdict-012', aScore: 79, rScore: 58, gaps: ['Causal Inference / A/B Testing', 'Production ML / MLOps'] },
    { job: 'seed-job-013', vid: 'seed-verdict-013', aScore: 83, rScore: 54, gaps: ['AWS Cloud Architecture', 'Terraform / IaC', 'Production ML / MLOps'] },
];
for (const v of EXTRA_VERDICTS) {
    await seed('AgentVerdicts', {
        verdict_id: v.vid,
        job_id: v.job,
        user_id: USER_ID,
        ambition: { verdict: 'apply', score: v.aScore, ambition_score: v.aScore, reasoning: 'High-growth company with strong brand value.', key_argument: 'Career ceiling boost.' },
        realism: { verdict: 'skip', score: v.rScore, match_score: v.rScore, reasoning: 'Profile gaps are too wide to expect a callback.', key_argument: 'Missing key requirements.', key_gaps: v.gaps, gaps: v.gaps, wlb_flags: [] },
        risk: { verdict: 'safe', score: 25, risk_score: 25, reasoning: 'Established company, no red flags.', key_argument: 'Stable employer.', red_flags: [], glassdoor_score: 3.8 },
        opportunity: { verdict: 'act_now', score: 72, urgency_score: 72, reasoning: 'Recent posting, competitive window.', key_argument: 'Apply early.', timing_factors: ['Recent posting'] },
        master_decision: {
            decision: 'apply_with_caveat',
            summary: 'Ambition Agent recommends applying; Realism flags significant gaps. Profile stretch likely.',
            agents_for: ['ambition', 'opportunity'],
            agents_against: ['realism'],
            dissent_note: `Realism Agent: gaps in ${v.gaps.slice(0, 2).join(', ')} reduce callback probability.`,
            user_action_required: false,
        },
        agent_failures: [],
        created_at: NOW,
    });
}

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
// Applications for extra stretch-role jobs (all sent, no callback)
for (let i = 0; i < EXTRA_VERDICTS.length; i++) {
    const v = EXTRA_VERDICTS[i]!;
    const job = EXTRA_JOBS[i]!;
    APPLICATIONS.push({
        application_id: `seed-app-${String(i + 3).padStart(3, '0')}`,
        user_id: USER_ID,
        job_id: v.job,
        verdict_id: v.vid,
        company: job.company,
        role_title: job.role_title,
        customised_resume_s3_key: null,
        customisation_applied: false,
        cover_letter_text: `Dear Hiring Manager, I am applying for the ${job.role_title} role at ${job.company}...`,
        sent_at: new Date(Date.now() - (job.days_ago + 1) * 24 * 60 * 60 * 1000).toISOString(),
        recipient_email: null,
        email_thread_id: null,
        status: 'sent',
        redirect_source_url: null,
        redirected_at: null,
        status_updated_at: new Date(Date.now() - (job.days_ago + 1) * 24 * 60 * 60 * 1000).toISOString(),
        classification_confidence: 0,
    });
}
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
        applications_sent: 12,
        callbacks: 1,
        rejections: 1,
        ghosted: 2,
        callback_rate: 0.083,
    },
    agent_performance: {
        ambition:    { correct: 3, incorrect: 9 },
        realism:     { correct: 8, incorrect: 4 },
        risk:        { correct: 10, incorrect: 2 },
        opportunity: { correct: 7, incorrect: 5 },
    },
    agent_score_averages: {
        ambition: 82,
        realism: 56,
        risk: 27,
        opportunity: 74,
    },
    skills_gap_summary: [
        { skill: 'AWS Cloud Architecture',  flagged_count: 7 },
        { skill: 'Production ML / MLOps',   flagged_count: 6 },
        { skill: 'Kubernetes & Docker',     flagged_count: 5 },
        { skill: 'Distributed Systems',     flagged_count: 5 },
        { skill: 'PyTorch / Deep Learning', flagged_count: 4 },
        { skill: 'Data Warehouse / dbt',    flagged_count: 3 },
        { skill: 'Apache Kafka / Streaming', flagged_count: 3 },
    ],
    adjustments_made: [
        {
            agent: 'ambition',
            parameter: 'ambition_threshold',
            old_value: 70,
            new_value: 58,
            reason: 'Ambition Agent over-recommended stretch roles this week (avg score 82 vs realism avg 56). Lowering threshold to reduce overreach.',
        },
    ],
    emergency: false,
    brief_text: 'Week of 9 Jun 2026\n\n12 applications sent, 1 callback (Sea Limited — ML Engineer). Callback rate: 8.3%, in line with the Singapore market baseline.\n\nAgent Accuracy\nAmbition Agent underperformed this week — it recommended applying to 9 roles that generated no callback, averaging a score of 82 while Realism averaged only 56 on those same roles. Realism, Risk, and Opportunity Agents were broadly accurate. The Calibration Agent has lowered the Ambition threshold from 70 → 58 to reduce overreach next week.\n\nKey Actions\n• Start closing the skills gap in AWS and MLOps — these appeared in 7 and 6 JDs respectively.\n• Focus applications on roles where Realism scores above 65 — that is the sweet spot your profile is currently competitive for.\n• Prep for the Sea Limited ML Engineer callback.',
    created_at: NOW,
});

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n✅ Seed complete. Dashboard should now return real data.');
console.log('   Visit http://localhost:3000/api/dashboard to verify.\n');
