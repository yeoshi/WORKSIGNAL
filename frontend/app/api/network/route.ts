/**
 * GET /api/network — Get network suggestions (Req 20.5).
 *
 * Authenticated BFF route that reads the user's current network suggestion set.
 * Returns suggestions for the Network Suggestions view, including target company,
 * connection suggestions (alumni → community → cold), and upcoming events.
 */

import { getAuthenticatedUser, unauthorizedResponse } from '../lib/auth';
import { DEMO_MODE, DEMO_NETWORK_BY_COMPANY } from '../lib/demo';

export async function GET(request: Request) {
    if (DEMO_MODE) {
        const company = new URL(request.url).searchParams.get('company') ?? 'Grab';
        const data = DEMO_NETWORK_BY_COMPANY[company];
        if (!data) return new Response(null, { status: 204 });
        return Response.json(data);
    }

    const user = await getAuthenticatedUser();
    if (!user) return unauthorizedResponse();

    try {
        const { DynamoDBWrapper } = await import('@worksignal/shared');
        const db = new DynamoDBWrapper();

        // Query for the user's network suggestions.
        // The Network_Agent stores suggestions keyed by user_id + company.
        // We query the user's applications to find companies with ≥2 applications
        // and then look up any persisted suggestion sets.
        const applications = await db.query('Applications', {
            IndexName: 'user_id-company-index',
            KeyConditionExpression: 'user_id = :u',
            ExpressionAttributeValues: { ':u': user.userId },
        });

        if (!applications || applications.length === 0) {
            return new Response(null, { status: 204 });
        }

        // Count applications per company and find ones with ≥2.
        const companyCounts = new Map<string, number>();
        for (const app of applications) {
            const company = String(app.company ?? '');
            if (company) {
                companyCounts.set(company, (companyCounts.get(company) ?? 0) + 1);
            }
        }

        // Find the first company with ≥2 applications (Network_Agent trigger).
        const targetCompany = [...companyCounts.entries()].find(([, count]) => count >= 2);
        if (!targetCompany) {
            return new Response(null, { status: 204 });
        }

        const [company, applicationCount] = targetCompany;

        // Try to build suggestions on-the-fly using the Network_Agent.
        const { createNetworkAgent } = await import(
            '@worksignal/backend/src/network/networkAgent.js'
        );
        const agent = createNetworkAgent({ db });

        try {
            const suggestionSet = await agent.buildSuggestions(user.userId, company);
            return Response.json({
                company: suggestionSet.company,
                application_count: applicationCount,
                suggestions: suggestionSet.suggestions,
                upcoming_events: suggestionSet.upcoming_events,
            });
        } catch {
            // If building fails (e.g. no Exa client), return basic info.
            return Response.json({
                company,
                application_count: applicationCount,
                suggestions: [],
                upcoming_events: [],
            });
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Internal server error';
        return Response.json({ error: 'Error', message }, { status: 500 });
    }
}
