/**
 * GET /api/dashboard — Aggregate dashboard payload (Req 21.3, task 24.1).
 *
 * Aggregates from 4 DynamoDB tables in parallel:
 *   - Users          → agent_status (last_scan_at, next_scan_at)
 *   - Applications   → pipeline counts by status
 *   - SkillGaps      → growth summary (top 3 by times_flagged)
 *   - RecalibrationLog → intelligence (latest callback_rate)
 *
 * action_needed is built from a Jobs → AgentVerdicts join:
 *   query Jobs by user, cross-ref against Applications to find unapplied jobs,
 *   then check each verdict for master_decision.user_action_required === true.
 *
 * network and relaxation_suggestions are populated by background Lambda jobs
 * (NetworkAgent, PreFilter) — returned as [] until those Lambdas exist.
 */

import { getAuthenticatedUser, unauthorizedResponse } from '../lib/auth';
import { DEMO_MODE, DEMO_DASHBOARD } from '../lib/demo';

/** One day in ms — matches SCAN_INTERVAL_MS in opportunityScanner. */
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export async function GET() {
    if (DEMO_MODE) return Response.json(DEMO_DASHBOARD);

    const user = await getAuthenticatedUser();
    if (!user) return unauthorizedResponse();

    try {
        const { DynamoDBWrapper } = await import('@worksignal/shared');
        const { createApplicationTracker } = await import(
            '@worksignal/backend/src/applications/applicationTracker.js'
        );

        const db = new DynamoDBWrapper();
        const tracker = createApplicationTracker();

        // ── Step 1: fire all independent reads in parallel ────────────────
        const [userRecord, applications, skillGaps, recalibrations] = await Promise.all([
            // Users table — for last_scan_at
            db.get('Users', { user_id: user.userId }),

            // Applications table via user_id-company-index GSI — pipeline counts
            tracker.list(user.userId),

            // SkillGaps table — composite PK, query by user_id (HASH key)
            db.query('SkillGaps', {
                KeyConditionExpression: 'user_id = :u',
                ExpressionAttributeValues: { ':u': user.userId },
            }),

            // RecalibrationLog via user_id-week_of-index — newest first, limit 1
            db.query('RecalibrationLog', {
                IndexName: 'user_id-week_of-index',
                KeyConditionExpression: 'user_id = :u',
                ExpressionAttributeValues: { ':u': user.userId },
                ScanIndexForward: false,
                Limit: 1,
            }),
        ]);

        // ── Step 2: build action_needed via Jobs → AgentVerdicts join ─────
        // Query Jobs for this user (user_id-index GSI)
        const jobs = await db.query('Jobs', {
            IndexName: 'user_id-index',
            KeyConditionExpression: 'user_id = :u',
            ExpressionAttributeValues: { ':u': user.userId },
        });

        // Cross-ref: which jobs already have an application?
        const appliedJobIds = new Set(
            (applications as Array<{ job_id?: string }>).map((a) => a.job_id)
        );
        const unappliedJobs = jobs.filter(
            (j) => j.job_id && !appliedJobIds.has(j.job_id as string)
        );

        // For each unapplied job, check its AgentVerdicts record.
        // With MAX_JOBS_PER_SCAN=10 this is at most 10 parallel queries.
        const verdictChecks = await Promise.all(
            unappliedJobs.map(async (job) => {
                const verdicts = await db.query('AgentVerdicts', {
                    IndexName: 'job_id-user_id-index',
                    KeyConditionExpression: 'job_id = :j AND user_id = :u',
                    ExpressionAttributeValues: {
                        ':j': job.job_id,
                        ':u': user.userId,
                    },
                    Limit: 1,
                });
                return { job, verdict: verdicts[0] as Record<string, unknown> | undefined };
            })
        );

        // Keep only verdicts where the Master Orchestrator needs user input.
        // deadlock_escalate always requires the user to break the tie (covers
        // records written before decisionTree.ts was fixed to set the flag).
        const actionNeeded = verdictChecks
            .filter(({ verdict }) => {
                const md = verdict?.master_decision as Record<string, unknown> | undefined;
                return md?.user_action_required === true || md?.decision === 'deadlock_escalate';
            })
            .map(({ job, verdict }) => {
                const md = verdict?.master_decision as Record<string, unknown>;
                return {
                    job_id: job.job_id,
                    application_id: null,
                    company: job.company,
                    role_title: job.role_title,
                    decision: md?.decision ?? null,
                    user_action_required: true,
                    reason: md?.summary ?? null,
                    created_at: verdict?.created_at ?? null,
                    has_employer_email: !!job.employer_email,
                    source_url: job.source_url ?? null,
                };
            });

        // ── Step 3: assemble pipeline counts ──────────────────────────────
        const byStatus: Record<string, number> = {};
        for (const app of applications as Array<{ status?: string }>) {
            if (app.status) {
                byStatus[app.status] = (byStatus[app.status] ?? 0) + 1;
            }
        }

        // ── Step 4: agent_status from Users record ─────────────────────────
        const lastScanAt = (userRecord?.last_scan_at as string) ?? null;
        const nextScanAt = lastScanAt
            ? new Date(new Date(lastScanAt).getTime() + ONE_DAY_MS).toISOString()
            : null;

        // ── Step 5: growth — top 3 skill gaps by times_flagged ────────────
        const growthSummary = (skillGaps as Array<Record<string, unknown>>)
            .sort(
                (a, b) =>
                    ((b.times_flagged as number) ?? 0) -
                    ((a.times_flagged as number) ?? 0)
            )
            .slice(0, 3)
            .map((sg) => ({
                skill: sg.skill,
                projected_match_improvement:
                    (sg.roadmap as Record<string, unknown> | undefined)
                        ?.projected_match_improvement ?? null,
                times_flagged: sg.times_flagged ?? 0,
            }));

        // ── Step 6: intelligence from latest RecalibrationLog ─────────────
        const latestRecal =
            (recalibrations[0] as Record<string, unknown>) ?? null;
        const callbackRate =
            (latestRecal?.metrics as Record<string, unknown> | undefined)
                ?.callback_rate ?? null;

        return Response.json({
            agent_status: {
                scanning: false,
                last_scan_at: lastScanAt,
                next_scan_at: nextScanAt,
                jobs_in_review: unappliedJobs.length,
            },
            action_needed: actionNeeded,
            pipeline: {
                total: applications.length,
                by_status: byStatus,
            },
            growth: growthSummary,
            network: [],             // populated by NetworkAgent Lambda (Phase 7)
            intelligence: {
                callback_rate: callbackRate,
                latest_recalibration: latestRecal,
            },
            relaxation_suggestions: [], // populated by PreFilter Lambda (Phase 7)
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Internal server error';
        return Response.json({ error: 'Error', message }, { status: 500 });
    }
}
