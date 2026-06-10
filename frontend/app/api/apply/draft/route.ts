/**
 * POST /api/apply/draft — Generate a tailored cover letter for a job.
 *
 * Uses Bedrock to write a cover letter informed by:
 *  - The candidate's profile (current role, skills, experience)
 *  - The job description
 *  - The agent debate verdicts (what each agent found compelling or concerning)
 *
 * The agent-verdict context is unique to WorkSignal — the cover letter is literally
 * written to highlight the same strengths the AI debate identified as your edge.
 */

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { getAuthenticatedUser, unauthorizedResponse } from '../../lib/auth';

const EMOJI: Record<string, string> = {
    ambition: '🚀',
    realism: '🎯',
    risk: '🛡',
    opportunity: '⚡',
};

function buildPrompt(
    job: Record<string, unknown>,
    user: Record<string, unknown>,
    agentVerdict: Record<string, unknown> | undefined,
): string {
    const profile = (user.profile ?? {}) as Record<string, unknown>;
    const skills = (profile.skills as string[] | undefined) ?? [];
    const jdSnippet = ((job.jd_text as string | undefined) ?? '').slice(0, 800);

    const lines: string[] = [
        'You are an expert cover-letter writer assisting a job seeker.',
        'Write a concise, compelling, 3-paragraph cover letter for the job below.',
        'Return ONLY the cover letter text — no subject line, no preamble, no markdown fences.',
        '',
        `CANDIDATE: ${user.name ?? 'Candidate'}`,
        `CURRENT ROLE: ${(profile.current_role as string | undefined) ?? 'Professional'}`,
        `YEARS OF EXPERIENCE: ${(profile.years_experience as number | undefined) ?? 0}`,
        `SKILLS: ${skills.join(', ') || 'Not specified'}`,
        `EDUCATION: ${(profile.education as string | undefined) ?? ''} (${(profile.university as string | undefined) ?? ''})`,
        '',
        `TARGET JOB: ${job.role_title as string} at ${job.company as string}`,
        'JOB DESCRIPTION (excerpt):',
        jdSnippet,
    ];

    // Inject agent debate context if available — this is the unique WorkSignal angle.
    if (agentVerdict) {
        const verdicts = agentVerdict.verdicts as Record<string, Record<string, unknown>> | undefined;
        if (verdicts) {
            lines.push('', 'AI AGENT DEBATE RESULTS (use these to highlight the right strengths):');
            for (const [agent, v] of Object.entries(verdicts)) {
                const icon = EMOJI[agent] ?? '•';
                const verdict = v.verdict as string | undefined;
                const score = (v.ambition_score ?? v.match_score ?? v.risk_score ?? v.urgency_score) as number | undefined;
                const keyArg = v.key_argument as string | undefined;
                if (verdict && keyArg) {
                    lines.push(`${icon} ${agent}: ${verdict}${score !== undefined ? ` (${score}/100)` : ''} — "${keyArg}"`);
                }
            }
        }
        const md = agentVerdict.master_decision as Record<string, unknown> | undefined;
        if (md?.summary && (md.summary as string).length > 10) {
            lines.push('', `OVERALL VERDICT: ${md.summary as string}`);
        }
    }

    lines.push(
        '',
        'Write a 3-paragraph cover letter:',
        '1. Open with genuine enthusiasm for this specific role and company.',
        '2. Connect 2-3 of the candidate\'s key strengths directly to the job requirements — use the agent debate insights above to pick the most relevant ones.',
        '3. Close warmly with availability and a call to action.',
    );

    if ((user.residency_status as string | undefined) === 'need_sponsorship') {
        lines.push(
            '',
            'IMPORTANT: The candidate requires Employment Pass (EP) sponsorship to work in Singapore.',
            'State this clearly and positively within the letter.',
        );
    }

    return lines.join('\n');
}

