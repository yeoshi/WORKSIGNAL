/**
 * Network_Agent background flow (Task 18.2).
 *
 * Implements the `NetworkAgent` contract from the design document
 * (design.md → Network_Agent) and Requirement 20:
 *
 *   20.1  WHEN a User sends two or more applications to the same company, THE
 *         Network_Agent SHALL be triggered for that company.
 *   20.2  WHEN the Network_Agent is triggered for a company, THE Network_Agent
 *         SHALL search Exa for relevant people, alumni from the User's
 *         university, community members, and upcoming Singapore networking
 *         events.
 *   20.3  WHEN the Network_Agent produces connection suggestions, THE
 *         Network_Agent SHALL provide at most three suggestions and SHALL order
 *         them with alumni first, community members second, and cold contacts
 *         last.
 *   20.4  WHEN the Network_Agent produces a connection suggestion, THE
 *         Network_Agent SHALL include a personalised outreach draft for that
 *         connection.
 *
 * Design notes:
 *  - The trigger condition (Req 20.1) and the cap/ordering rule (Req 20.3) are
 *    *imported, not re-implemented*. `shouldTriggerNetworkAgent` /
 *    `countApplicationsByCompany` live in `./trigger.js`, and
 *    `capAndOrderSuggestions` lives in `./suggestions.js`. This module is the
 *    *integration* layer that wires that pure logic to DynamoDB reads, Exa
 *    research, and outreach-draft generation.
 *  - Every external dependency is **injectable**: the DynamoDB wrapper, the Exa
 *    search client, and an optional Bedrock drafting function. This keeps the
 *    flow unit-testable with no AWS / Exa / Bedrock calls.
 *  - Every Exa query is Singapore-scoped (the term `Singapore` is appended),
 *    matching the platform-wide research-scoping rule (Req 8.3) and the SG-event
 *    focus of Req 20.2.
 *  - External content (Exa results, model output) is treated as **untrusted
 *    input**: it is defensively parsed and only ever used as data.
 */

import {
  DynamoDBWrapper,
  createLogger,
  extractLinkedInRoleLine,
  type Application,
  type Logger,
  type NetworkAgent,
  type NetworkConnectionType,
  type NetworkSuggestion,
  type NetworkSuggestionSet,
  type NetworkingOpportunity,
  type UserConfig,
} from '@worksignal/shared';

import {
  countApplicationsByCompany,
  shouldTriggerNetworkAgent,
} from './trigger.js';
import { capAndOrderSuggestions } from './suggestions.js';

/* ------------------------------------------------------------------ *
 * Constants
 * ------------------------------------------------------------------ */

/** Default DynamoDB table names (design Data Models). Module-private to avoid
 * barrel-export collisions with other components that define the same names. */
const DEFAULT_USERS_TABLE = 'Users';
const DEFAULT_APPLICATIONS_TABLE = 'Applications';

/** GSI on `(user_id, company)` used to list a user's applications (infra). */
const APPLICATIONS_USER_INDEX = 'user_id-company-index';

/** Default number of results requested per Exa research query. */
const DEFAULT_NUM_RESULTS = 5;

/** Singapore scope term appended to every research query (Req 8.3, 20.2). */
const SINGAPORE_SCOPE = 'Singapore';

/**
 * Fixed system prompt used when an injectable Bedrock client drafts an outreach
 * message. Kept verbatim and small; the per-connection facts are supplied in
 * the user prompt.
 */
export const OUTREACH_DRAFT_SYSTEM_PROMPT =
  'You are a concise, warm networking assistant for an early-career job ' +
  'seeker in Singapore. Write a short, personalised LinkedIn-style outreach ' +
  'message (3-4 sentences) to the given connection about the target company. ' +
  'Be specific, professional, and never fabricate facts. Respond with ONLY ' +
  'the message text, no preamble or quotation marks.';

/* ------------------------------------------------------------------ *
 * Injectable Exa client surface
 * ------------------------------------------------------------------ */

