/**
 * GET /api/dashboard — Dashboard aggregate data.
 *
 * Returns the agent status, action-needed items, pipeline summary,
 * growth/network cards, intelligence summary, and relaxation suggestions.
 */

import { getAuthenticatedUser, unauthorizedResponse } from '../lib/auth';
import { DEMO_MODE } from '../lib/demoData';

const demoDashboard = {
    agent_status: {
        scanning: false,
        last_scan_at: '2025-06-09T06:00:00.000Z',
        next_scan_at: '2025-06-09T09:00:00.000Z',
        jobs_in_review: 3,
    },
    action_needed: [
        {
            job_id: 'job-007',
            application_id: null,
            company: 'ByteDance Singapore',
            role_title: 'Backend Engineer, TikTok',
            decision: 'deadlock_escalate' as const,
            user_action_required: true,
            reason: 'Two agents recommend applying, two recommend skipping. Your input is needed to break the tie.',
            created_at: '2025-06-08T14:00:00.000Z',
        },
        {
            job_id: 'job-008',
            application_id: null,
            company: 'Binance',
            role_title: 'Full Stack Engineer (Web3)',
            decision: 'apply_with_caveat' as const,
            user_action_required: true,
            reason: 'Realism match score is 42% — explicit confirmation required before applying.',
            created_at: '2025-06-08T16:00:00.000Z',
        },
    ],
    pipeline: {
        total: 6,
        by_status: {
            sent: 2,
            callback: 1,
            rejected: 1,
            ghosted: 1,
            redirected_external: 1,
        },
    },
    growth: [
        {
            skill: 'System Design at Scale',
            projected_match_improvement: '68% → 84%',
            times_flagged: 5,
        },
        {
            skill: 'Kubernetes Orchestration',
            projected_match_improvement: '55% → 72%',
            times_flagged: 3,
        },
    ],
    network: [
        {
            company: 'Grab Singapore',
            application_count: 2,
            suggestion_count: 3,
        },
    ],
    intelligence: {
        callback_rate: 0.333,
        latest_recalibration: null,
    },
    relaxation_suggestions: [
        {
            suggestion_id: 'sug-demo-001',
            user_id: 'demo-user',
            created_at: '2025-06-08T06:00:00.000Z',
            scan_run_id: 'run-demo-001',
            target_non_negotiable: 'min_salary',
            current_value: 7000,
            proposed_value: 6000,
            rationale: 'Lowering minimum salary from $7,000 to $6,000 would surface 8 of the 12 jobs scanned in your most recent cycle. Several strong-match roles at funded startups fall in the $6,000–$6,900 range.',
            evidence_job_ids: ['job-010', 'job-011', 'job-012', 'job-013', 'job-014', 'job-015', 'job-016', 'job-017'],
            approval_state: 'pending' as const,
        },
    ],
};

export async function GET() {
    if (DEMO_MODE) {
        return Response.json(demoDashboard);
    }

    const user = await getAuthenticatedUser();
    if (!user) return unauthorizedResponse();

    // In production this would aggregate data from multiple backend services.
    // For now, return a minimal empty state.
    return Response.json({
        agent_status: { scanning: false, last_scan_at: null, next_scan_at: null, jobs_in_review: 0 },
        action_needed: [],
        pipeline: { total: 0, by_status: {} },
        growth: [],
        network: [],
        intelligence: { callback_rate: null, latest_recalibration: null },
        relaxation_suggestions: [],
    });
}
