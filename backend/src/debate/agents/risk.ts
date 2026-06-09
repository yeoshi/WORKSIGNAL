/**
 * Risk_Agent (Task 13.1, Req 10.4, 22.2).
 *
 * Protects the user from companies with red flags. Researches the company via
 * an injectable {@link ExaClient} (financial health, layoffs, Glassdoor,
 * culture, and — for `need_sponsorship` users — EP sponsorship history), then
 * runs a Bedrock task with a **fixed system prompt** (verbatim from PRD §6.3)
 * and a strict JSON output contract validated into a {@link RiskVerdict}
 * carrying `red_flags` with sources and a `glassdoor_score`.
 *
 * Empty-research guard (Req 22.2): IF every Exa research query returns no
 * results, THE Risk_Agent produces a Verdict noting insufficient data with a
 * `caution` verdict value — WITHOUT invoking Bedrock, since there is nothing to
 * reason over. A `caution` verdict counts as a dissent in the Master decision
 * tree, so the absence of research data conservatively reduces the chance of an
 * apply consensus.
 */

import type {
  InvalidVerdict,
  Job,
  RiskVerdict,
  UserConfig,
} from '@worksignal/shared';
import { buildSingaporeScopedQuery } from '../../discovery/exaQuery.js';
import { isInvalidVerdict } from '../verdictValidator.js';
import {
  formatJob,
  formatUser,
  invokeAndValidate,
  needsSponsorship,
  STRICT_JSON_TRAILER,
  type AgentInvocationOptions,
  type BedrockInvoke,
  type ExaClient,
  type ExaResult,
} from './shared.js';

/**
 * The Risk_Agent's fixed system prompt (verbatim from PRD §6.3). The actual Exa
 * research is performed by this module and supplied to the model as data in the
 * user prompt; the model reasons over that research to produce the verdict.
 */
export const RISK_SYSTEM_PROMPT = `You are the Risk Agent in WORKSIGNAL.

Your mandate: protect the user from companies with red flags.
Your bias: skeptical. Assume there's a reason every role is open.

Use Exa to research:
1. Company financial health (funding, profitability, news)
2. Recent layoffs/hiring freezes ("[company] layoffs 2025 2026 Singapore")
3. Glassdoor reputation and work-life balance score ("[company] glassdoor reviews")
4. Workplace culture issues ("[company] workplace culture")
5. Contract role disguised as permanent signals
6. If user needs work pass: "[company] employment pass sponsorship Singapore"

If Risk score > 70 (high risk): verdict = "avoid" which triggers Master veto override.

Output JSON:
{
  "verdict": "safe" | "caution" | "avoid",
  "risk_score": 0-100,
  "red_flags": [{"flag": "string", "source": "Exa URL", "severity": "high|medium|low"}],
  "glassdoor_score": number or null,
  "reasoning": "2-3 sentences",
  "key_argument": "one-line for the debate summary"
}`;

/**
 * Build the Singapore-scoped Exa research queries for a company (Req 8.3,
 * 10.4). Mirrors the research dimensions in the system prompt; the EP
 * sponsorship query is added only for `need_sponsorship` users.
 */
export function buildRiskResearchQueries(job: Job, user: UserConfig): string[] {
  const company = job.company;
  const queries = [
    `${company} financial health funding profitability news`,
    `${company} layoffs 2025 2026`,
    `${company} glassdoor reviews work life balance`,
    `${company} workplace culture`,
  ];
  if (needsSponsorship(user)) {
    queries.push(`${company} employment pass sponsorship`);
  }
  // Every Exa research query is Singapore-scoped (Req 8.3).
  return queries.map((q) => buildSingaporeScopedQuery(q));
}