/**
 * A single raw Exa search result. Treated as untrusted external input: every
 * field is optional and defensively handled.
 */
export interface RawNetworkResult {
  /** Person / event name or title. */
  name?: string;
  title?: string;
  /** Headline / role / context snippet. */
  text?: string | null;
  url?: string;
  /** ISO date, primarily for events. */
  publishedDate?: string | null;
  date?: string | null;
}

/** Parameters for a single Network_Agent Exa search request. */
export interface NetworkExaSearchParams {
  /** The Singapore-scoped query (already passes through {@link scopeQuery}). */
  query: string;
  numResults?: number;
}

/**
 * Injectable Exa search function. Given a Singapore-scoped query, resolves to
 * the raw results. Injected so the flow can be exercised deterministically with
 * no real Exa calls.
 */
export type NetworkExaSearch = (
  params: NetworkExaSearchParams,
) => Promise<RawNetworkResult[]>;

/**
 * Injectable Bedrock drafting function. Given a system + user prompt, resolves
 * to the raw model completion (the outreach message text). Optional: when not
 * supplied (or when it throws), a deterministic template is used instead
 * (Req 20.4).
 */
export type NetworkDraftBedrock = (request: {
  system: string;
  user: string;
}) => Promise<string>;

/* ------------------------------------------------------------------ *
 * Dependencies
 * ------------------------------------------------------------------ */

export interface NetworkAgentDeps {
  /** DynamoDB wrapper (injectable; defaults to a real client). */
  db?: DynamoDBWrapper;
  /** Exa search client (injectable). Required for real research. */
  exaSearch?: NetworkExaSearch;
  /**
   * Optional Bedrock client used to author personalised outreach drafts
   * (Req 20.4). When absent or failing, a deterministic template is used.
   */
  bedrock?: NetworkDraftBedrock;
  /**
   * Optional sink invoked with the produced {@link NetworkSuggestionSet} when
   * the trigger fires (Req 20.1). The design data model defines no Network
   * table, so persistence is delegated to the caller; defaults to a no-op
   * (the set is still logged).
   */
  persistSuggestions?: (
    userId: string,
    set: NetworkSuggestionSet,
  ) => Promise<void>;
  logger?: Logger;
  usersTable?: string;
  applicationsTable?: string;
  applicationsUserIndex?: string;
  /** Results requested per Exa query. Defaults to {@link DEFAULT_NUM_RESULTS}. */
  numResults?: number;
}

/* ------------------------------------------------------------------ *
 * Pure helpers (exported for unit tests)
 * ------------------------------------------------------------------ */

/**
 * Append the Singapore scope term to a query unless it is already present
 * (case-insensitive). Pure and total over any string (Req 8.3, 20.2).
 */
export function scopeQuery(query: string): string {
  const trimmed = query.trim();
  if (trimmed.toLowerCase().includes(SINGAPORE_SCOPE.toLowerCase())) {
    return trimmed;
  }
  return `${trimmed} ${SINGAPORE_SCOPE}`.trim();
}

/**
 * Build the Singapore-scoped Exa query for a given connection tier and company
 * (Req 20.2). Alumni queries also incorporate the user's university.
 */
export function buildTierQuery(
  tier: NetworkConnectionType,
  company: string,
  university: string | undefined,
): string {
  switch (tier) {
    case 'alumni': {
      const uni = university && university.trim().length > 0 ? university.trim() : '';
      return scopeQuery(
        `${uni} alumni working at ${company}`.replace(/\s+/g, ' ').trim(),
      );
    }
    case 'community':
      return scopeQuery(`${company} employees community professionals`);
    case 'cold':
      return scopeQuery(`${company} recruiters hiring managers team members`);
  }
}

/** Build the Singapore-scoped Exa query for upcoming networking events (Req 20.2). */
export function buildEventQuery(company: string): string {
  return scopeQuery(`${company} industry networking events meetups`);
}

