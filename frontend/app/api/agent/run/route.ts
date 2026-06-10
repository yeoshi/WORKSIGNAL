/**
 * GET /api/agent/run — Server-Sent Events stream of the full WorkSignal pipeline.
 *
 * Runs: MCF scan → pre-filter → 4-agent Bedrock debate → DynamoDB persist.
 * Each step emits a structured JSON event so the frontend can render the live
 * debate log in real-time including per-agent reasoning.
 *
 * SSE event format:  data: <JSON>\n\n
 * The stream closes when the pipeline completes or errors.
 */

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { DynamoDBWrapper } from '@worksignal/shared';
import { createOpportunityScanner, preFilter, runAmbitionAgent, runRealismAgent, runRiskAgent, runOpportunityAgent, persistAgentVerdicts, hasAnyValidVerdict, resolveEnriched, isInvalidVerdict } from '@worksignal/backend';
import { getAuthenticatedUser, unauthorizedResponse } from '../../lib/auth';
import { getApiBaseUrl, shouldProxyAgentRunToRemote } from '../../lib/apiGateway';
import { getAwsRegion } from '../../lib/awsRegion';
import { generateAndPersistJobMaterials, shouldGenerateJobMaterials } from '../../lib/jobMaterialsGeneration';
import { serializeUserProfileFromRecord } from '../../lib/serializeUserProfile';
import { DEMO_MODE } from '../../lib/demo';

const MCF_FETCH_TIMEOUT_MS = 45_000;

function fetchWithTimeout(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MCF_FETCH_TIMEOUT_MS);
  return fetch(url, { ...init, signal: controller.signal }).finally(() =>
    clearTimeout(timer),
  );
}

export const runtime = 'nodejs';
export const maxDuration = 300;

// ── SSE event shapes ────────────────────────────────────────────────────────

export type AgentName = 'ambition' | 'realism' | 'risk' | 'opportunity';

export type AgentRunEvent =
    | { type: 'start'; run_id: string; user_name: string }
    | { type: 'scan_start' }
    | { type: 'scan_complete'; count: number; jobs: Array<{ job_id: string; title: string; company: string; salary: string; days_old: number }> }
    | { type: 'prefilter_result'; job_id: string; title: string; company: string; pass: boolean; reasons: string[] }
    | { type: 'prefilter_summary'; survivors: number; rejected: number; total: number }
    | { type: 'all_filtered'; suggestion: string | null }
    | { type: 'debate_start'; job_index: number; total: number; job_id: string; title: string; company: string; salary: string }
    | { type: 'exa_research'; query: string }
    | { type: 'agent_result'; agent: AgentName; verdict: string; score: number; reasoning: string; key_argument: string; extra?: Record<string, unknown> }
    | { type: 'agent_failed'; agent: AgentName }
    | { type: 'db_persist'; step: 'verdicts' | 'master_decision'; job_id: string; title: string; verdict_id?: string; decision?: string; stored_agents?: string[] }
    | { type: 'debate_result'; job_id: string; title: string; company: string; decision: string; summary: string | null; verdict_id: string }
    | { type: 'materials_start'; job_id: string; title: string }
    | { type: 'materials_complete'; job_id: string; title: string }
    | { type: 'materials_failed'; job_id: string; title: string; message: string }
    | {
        type: 'orchestrator_reasoning';
        job_id: string;
        title: string;
        /** The deterministic decision class before enrichment (e.g. deadlock_escalate). */
        base_decision: string;
        /** Score snapshot for each agent: verdict/score string, e.g. "apply/72". */
        scores: { ambition: string; realism: string; risk: string; opportunity: string };
        /** The heuristic-resolved action. */
        action: 'apply' | 'upskill' | 'hold';
        confidence: number;
        deciding_factor: string;
        holistic_summary: string;
        apply_angle?: string;
        upskill_targets?: string[];
      }
    | { type: 'run_complete'; scanned: number; survivors: number; debated: number; elapsed_s: number; tally: Record<string, number> }
    | { type: 'error'; message: string };

