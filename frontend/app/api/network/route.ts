/**
 * GET /api/network — Get network suggestions (Req 20.5).
 *
 * Authenticated BFF route that reads persisted NetworkSuggestions when
 * available, otherwise builds on-the-fly via Network_Agent.
 */

import { DynamoDBWrapper } from '@worksignal/shared';
import { createNetworkAgent } from '@worksignal/backend';
import { getAuthenticatedUser, unauthorizedResponse } from '../lib/auth';
import { DEMO_MODE, DEMO_NETWORK_BY_COMPANY } from '../lib/demo';
import { listUserApplications } from '../lib/listUserApplications';

const NETWORK_SUGGESTIONS_TABLE = 'NetworkSuggestions';

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
        const db = new DynamoDBWrapper();
        const url = new URL(request.url);
        const requestedCompany = url.searchParams.get('company')?.trim() ?? '';

        const applications = await listUserApplications(db, user.userId);

        if (!applications || applications.length === 0) {
            return new Response(null, { status: 204 });
        }

        const companyCounts = new Map<string, number>();
        for (const app of applications) {
            const company = String(app.company ?? '');
            if (company) {
                companyCounts.set(company, (companyCounts.get(company) ?? 0) + 1);
            }
        }

        if (companyCounts.size === 0) {
            return new Response(null, { status: 204 });
        }

        let company = requestedCompany;
        if (!company) {
            company = [...companyCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
        }

        if (!company || !companyCounts.has(company)) {
            return new Response(null, { status: 204 });
        }

        const applicationCount = companyCounts.get(company) ?? 0;

        const persisted = await db.get(NETWORK_SUGGESTIONS_TABLE, {
            user_id: user.userId,
            company,
        });

        if (persisted?.suggestions) {
            return Response.json({
                company: persisted.company ?? company,
                application_count: persisted.application_count ?? applicationCount,
                suggestions: persisted.suggestions,
                upcoming_events: persisted.upcoming_events ?? [],
            });
        }

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