/** Normalize a LinkedIn profile URL from an Exa result URL, when present. */
export function extractLinkedInProfileUrl(url?: string): string | undefined {
  if (!url?.trim()) return undefined;
  try {
    const parsed = new URL(url.trim());
    const host = parsed.hostname.replace(/^www\./, '');
    if (host !== 'linkedin.com' && !host.endsWith('.linkedin.com')) {
      return undefined;
    }
    const path = parsed.pathname.replace(/\/$/, '');
    if (!/\/in\/[^/]+/i.test(path) && !/\/pub\/[^/]+/i.test(path)) {
      return undefined;
    }
    return `https://www.linkedin.com${path}`;
  } catch {
    return undefined;
  }
}

function splitTitleSegments(title: string): string[] {
  if (!title.trim()) return [];
  const pipeParts = title.split(/\s*[|｜]\s*/).filter(Boolean);
  if (pipeParts.length > 1) return pipeParts;
  const dashParts = title.split(/\s+[-–—]\s+/).filter(Boolean);
  if (dashParts.length > 1 && dashParts[0]!.length <= 60) return dashParts;
  return [title.trim()];
}

/**
 * Map an untrusted Exa people-search result to display name, role context,
 * and an optional LinkedIn profile URL.
 */
export function parseExaContactFields(result: RawNetworkResult): {
  name: string;
  context: string;
  linkedin_url?: string;
} {
  const title = (result.name ?? result.title ?? '').trim();
  const text = (result.text ?? '').trim();
  const linkedin_url = extractLinkedInProfileUrl(result.url);

  const segments = splitTitleSegments(title);
  let name = segments[0]?.trim() ?? '';
  const roleFromTitle =
    segments.length > 1 ? segments.slice(1).join(' · ').trim() : '';

  if (!name) name = 'Unknown contact';
  if (name.length > 80) name = `${name.slice(0, 77)}…`;

  const roleLine =
    extractLinkedInRoleLine({ text, title }, name) ??
    (roleFromTitle.length > 0 ? roleFromTitle : null);

  let context: string;
  if (roleLine) {
    context = roleLine;
  } else if (linkedin_url) {
    context = 'LinkedIn profile';
  } else {
    context = 'No additional context available.';
  }

  return linkedin_url ? { name, context, linkedin_url } : { name, context };
}

/** Resolve a display name from an untrusted Exa event result. */
function resolveEventName(result: RawNetworkResult): string {
  const name = (result.name ?? result.title ?? '').trim();
  return name.length > 0 ? name : 'Networking event';
}

/**
 * Deterministic template outreach draft used when no Bedrock client is supplied
 * or drafting fails (Req 20.4). Always personalised with the connection's name,
 * tier, and the target company.
 */
export function templateOutreachDraft(
  candidate: { name: string; type: NetworkConnectionType; context: string },
  company: string,
  user: Pick<UserConfig, 'name'>,
): string {
  const tierIntro: Record<NetworkConnectionType, string> = {
    alumni: `As a fellow alum, I'd love to connect`,
    community: `I'm reaching out as someone exploring ${company}`,
    cold: `I hope you don't mind the cold message`,
  };
  return [
    `Hi ${candidate.name},`,
    `${tierIntro[candidate.type]} — I'm ${user.name}, currently looking into opportunities at ${company}.`,
    `Your background (${candidate.context}) really stood out to me, and I'd be grateful for any insight into the team and culture there.`,
    `Would you be open to a brief chat? Thank you for considering!`,
  ].join(' ');
}

/* ------------------------------------------------------------------ *
 * Network_Agent implementation
 * ------------------------------------------------------------------ */

/**
 * The ordered tiers searched for connection candidates (Req 20.2/20.3). The
 * final ordering and cap are enforced by the imported
 * {@link capAndOrderSuggestions}; this list only drives which queries run.
 */
const SEARCH_TIERS: readonly NetworkConnectionType[] = [
  'alumni',
  'community',
  'cold',
];

