/**
 * GET /api/growth — Get growth roadmap (Req 19.5).
 *
 * Authenticated BFF route that reads the user's current skill-gap roadmap
 * from the SkillGaps table. Returns the most recently created roadmap for the
 * Growth Roadmap view.
 */

import { getAuthenticatedUser, unauthorizedResponse } from '../lib/auth';
import { DEMO_MODE, DEMO_GROWTH } from '../lib/demo';

export async function GET() {
    if (DEMO_MODE) return Response.json({ skills: DEMO_GROWTH.skills });

    const user = await getAuthenticatedUser();
    if (!user) return unauthorizedResponse();

    try {
        const { DynamoDBWrapper } = await import('@worksignal/shared');
        const db = new DynamoDBWrapper();

        // Query the SkillGaps table for this user's roadmaps.
        const items = await db.query('SkillGaps', {
            KeyConditionExpression: 'user_id = :u',
            ExpressionAttributeValues: { ':u': user.userId },
        });

        if (!items || items.length === 0) {
            return new Response(null, { status: 204 });
        }

        // Return the most recently created roadmap that has a roadmap built.
        const withRoadmap = items.filter(
            (item) => item.roadmap && item.status === 'roadmap_created',
        );

        if (withRoadmap.length === 0) {
            return new Response(null, { status: 204 });
        }

        // Return the first roadmap found (most relevant skill gap).
        const entry = withRoadmap[0]!;
        return Response.json({
            skill: entry.skill,
            times_flagged: entry.times_flagged,
            roadmap: entry.roadmap,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Internal server error';
        return Response.json({ error: 'Error', message }, { status: 500 });
    }
}
