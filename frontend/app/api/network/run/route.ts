/**
 * GET /api/network/run — SSE stream for the Network Agent suggestion build.
 */

import { DynamoDBWrapper } from '@worksignal/shared';
import {
  createNetworkAgent,
  parseExaContactFields,
  type NetworkDraftBedrock,
  type RawNetworkResult,
} from '@worksignal/backend';
import { getAuthenticatedUser, unauthorizedResponse } from '../../lib/auth';
import { DEMO_MODE } from '../../lib/demo';
import { createSseResponse } from '../../lib/sse';
import { getAwsRegion } from '../../lib/awsRegion';
import { listUserApplications } from '../../lib/listUserApplications';
import { createBedrockClient, createBedrockInvoke, exaSearchRaw } from '../../lib/agentClients';
import { clearNetworkSuggestionsForUser } from '../../lib/clearAgentRunData';
import { normalizeNetworkResponse } from '../../../(app)/network/lib/fetchNetwork';

export const runtime = 'nodejs';
export const maxDuration = 300;

const COMPANY_CAP = 5;
const NETWORK_SUGGESTIONS_TABLE = 'NetworkSuggestions';

const TIER_LABEL: Record<string, string> = {
  alumni: 'High',
  community: 'Medium',
  cold: 'Lower',
};

type CompanyPayload = {
  company: string;
  application_count: number;
  suggestions: unknown[];
  upcoming_events: unknown[];
};

export type NetworkRunEvent =
  | { type: 'company_scan'; company: string; application_count: number }
  | { type: 'connection_search'; company: string; name: string; type: string; context: string }
  | { type: 'filtering'; company: string; kept: string[]; skipped: string[] }
  | { type: 'outreach_drafting'; company: string; name: string; draft_preview: string }
  | { type: 'complete'; companies: CompanyPayload[] }
  | { type: 'error'; message: string };

export async function GET() {
  if (DEMO_MODE) {
    return Response.json({ error: 'Not available in demo mode' }, { status: 400 });
  }

  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  return createSseResponse<NetworkRunEvent>((emit) =>
    runNetworkAgent(user.userId, emit),
  );
}

function inferTierFromQuery(query: string): string {
  const lower = query.toLowerCase();
  if (lower.includes('alumni')) return 'alumni';
  if (lower.includes('community')) return 'community';
  return 'cold';
}

async function runNetworkAgent(
  userId: string,
  emit: (event: NetworkRunEvent) => Promise<void>,
): Promise<void> {
  const db = new DynamoDBWrapper({ region: getAwsRegion() });
  const bedrock = createBedrockInvoke(createBedrockClient());

  await clearNetworkSuggestionsForUser(db, userId);

  const applications = await listUserApplications(db, userId);
  const companyCounts = new Map<string, number>();
  for (const app of applications) {
    const company = String(app.company ?? '').trim();
    if (company) companyCounts.set(company, (companyCounts.get(company) ?? 0) + 1);
  }

  const companies = [...companyCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, COMPANY_CAP);

  if (companies.length === 0) {
    await emit({ type: 'complete', companies: [] });
    return;
  }

  const completed: CompanyPayload[] = [];

  for (const [company, applicationCount] of companies) {
    await emit({ type: 'company_scan', company, application_count: applicationCount });

    const candidateNames: string[] = [];

    const bedrockDraft: NetworkDraftBedrock = async (req) => {
      const draft = await bedrock(req);
      const nameMatch = req.user.match(/Connection name: (.+)/);
      const name = nameMatch?.[1]?.trim() ?? 'contact';
      await emit({
        type: 'outreach_drafting',
        company,
        name,
        draft_preview: draft.slice(0, 120),
      });
      return draft;
    };

    const agent = createNetworkAgent({
      db,
      exaSearch: async ({ query, numResults }) => {
        const tier = inferTierFromQuery(query);
        const raws: RawNetworkResult[] = (
          await exaSearchRaw(query, numResults ?? 5, { includeText: true })
        ).map((r) => ({
          name: r.title,
          title: r.title,
          text: r.text,
          url: r.url,
          publishedDate: r.publishedDate,
        }));

        for (const raw of raws) {
          const { name, context } = parseExaContactFields(raw);
          candidateNames.push(name);
          await emit({
            type: 'connection_search',
            company,
            name,
            type: TIER_LABEL[tier] ?? tier,
            context,
          });
        }
        return raws;
      },
      bedrock: bedrockDraft,
    });

    const suggestionSet = await agent.buildSuggestions(userId, company);
    const keptNames = suggestionSet.suggestions.map((s) => s.name);
    const skipped = [...new Set(candidateNames.filter((n) => !keptNames.includes(n)))];

    await emit({
      type: 'filtering',
      company,
      kept: keptNames,
      skipped: skipped.slice(0, 10),
    });

    const companyPayload: CompanyPayload = {
      company: suggestionSet.company,
      application_count: applicationCount,
      suggestions: suggestionSet.suggestions,
      upcoming_events: suggestionSet.upcoming_events,
    };

    const normalized = normalizeNetworkResponse(companyPayload);
    if (!normalized) {
      throw new Error(`Network complete payload failed normalization for ${company}`);
    }

    await db.put(NETWORK_SUGGESTIONS_TABLE, {
      user_id: userId,
      company: suggestionSet.company,
      application_count: applicationCount,
      suggestions: suggestionSet.suggestions,
      upcoming_events: suggestionSet.upcoming_events,
      updated_at: new Date().toISOString(),
    });

    completed.push(companyPayload);
  }

  await emit({ type: 'complete', companies: completed });
}
