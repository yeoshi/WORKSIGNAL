/**
 * GET /api/network/companies — distinct companies from the user's applications.
 */

import { DynamoDBWrapper } from '@worksignal/shared';
import { getAuthenticatedUser, unauthorizedResponse } from '../../lib/auth';
import { DEMO_MODE, DEMO_NETWORK_BY_COMPANY } from '../../lib/demo';
import { listUserApplications } from '../../lib/listUserApplications';

export async function GET() {
  if (DEMO_MODE) {
    const companies = Object.entries(DEMO_NETWORK_BY_COMPANY).map(([company, data]) => ({
      company,
      application_count: 2,
      suggestion_count: data.suggestions.length,
    }));
    return Response.json({ companies });
  }

  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  try {
    const db = new DynamoDBWrapper();
    const applications = await listUserApplications(db, user.userId);

    const companyCounts = new Map<string, number>();
    for (const app of applications) {
      const company = String(app.company ?? '').trim();
      if (company) companyCounts.set(company, (companyCounts.get(company) ?? 0) + 1);
    }

    const persisted =
      (await db.query('NetworkSuggestions', {
        KeyConditionExpression: 'user_id = :u',
        ExpressionAttributeValues: { ':u': user.userId },
      })) ?? [];

    const suggestionCounts = new Map<string, number>();
    for (const row of persisted) {
      const company = String(row.company ?? '');
      const suggestions = Array.isArray(row.suggestions) ? row.suggestions : [];
      if (company) suggestionCounts.set(company, suggestions.length);
    }

    const companies = [...companyCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([company, application_count]) => ({
        company,
        application_count,
        suggestion_count: suggestionCounts.get(company) ?? 0,
      }));

    return Response.json({ companies });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return Response.json({ error: 'Error', message }, { status: 500 });
  }
}