// ── GET handler ─────────────────────────────────────────────────────────────

export async function GET(request: Request) {
    if (DEMO_MODE) {
        return Response.json({ error: 'Not available in demo mode' }, { status: 400 });
    }

    const user = await getAuthenticatedUser();
    if (!user) return unauthorizedResponse();

    if (shouldProxyAgentRunToRemote()) {
        try {
            const upstream = await fetch(`${getApiBaseUrl()}/agent/run`, {
                headers: {
                    cookie: request.headers.get('cookie') ?? '',
                    accept: 'text/event-stream',
                },
            });

            if (!upstream.ok || !upstream.body) {
                const text = await upstream.text().catch(() => '');
                return Response.json(
                    {
                        error: 'Error',
                        message:
                            text ||
                            `Agent API returned ${upstream.status}. Check NEXT_PUBLIC_API_URL and that /agent/run is deployed on API Gateway.`,
                    },
                    { status: upstream.status || 502 },
                );
            }

            return new Response(upstream.body, {
                status: upstream.status,
                headers: {
                    'Content-Type':
                        upstream.headers.get('content-type') ?? 'text/event-stream',
                    'Cache-Control': 'no-cache, no-transform',
                    Connection: 'keep-alive',
                    'X-Accel-Buffering': 'no',
                },
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Agent API unavailable';
            return Response.json(
                {
                    error: 'Error',
                    message: `${message}. Verify NEXT_PUBLIC_API_URL points to a live API Gateway endpoint.`,
                },
                { status: 502 },
            );
        }
    }

    const encoder = new TextEncoder();
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();

    const emit = async (event: AgentRunEvent) => {
        try {
            await writer.write(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
            // client disconnected — silently ignore
        }
    };

    // Run pipeline in background; stream stays open until it completes.
    runPipeline(user.userId, user.name ?? 'User', emit)
        .catch(async (err) => {
            const msg = err instanceof Error ? err.message : String(err);
            await emit({ type: 'error', message: msg });
        })
        .finally(() => writer.close());

    return new Response(readable, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        },
    });
}

// ── Pipeline ────────────────────────────────────────────────────────────────

async function runPipeline(
    userId: string,
    userName: string,
    emit: (e: AgentRunEvent) => Promise<void>,
): Promise<void> {
    const { randomUUID } = await import('node:crypto');
    const runId = randomUUID();

    await emit({ type: 'start', run_id: runId, user_name: userName });

    await emit({ type: 'scan_start' });
    const REGION = getAwsRegion();
    const MODEL_ID = process.env.BEDROCK_MODEL_ID ?? 'us.anthropic.claude-sonnet-4-6';
    const EXA_KEY = process.env.EXA_API_KEY ?? '';

    // ── Bedrock client ──────────────────────────────────────────────────────
    const bedrockClient = new BedrockRuntimeClient({
        region: REGION,
        credentials: process.env.AWS_ACCESS_KEY_ID ? {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
            sessionToken: process.env.AWS_SESSION_TOKEN,
        } : undefined,
    });

    const bedrock = async (req: { system: string; user: string }): Promise<string> => {
        const cmd = new InvokeModelCommand({
            modelId: MODEL_ID,
            contentType: 'application/json',
            accept: 'application/json',
            body: new TextEncoder().encode(JSON.stringify({
                anthropic_version: 'bedrock-2023-05-31',
                max_tokens: 2048,
                system: req.system,
                messages: [{ role: 'user', content: req.user }],
            })),
        });
        const res = await bedrockClient.send(cmd);
        const body = JSON.parse(new TextDecoder().decode(res.body)) as { content: Array<{ text: string }> };
        const text = body.content[0]?.text;
        if (text === undefined) throw new Error('Bedrock response missing content[0].text');
        return text;
    };

    // Exa client that emits research events
    const exa = async (query: string): Promise<Array<{ url: string; title?: string }>> => {
        if (!EXA_KEY) return [];
        await emit({ type: 'exa_research', query });
        try {
            const res = await fetch('https://api.exa.ai/search', {
                method: 'POST',
                headers: { 'content-type': 'application/json', accept: 'application/json', 'x-api-key': EXA_KEY },
                body: JSON.stringify({ query, numResults: 3, type: 'auto', contents: { text: false } }),
            });
            if (!res.ok) return [];
            const data = await res.json() as { results?: Array<{ url?: string; title?: string }> };
            return (data.results ?? []).map((r) => ({ url: r.url ?? '', title: r.title }));
        } catch {
            return [];
        }
    };

    const db = new DynamoDBWrapper({ region: REGION });

    const rawUser = await db.get('Users', { user_id: userId });
    if (!rawUser) {
        throw new Error('Your profile was not found. Finish onboarding, then try again.');
    }
    const userConfig = rawUser as unknown as Parameters<typeof preFilter>[1];
    const pipelineStartedAt = Date.now();
    const finishRun = async (
        scanned: number,
        survivors: number,
        debated: number,
        tally: Record<string, number>,
    ) => {
        await emit({
            type: 'run_complete',
            scanned,
            survivors,
            debated,
            elapsed_s: (Date.now() - pipelineStartedAt) / 1000,
            tally,
        });
    };

    // ── STEP 1: Scan ────────────────────────────────────────────────────────
    console.log(`[AgentRun] ─────────────────────────────────────────`);
    console.log(`[AgentRun] 🚀 Pipeline started — run_id: ${runId} | user: ${userName} (${userId})`);
    console.log(`[AgentRun] 🔍 Scanning MCF…`);
    const scanner = createOpportunityScanner({
        scanIntervalMs: 0,
        fetchFn: fetchWithTimeout,
    });
    const discovered = await scanner.scan(userId);

    const salaryStr = (min: number, max: number) => {
        if (!min && !max) return 'salary undisclosed';
        if (!min) return `up to $${max}`;
        if (!max) return `from $${min}`;
        return `$${min}–$${max}`;
    };

    await emit({
        type: 'scan_complete',
        count: discovered.length,
        jobs: discovered.map((j) => ({
            job_id: j.job_id,
            title: j.role_title,
            company: j.company,
            salary: salaryStr(j.salary_min, j.salary_max),
            days_old: j.mcf_listing_days,
        })),
    });

    if (discovered.length === 0) {
        await finishRun(0, 0, 0, {});
        return;
    }

    // ── STEP 2: Pre-filter ──────────────────────────────────────────────────
    type DiscoveredJob = (typeof discovered)[0];
    const survivors: DiscoveredJob[] = [];

    for (const job of discovered) {
        const result = preFilter(job, userConfig);
        const reasons = !result.pass ? (result.violated ?? []) : [];
        await emit({
            type: 'prefilter_result',
            job_id: job.job_id,
            title: job.role_title,
            company: job.company,
            pass: result.pass,
            reasons,
        });
        if (result.pass) survivors.push(job);
    }

    await emit({
        type: 'prefilter_summary',
        total: discovered.length,
        survivors: survivors.length,
        rejected: discovered.length - survivors.length,
    });

    if (survivors.length === 0) {
        await emit({ type: 'all_filtered', suggestion: null });
        await finishRun(discovered.length, 0, 0, {});
        return;
    }

    // ── STEP 3: Debate ──────────────────────────────────────────────────────
    const tally: Record<string, number> = {};

    for (let idx = 0; idx < survivors.length; idx++) {
        const job = survivors[idx]!;

        await emit({
            type: 'debate_start',
            job_index: idx + 1,
            total: survivors.length,
            job_id: job.job_id,
            title: job.role_title,
            company: job.company,
            salary: salaryStr(job.salary_min, job.salary_max),
        });

        // Run 4 agents in parallel — each emits its own event on completion.
        const [ambition, realism, risk, opportunity] = await Promise.all([
            runAmbitionAgent(job, userConfig, bedrock).then(async (r) => {
                if (!isInvalidVerdict(r)) {
                    const v = r as { verdict: string; ambition_score: number; reasoning: string; key_argument: string };
                    await emit({ type: 'agent_result', agent: 'ambition', verdict: v.verdict, score: v.ambition_score, reasoning: v.reasoning, key_argument: v.key_argument });
                } else {
                    await emit({ type: 'agent_failed', agent: 'ambition' });
                }
                return r;
            }),
            runRealismAgent(job, userConfig, bedrock).then(async (r) => {
                if (!isInvalidVerdict(r)) {
                    const v = r as { verdict: string; match_score: number; reasoning: string; key_argument: string; key_gaps: string[]; work_life_flags: string[] };
                    await emit({ type: 'agent_result', agent: 'realism', verdict: v.verdict, score: v.match_score, reasoning: v.reasoning, key_argument: v.key_argument, extra: { gaps: v.key_gaps, wlb_flags: v.work_life_flags } });
                } else {
                    await emit({ type: 'agent_failed', agent: 'realism' });
                }
                return r;
            }),
            runRiskAgent(job, userConfig, bedrock, exa).then(async (r) => {
                if (!isInvalidVerdict(r)) {
                    const v = r as { verdict: string; risk_score: number; reasoning: string; key_argument: string; red_flags: Array<{ flag: string; severity: string; source?: string }>; glassdoor_score: number | null };
                    await emit({ type: 'agent_result', agent: 'risk', verdict: v.verdict, score: v.risk_score, reasoning: v.reasoning, key_argument: v.key_argument, extra: { red_flags: v.red_flags, glassdoor_score: v.glassdoor_score } });
                } else {
                    await emit({ type: 'agent_failed', agent: 'risk' });
                }
                return r;
            }),
            runOpportunityAgent(job, userConfig, bedrock).then(async (r) => {
                if (!isInvalidVerdict(r)) {
                    const v = r as { verdict: string; urgency_score: number; reasoning: string; key_argument: string; timing_factors: string[] };
                    await emit({ type: 'agent_result', agent: 'opportunity', verdict: v.verdict, score: v.urgency_score, reasoning: v.reasoning, key_argument: v.key_argument, extra: { timing_factors: v.timing_factors } });
                } else {
                    await emit({ type: 'agent_failed', agent: 'opportunity' });
                }
                return r;
            }),
        ]);

        // ── Persist 4 verdicts → DynamoDB AgentVerdicts ────────────────────
        console.log(`[AgentRun] ⏳ Persisting verdicts: "${job.role_title}" @ ${job.company} (${job.job_id})`);
        await emit({ type: 'db_persist', step: 'verdicts', job_id: job.job_id, title: job.role_title });

        const persistResult = await persistAgentVerdicts(
            {
                job_id: job.job_id,
                user_id: userId,
                outputs: { ambition, realism, risk, opportunity },
            },
            { db },
        );

        const storedAgents = (Object.keys(persistResult.verdicts) as string[]);
        console.log(`[AgentRun] ✓ AgentVerdicts written — verdict_id: ${persistResult.verdict_id} | agents: [${storedAgents.join(', ')}]${persistResult.agent_failures.length > 0 ? ` | failures: [${persistResult.agent_failures.join(', ')}]` : ''}`);

        // ── Resolve master decision (enriched) + update same record ───────
        const verdictSet = persistResult.verdicts;

        if (!hasAnyValidVerdict(verdictSet)) {
            console.log(`[AgentRun] ⚠ No master decision (no valid verdicts for ${job.job_id})`);
            tally['no_decision'] = (tally['no_decision'] ?? 0) + 1;
            await emit({ type: 'debate_result', job_id: job.job_id, title: job.role_title, company: job.company, decision: 'no_decision', summary: null, verdict_id: persistResult.verdict_id });
            continue;
        }

        const enriched = await resolveEnriched({ verdicts: verdictSet, user: userConfig, job, bedrock });
        const decision = enriched;
        const dec = decision.decision ?? 'no_decision';

        // Emit orchestrator reasoning event when the reasoning pass fired
        if (enriched.orchestrator_verdict) {
            const ov = enriched.orchestrator_verdict;
            const scores = {
                ambition:    verdictSet.ambition    ? `${verdictSet.ambition.verdict}/${verdictSet.ambition.ambition_score}`       : 'missing',
                realism:     verdictSet.realism     ? `${verdictSet.realism.verdict}/${verdictSet.realism.match_score}`            : 'missing',
                risk:        verdictSet.risk        ? `${verdictSet.risk.verdict}/${verdictSet.risk.risk_score}`                   : 'missing',
                opportunity: verdictSet.opportunity ? `${verdictSet.opportunity.verdict}/${verdictSet.opportunity.urgency_score}`  : 'missing',
            };
            await emit({
                type: 'orchestrator_reasoning',
                job_id: job.job_id,
                title: job.role_title,
                base_decision: dec,
                scores,
                action: ov.action,
                confidence: ov.confidence,
                deciding_factor: ov.deciding_factor,
                holistic_summary: ov.holistic_summary,
                ...(ov.apply_angle && { apply_angle: ov.apply_angle }),
                ...(ov.upskill_targets && { upskill_targets: ov.upskill_targets }),
            });
        }

        console.log(`[AgentRun] ⏳ Writing master_decision: "${dec}" → verdict_id: ${persistResult.verdict_id}`);
        await emit({ type: 'db_persist', step: 'master_decision', job_id: job.job_id, title: job.role_title, verdict_id: persistResult.verdict_id, decision: dec, stored_agents: storedAgents });

        await db.update(
            'AgentVerdicts',
            { verdict_id: persistResult.verdict_id },
            {
                UpdateExpression: 'SET master_decision = :md',
                ExpressionAttributeValues: { ':md': decision },
            },
        );
        console.log(`[AgentRun] ✓ master_decision persisted → DynamoDB AgentVerdicts`);

        if (shouldGenerateJobMaterials(dec)) {
            console.log(`[AgentRun] ⏳ Generating application materials for ${job.job_id}`);
            await emit({ type: 'materials_start', job_id: job.job_id, title: job.role_title });
            try {
                const userProfile = serializeUserProfileFromRecord(rawUser as Record<string, unknown>);
                await generateAndPersistJobMaterials({
                    userId,
                    jobId: job.job_id,
                    verdictId: persistResult.verdict_id,
                    job: job as unknown as Record<string, unknown>,
                    decision: decision as unknown as Record<string, unknown>,
                    userProfile,
                });
                console.log(`[AgentRun] ✓ Application materials saved for ${job.job_id}`);
                await emit({ type: 'materials_complete', job_id: job.job_id, title: job.role_title });
            } catch (materialsError) {
                const msg = materialsError instanceof Error ? materialsError.message : 'Materials generation failed';
                console.warn(`[AgentRun] ⚠ Materials generation failed for ${job.job_id}:`, msg);
                await emit({ type: 'materials_failed', job_id: job.job_id, title: job.role_title, message: msg });
            }
        }

        tally[dec] = (tally[dec] ?? 0) + 1;

        await emit({
            type: 'debate_result',
            job_id: job.job_id,
            title: job.role_title,
            company: job.company,
            decision: dec,
            summary: decision?.summary ?? null,
            verdict_id: persistResult.verdict_id,
        });
    }

    console.log(`[AgentRun] ✅ Pipeline complete | scanned: ${discovered.length} | debated: ${survivors.length} | tally: ${JSON.stringify(tally)}`);
    console.log(`[AgentRun] ─────────────────────────────────────────`);

    await finishRun(discovered.length, survivors.length, survivors.length, tally);
}