function fallbackLetter(job: Record<string, unknown>, user: Record<string, unknown>): string {
    const profile = (user.profile ?? {}) as Record<string, unknown>;
    return [
        `Dear ${job.company as string} Hiring Team,`,
        '',
        `I am writing to express my strong interest in the ${job.role_title as string} role at ${job.company as string}.`,
        `With my background as ${(profile.current_role as string | undefined) ?? 'a professional'}, I am confident I can contribute meaningfully to your team.`,
        '',
        'I would welcome the opportunity to discuss how my experience aligns with your needs.',
        '',
        'Best regards,',
        (user.name as string | undefined) ?? 'Candidate',
    ].join('\n');
}

export async function POST(request: Request) {
    const user = await getAuthenticatedUser();
    if (!user) return unauthorizedResponse();

    let jobId: string;
    try {
        const body = await request.json() as { job_id?: string };
        jobId = body.job_id ?? '';
    } catch {
        return Response.json({ error: 'Invalid request body' }, { status: 400 });
    }
    if (!jobId) return Response.json({ error: 'job_id required' }, { status: 400 });

    try {
        const { DynamoDBWrapper } = await import('@worksignal/shared');
        const db = new DynamoDBWrapper();

        const [job, userRecord] = await Promise.all([
            db.get('Jobs', { job_id: jobId }),
            db.get('Users', { user_id: user.userId }),
        ]);

        if (!job) return Response.json({ error: 'Job not found' }, { status: 404 });
        if (!userRecord) return Response.json({ error: 'User not found' }, { status: 404 });

        // Fetch agent debate verdicts for context-aware cover letter generation.
        const verdicts = await db.query('AgentVerdicts', {
            IndexName: 'job_id-user_id-index',
            KeyConditionExpression: 'job_id = :j AND user_id = :u',
            ExpressionAttributeValues: { ':j': jobId, ':u': user.userId },
            Limit: 1,
        });
        const agentVerdict = verdicts[0] as Record<string, unknown> | undefined;

        const storedLetter =
            typeof agentVerdict?.cover_letter_text === 'string'
                ? agentVerdict.cover_letter_text.trim()
                : '';
        if (storedLetter) {
            return Response.json({
                cover_letter: storedLetter,
                job: {
                    title: job.role_title,
                    company: job.company,
                    employer_email: job.employer_email ?? null,
                    source_url: job.source_url ?? null,
                },
                has_employer_email: !!job.employer_email,
            });
        }

        const REGION = process.env.AWS_DEFAULT_REGION ?? 'us-east-1';
        const MODEL_ID = process.env.BEDROCK_MODEL_ID ?? 'us.anthropic.claude-sonnet-4-6';

        const bedrockClient = new BedrockRuntimeClient({
            region: REGION,
            credentials: process.env.AWS_ACCESS_KEY_ID ? {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
                sessionToken: process.env.AWS_SESSION_TOKEN,
            } : undefined,
        });

        const prompt = buildPrompt(
            job as Record<string, unknown>,
            userRecord as Record<string, unknown>,
            agentVerdict,
        );

        let coverLetter: string;
        try {
            const cmd = new InvokeModelCommand({
                modelId: MODEL_ID,
                contentType: 'application/json',
                accept: 'application/json',
                body: new TextEncoder().encode(JSON.stringify({
                    anthropic_version: 'bedrock-2023-05-31',
                    max_tokens: 1024,
                    messages: [{ role: 'user', content: prompt }],
                })),
            });
            const res = await bedrockClient.send(cmd);
            const parsed = JSON.parse(new TextDecoder().decode(res.body)) as { content: Array<{ text: string }> };
            coverLetter = parsed.content[0]?.text?.trim() ?? '';
            if (!coverLetter) throw new Error('Empty Bedrock response');
        } catch (err) {
            console.warn('[apply/draft] Bedrock generation failed, using fallback:', err);
            coverLetter = fallbackLetter(job as Record<string, unknown>, userRecord as Record<string, unknown>);
        }

        return Response.json({
            cover_letter: coverLetter,
            job: {
                title: job.role_title,
                company: job.company,
                employer_email: job.employer_email ?? null,
                source_url: job.source_url ?? null,
            },
            has_employer_email: !!job.employer_email,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal server error';
        return Response.json({ error: message }, { status: 500 });
    }
}
