/**
 * GET /api/brief — Get weekly brief (Req 21.5).
 *
 * Authenticated BFF route that reads the most recent recalibration log entry
 * for the Weekly Brief view. Returns metrics (applications sent, callbacks,
 * callback rate), per-agent accuracy, and threshold adjustments.
 */

import { getAuthenticatedUser, unauthorizedResponse } from '../lib/auth';

export async function GET() {
    const user = await getAuthenticatedUser();
    if (!user) return unauthorizedResponse();

    try {
        const { DynamoDBWrapper } = await import('@worksignal/shared');
        const db = new DynamoDBWrapper();

        // Query the RecalibrationLog for the user's most recent entry.
        const items = await db.query('RecalibrationLog', {
            IndexName: 'user_id-week_of-index',
            KeyConditionExpression: 'user_id = :u',
            ExpressionAttributeValues: { ':u': user.userId },
            ScanIndexForward: false, // Newest first.
            Limit: 1,
        });

        if (!items || items.length === 0) {
            return new Response(null, { status: 204 });
        }

        const entry = items[0]!;
        return Response.json({
            recalibration_id: entry.recalibration_id,
            user_id: entry.user_id,
            week_of: entry.week_of,
            metrics: entry.metrics,
            agent_performance: entry.agent_performance,
            adjustments_made: entry.adjustments_made,
            emergency: entry.emergency,
            brief_text: entry.brief_text,
            created_at: entry.created_at,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Internal server error';
        return Response.json({ error: 'Error', message }, { status: 500 });
    }
}