export class NetworkAgentImpl implements NetworkAgent {
  private readonly db: DynamoDBWrapper;
  private readonly exaSearch?: NetworkExaSearch;
  private readonly bedrock?: NetworkDraftBedrock;
  private readonly persistSuggestions?: (
    userId: string,
    set: NetworkSuggestionSet,
  ) => Promise<void>;
  private readonly logger: Logger;
  private readonly usersTable: string;
  private readonly applicationsTable: string;
  private readonly applicationsUserIndex: string;
  private readonly numResults: number;

  constructor(deps: NetworkAgentDeps = {}) {
    this.db = deps.db ?? new DynamoDBWrapper();
    this.exaSearch = deps.exaSearch;
    this.bedrock = deps.bedrock;
    this.persistSuggestions = deps.persistSuggestions;
    this.logger =
      deps.logger ?? createLogger({ context: { component: 'Network_Agent' } });
    this.usersTable = deps.usersTable ?? DEFAULT_USERS_TABLE;
    this.applicationsTable =
      deps.applicationsTable ?? DEFAULT_APPLICATIONS_TABLE;
    this.applicationsUserIndex =
      deps.applicationsUserIndex ?? APPLICATIONS_USER_INDEX;
    this.numResults = deps.numResults ?? DEFAULT_NUM_RESULTS;
  }

  /**
   * Evaluate the two-application trigger for a company and, when it fires,
   * build and surface networking suggestions (Req 20.1).
   *
   * Loads the user's applications, counts those addressed to `company` via the
   * imported {@link countApplicationsByCompany}, and gates on the imported
   * {@link shouldTriggerNetworkAgent}. Below the threshold this is a no-op; at
   * or above it, {@link buildSuggestions} runs and the result is handed to the
   * optional `persistSuggestions` sink.
   */
  async onCompanyInterest(userId: string, company: string): Promise<void> {
    const log = this.logger.child({ user_id: userId, company });
    const applications = await this.loadApplications(userId);
    const count = countApplicationsByCompany(applications, company);

    if (!shouldTriggerNetworkAgent(applications, company)) {
      log.info('Network_Agent not triggered (below threshold)', { count });
      return;
    }

    log.info('Network_Agent triggered for company', { count });
    const set = await this.buildSuggestions(userId, company);

    if (this.persistSuggestions) {
      await this.persistSuggestions(userId, set);
    }
    log.info('Network_Agent suggestions produced', {
      suggestions: set.suggestions.length,
      events: set.upcoming_events.length,
    });
  }

  /**
   * Build the networking suggestion set for a company (Req 20.2-20.4).
   *
   * Searches Exa per tier (alumni / community / cold) and for upcoming SG
   * events (Req 20.2), drafts a personalised outreach message for each
   * candidate (Req 20.4), then caps and orders the candidates via the imported
   * {@link capAndOrderSuggestions} so the result has at most three entries
   * ordered alumni → community → cold (Req 20.3).
   */
  async buildSuggestions(
    userId: string,
    company: string,
  ): Promise<NetworkSuggestionSet> {
    const user = await this.loadUser(userId);
    const university = user?.profile?.university;
    const drafterName = user?.name ?? 'a WORKSIGNAL user';

    // Discover candidates per tier (Req 20.2). Each tier's results are tagged
    // with that tier so the cap/ordering step can prioritise correctly.
    const tierResults = await Promise.all(
      SEARCH_TIERS.map(async (tier) => {
        const query = buildTierQuery(tier, company, university);
        const raws = await this.search(query);
        return { tier, raws };
      }),
    );

    const candidates: NetworkSuggestion[] = [];
    for (const { tier, raws } of tierResults) {
      for (const raw of raws) {
        const { name, context, linkedin_url } = parseExaContactFields(raw);
        const outreach_draft = await this.draftOutreach(
          { name, type: tier, context },
          company,
          { name: drafterName },
        );
        candidates.push({
          name,
          type: tier,
          context,
          outreach_draft,
          ...(linkedin_url ? { linkedin_url } : {}),
        });
      }
    }

    // Cap and order via the imported pure logic (Req 20.3).
    const suggestions = capAndOrderSuggestions(candidates);

    // Upcoming SG networking events (Req 20.2).
    const upcoming_events = await this.searchEvents(company);

    return { company, suggestions, upcoming_events };
  }

