/**
 * POST /api/brief/run — Run the Calibration Agent for the current week.
 *
 * Executes the weekly recalibration flow:
 *   1. Runs RecalibrationEngine (accuracy, threshold adjustments, brief text).
 *   2. Computes agent_score_averages and skills_gap_summary from this week's verdicts.
 *   3. Patches the new RecalibrationLog entry with those fields.
 *   4. Returns the full entry so the client can refresh without a second fetch.
 */

import { DynamoDBWrapper } from '@worksignal/shared';
import { createRecalibrationEngine } from '@worksignal/backend';
import { getAuthenticatedUser, unauthorizedResponse } from '../../lib/auth';
import { DEMO_MODE, DEMO_BRIEF } from '../../lib/demo';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST() {
    if (DEMO_MODE) return Response.json(DEMO_BRIEF);

    const user = await getAuthenticatedUser();
    if (!user) return unauthorizedResponse();

    try {
        const db = new DynamoDBWrapper();

        // 1. Run the recalibration engine — writes RecalibrationLog + updates agent_weights.
        const engine = createRecalibrationEngine({ db });
        await engine.runWeekly(user.userId);

        // 2. Fetch the entry just written.
        const items = await db.query('RecalibrationLog', {
            IndexName: 'user_id-week_of-index',
            KeyConditionExpression: 'user_id = :u',
            ExpressionAttributeValues: { ':u': user.userId },
            ScanIndexForward: false,
            Limit: 1,
        });

        if (!items || items.length === 0) {
            return new Response(null, { status: 204 });
        }

        const entry = items[0]! as Record<string, unknown>;

        // 3. Compute score averages and skills gap from this week's application verdicts.
        const windowStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        const apps = await db.query('Applications', {
            IndexName: 'user_id-company-index',
            KeyConditionExpression: 'user_id = :u',
            ExpressionAttributeValues: { ':u': user.userId },
        }) as Array<Record<string, unknown>>;

        const recentApps = apps.filter(
            (a) => typeof a.sent_at === 'string' && new Date(a.sent_at) >= windowStart,
        );

        const scores = { ambition: [] as number[], realism: [] as number[], risk: [] as number[], opportunity: [] as number[] };
        const gapCounts: Record<string, number> = {};

        for (const app of recentApps) {
            if (typeof app.verdict_id !== 'string') continue;
            const v = await db.get('AgentVerdicts', { verdict_id: app.verdict_id }) as Record<string, unknown> | null;
            if (!v) continue;

            const amb = v.ambition as Record<string, unknown> | undefined;
            const rea = v.realism as Record<string, unknown> | undefined;
            const rsk = v.risk as Record<string, unknown> | undefined;
            const opp = v.opportunity as Record<string, unknown> | undefined;

            const ambScore = (amb?.score ?? amb?.ambition_score) as number | undefined;
            const reaScore = (rea?.score ?? rea?.match_score) as number | undefined;
            const rskScore = (rsk?.score ?? rsk?.risk_score) as number | undefined;
            const oppScore = (opp?.score ?? opp?.urgency_score) as number | undefined;

            if (ambScore != null) scores.ambition.push(ambScore);
            if (reaScore != null) scores.realism.push(reaScore);
            if (rskScore != null) scores.risk.push(rskScore);
            if (oppScore != null) scores.opportunity.push(oppScore);

            // Collect skill gaps from stretch roles (high ambition, low realism).
            if (ambScore != null && reaScore != null && ambScore > 70 && reaScore < 65) {
                const gaps = (rea?.key_gaps ?? rea?.gaps) as string[] | undefined;
                for (const gap of gaps ?? []) {
                    gapCounts[gap] = (gapCounts[gap] ?? 0) + 1;
                }
            }
        }

        const avg = (arr: number[]) =>
            arr.length > 0 ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : 0;

        const agent_score_averages = {
            ambition: avg(scores.ambition),
            realism: avg(scores.realism),
            risk: avg(scores.risk),
            opportunity: avg(scores.opportunity),
        };

        const skills_gap_summary = Object.entries(gapCounts)
            .sort(([, a], [, b]) => b - a)
            .map(([skill, flagged_count]) => ({ skill, flagged_count }));

        // 4. Patch the log entry with the extra fields.
        if (typeof entry.recalibration_id === 'string') {
            await db.update(
                'RecalibrationLog',
                { recalibration_id: entry.recalibration_id },
                {
                    UpdateExpression: 'SET agent_score_averages = :sa, skills_gap_summary = :sgs',
                    ExpressionAttributeValues: {
                        ':sa': agent_score_averages,
                        ':sgs': skills_gap_summary,
                    },
                },
            );
        }

        return Response.json({
            ...entry,
            agent_score_averages,
            skills_gap_summary,
            growth_activities: entry.growth_activities ?? [],
            network_activities: entry.network_activities ?? [],
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Internal server error';
        return Response.json({ error: 'Error', message }, { status: 500 });
    }
}
