/**
 * GET /api/dashboard — Aggregate dashboard payload (Req 21.3, task 24.1).
 */

import { DynamoDBWrapper } from '@worksignal/shared';
import { getAuthenticatedUser, unauthorizedResponse } from '../lib/auth';
import { DEMO_MODE, DEMO_DASHBOARD } from '../lib/demo';
import { listUserApplications } from '../lib/listUserApplications';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function buildNetworkSummary(
  applications: Array<Record<string, unknown>>,
): Array<{ company: string; application_count: number; suggestion_count: number }> {
  const counts = new Map<string, number>();
  for (const app of applications) {
    const company = String(app.company ?? '');
    if (company) {
      counts.set(company, (counts.get(company) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .map(([company, application_count]) => ({
      company,
      application_count,
      suggestion_count: 0,
    }));
}

export async function GET() {
  if (DEMO_MODE) return Response.json(DEMO_DASHBOARD);

  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  try {
    const db = new DynamoDBWrapper();

    const [userRecord, applications, skillGaps, recalibrations] = await Promise.all([
      db.get('Users', { user_id: user.userId }),
      listUserApplications(db, user.userId),
      db.query('SkillGaps', {
        KeyConditionExpression: 'user_id = :u',
        ExpressionAttributeValues: { ':u': user.userId },
      }),
      db.query('RecalibrationLog', {
        IndexName: 'user_id-week_of-index',
        KeyConditionExpression: 'user_id = :u',
        ExpressionAttributeValues: { ':u': user.userId },
        ScanIndexForward: false,
        Limit: 1,
      }),
    ]);

    const jobs = await db.query('Jobs', {
      IndexName: 'user_id-index',
      KeyConditionExpression: 'user_id = :u',
      ExpressionAttributeValues: { ':u': user.userId },
    });

    const appliedJobIds = new Set(
      applications.map((app) => app.job_id).filter(Boolean),
    );
    const unappliedJobs = (jobs ?? []).filter(
      (job) => job.job_id && !appliedJobIds.has(job.job_id as string),
    );

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
        return {
          job,
          verdict: verdicts[0] as Record<string, unknown> | undefined,
        };
      }),
    );

    const actionNeeded = verdictChecks
      .filter(({ verdict }) => {
        const md = verdict?.master_decision as Record<string, unknown> | undefined;
        return (
          md?.user_action_required === true || md?.decision === 'deadlock_escalate'
        );
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

    const byStatus: Record<string, number> = {};
    for (const app of applications) {
      const status = app.status as string | undefined;
      if (status) {
        byStatus[status] = (byStatus[status] ?? 0) + 1;
      }
    }

    const lastScanAt = (userRecord?.last_scan_at as string) ?? null;
    const nextScanAt = lastScanAt
      ? new Date(new Date(lastScanAt).getTime() + ONE_DAY_MS).toISOString()
      : null;

    const growthSummary = (skillGaps ?? [])
      .sort(
        (a, b) =>
          ((b.times_flagged as number) ?? 0) - ((a.times_flagged as number) ?? 0),
      )
      .slice(0, 3)
      .map((sg) => ({
        skill: sg.skill,
        projected_match_improvement:
          (sg.roadmap as Record<string, unknown> | undefined)
            ?.projected_match_improvement ?? null,
        times_flagged: sg.times_flagged ?? 0,
      }));

    const latestRecal = (recalibrations[0] as Record<string, unknown>) ?? null;
    const callbackRate =
      (latestRecal?.metrics as Record<string, unknown> | undefined)?.callback_rate ??
      null;

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
      network: buildNetworkSummary(applications),
      intelligence: {
        callback_rate: callbackRate,
        latest_recalibration: latestRecal,
      },
      relaxation_suggestions: [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return Response.json({ error: 'Error', message }, { status: 500 });
  }
}
