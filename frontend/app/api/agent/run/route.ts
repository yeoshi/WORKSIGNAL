/**
 * GET /api/agent/run — Server-Sent Events stream of the full WorkSignal pipeline.
 *
 * Proxies to the AWS API Gateway backend; the frontend does not run agent logic.
 */

import { getAuthenticatedUser, unauthorizedResponse } from '../../lib/auth';
import { getApiBaseUrl } from '../../lib/apiGateway';
import { DEMO_MODE } from '../../lib/demo';

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
        base_decision: string;
        scores: { ambition: string; realism: string; risk: string; opportunity: string };
        action: 'apply' | 'upskill' | 'hold';
        confidence: number;
        deciding_factor: string;
        holistic_summary: string;
        apply_angle?: string;
        upskill_targets?: string[];
      }
    | { type: 'run_complete'; scanned: number; survivors: number; debated: number; elapsed_s: number; tally: Record<string, number> }
    | { type: 'error'; message: string };

export async function GET(request: Request) {
    if (DEMO_MODE) {
        return Response.json({ error: 'Not available in demo mode' }, { status: 400 });
    }

    const user = await getAuthenticatedUser();
    if (!user) return unauthorizedResponse();

    const upstream = await fetch(`${getApiBaseUrl()}/agent/run`, {
        headers: {
            cookie: request.headers.get('cookie') ?? '',
            accept: 'text/event-stream',
        },
    });

    return new Response(upstream.body, {
        status: upstream.status,
        headers: {
            'Content-Type': upstream.headers.get('content-type') ?? 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
        },
    });
}