  /* ---------------------------------------------------------------- *
   * Internals
   * ---------------------------------------------------------------- */

  /** Load a user's applications via the `(user_id, company)` GSI (Req 20.1). */
  private async loadApplications(userId: string): Promise<Application[]> {
    try {
      const items = await this.db.query(this.applicationsTable, {
        IndexName: this.applicationsUserIndex,
        KeyConditionExpression: 'user_id = :u',
        ExpressionAttributeValues: { ':u': userId },
      });
      return items as unknown as Application[];
    } catch (error) {
      this.logger.warn('Failed to load applications for Network_Agent', {
        user_id: userId,
        error: String(error),
      });
      return [];
    }
  }

  /** Load the user record (for university + display name); tolerant of misses. */
  private async loadUser(userId: string): Promise<UserConfig | undefined> {
    try {
      const item = await this.db.get(this.usersTable, { user_id: userId });
      return item as unknown as UserConfig | undefined;
    } catch (error) {
      this.logger.warn('Failed to load user for Network_Agent', {
        user_id: userId,
        error: String(error),
      });
      return undefined;
    }
  }

  /** Run a single Exa query, tolerating an absent client or a query failure. */
  private async search(query: string): Promise<RawNetworkResult[]> {
    if (!this.exaSearch) {
      return [];
    }
    try {
      const results = await this.exaSearch({
        query,
        numResults: this.numResults,
      });
      return Array.isArray(results) ? results : [];
    } catch (error) {
      this.logger.warn('Exa query failed; skipping', {
        query,
        error: String(error),
      });
      return [];
    }
  }

  /** Search for upcoming SG networking events and map them (Req 20.2). */
  private async searchEvents(company: string): Promise<NetworkingOpportunity[]> {
    const raws = await this.search(buildEventQuery(company));
    return raws.map((raw) => ({
      name: resolveEventName(raw),
      date: (raw.date ?? raw.publishedDate ?? '').trim(),
      url: (raw.url ?? '').trim(),
      type: 'event' as const,
    }));
  }

  /**
   * Produce a personalised outreach draft for a candidate (Req 20.4).
   *
   * Uses the injected Bedrock client when available; on its absence or any
   * failure (or empty output) falls back to the deterministic template so a
   * draft is always present.
   */
  private async draftOutreach(
    candidate: { name: string; type: NetworkConnectionType; context: string },
    company: string,
    user: Pick<UserConfig, 'name'>,
  ): Promise<string> {
    if (this.bedrock) {
      try {
        const userPrompt = [
          `Target company: ${company}`,
          `Connection name: ${candidate.name}`,
          `Connection tier: ${candidate.type}`,
          `Connection context: ${candidate.context}`,
          `Sender name: ${user.name}`,
        ].join('\n');
        const raw = await this.bedrock({
          system: OUTREACH_DRAFT_SYSTEM_PROMPT,
          user: userPrompt,
        });
        const draft = (raw ?? '').trim();
        if (draft.length > 0) {
          return draft;
        }
      } catch (error) {
        this.logger.warn('Bedrock outreach drafting failed; using template', {
          connection: candidate.name,
          error: String(error),
        });
      }
    }
    return templateOutreachDraft(candidate, company, user);
  }
}

/** Convenience factory mirroring the {@link NetworkAgentImpl} constructor. */
export function createNetworkAgent(deps?: NetworkAgentDeps): NetworkAgentImpl {
  return new NetworkAgentImpl(deps);
}