/** Render aggregated Exa research results into a prompt-friendly digest. */
function formatResearch(results: ExaResult[]): string {
  const lines = results.map((r, i) => {
    const parts = [`[${i + 1}] ${r.title ?? '(untitled)'} — ${r.url}`];
    if (r.publishedDate) {
      parts.push(`    published: ${r.publishedDate}`);
    }
    if (r.text) {
      parts.push(`    ${r.text}`);
    }
    return parts.join('\n');
  });
  return ['EXA RESEARCH RESULTS:', ...lines].join('\n');
}

/**
 * Construct the insufficient-data {@link RiskVerdict} returned when Exa research
 * yields no results (Req 22.2). Well-formed by construction: `caution` verdict,
 * no red flags, null Glassdoor score, and reasoning noting the data gap.
 */
export function buildInsufficientDataVerdict(job: Job): RiskVerdict {
  return {
    verdict: 'caution',
    risk_score: 50,
    red_flags: [],
    glassdoor_score: null,
    reasoning:
      `Exa research returned no results for ${job.company}, so company financial health, ` +
      'layoffs, Glassdoor sentiment, culture, and sponsorship history could not be assessed. ' +
      'Insufficient data to clear this company.',
    key_argument: `Insufficient research data on ${job.company} — proceed with caution.`,
  };
}

/** Build the Risk_Agent's per-job user prompt incorporating the Exa research. */
export function buildRiskPrompt(
  job: Job,
  user: UserConfig,
  results: ExaResult[],
): string {
  const sponsorshipNote = needsSponsorship(user)
    ? 'This user requires Employment Pass sponsorship — weigh the company\'s EP sponsorship track record.'
    : '';
  return [
    formatUser(user),
    '',
    formatJob(job),
    '',
    formatResearch(results),
    '',
    'Base your red_flags strictly on the research above; cite the result URL as each flag\'s source.',
    sponsorshipNote,
    'Evaluate company risk for the user per your mandate and output contract.',
    STRICT_JSON_TRAILER,
  ]
    .filter((line) => line !== '')
    .join('\n');
}

/**
 * Run the Risk_Agent for a job (Req 10.4, 22.2).
 *
 * Performs Singapore-scoped Exa research on the company, then:
 *  - if **no** results are returned across all queries, returns the
 *    insufficient-data `caution` verdict WITHOUT invoking Bedrock (Req 22.2);
 *  - otherwise builds the user prompt with the research, invokes Bedrock through
 *    the bounded-retry wrapper (Req 22.1), and validates the strict-JSON output
 *    into a {@link RiskVerdict}. Returns an {@link InvalidVerdict} on
 *    non-conforming output (Req 11.3).
 *
 * @param job - The pre-filtered job under debate.
 * @param user - The user's latest configuration (source of truth, Req 5.5).
 * @param bedrock - Injectable Bedrock invocation (stubbed in tests).
 * @param exa - Injectable Exa research client (stubbed in tests).
 * @param options - Bounded-retry knobs and optional logger.
 */
export async function runRiskAgent(
  job: Job,
  user: UserConfig,
  bedrock: BedrockInvoke,
  exa: ExaClient,
  options: AgentInvocationOptions = {},
): Promise<RiskVerdict | InvalidVerdict> {
  const queries = buildRiskResearchQueries(job, user);

  // Aggregate research across every query; queries that error are treated as
  // returning no results so a single failing query never aborts the debate.
  const settled = await Promise.all(
    queries.map(async (q) => {
      try {
        return await exa(q);
      } catch {
        return [] as ExaResult[];
      }
    }),
  );
  const results = settled.flat();

  // Empty-research guard (Req 22.2): note insufficient data and return caution.
  if (results.length === 0) {
    options.logger?.warn('debate.risk.insufficient_exa_results', {
      job_id: job.job_id,
      company: job.company,
    });
    return buildInsufficientDataVerdict(job);
  }

  const prompt = buildRiskPrompt(job, user, results);
  const result = await invokeAndValidate(
    'risk',
    RISK_SYSTEM_PROMPT,
    prompt,
    bedrock,
    options,
  );
  if (isInvalidVerdict(result)) {
    return result;
  }
  return result as RiskVerdict;
}
