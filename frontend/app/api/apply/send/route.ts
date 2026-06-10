/**
 * POST /api/apply/send — Send a cover-letter application email.
 *
 * Sends via Gmail API using the user's OAuth access token (requires gmail.send scope).
 * Falls back to a mailto: link when the token is missing or lacks the send scope
 * so the user can complete the send from their email client without losing their
 * drafted cover letter.
 *
 * On success, creates an Application record in DynamoDB.
 */

import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/authOptions';
import { getAuthenticatedUser, unauthorizedResponse } from '../../lib/auth';
import { randomUUID } from 'node:crypto';

interface SendBody {
    job_id: string;
    cover_letter: string;
}

/** Build a minimal RFC 2822 message string for Gmail API. */
function buildRFC2822(
    fromEmail: string,
    fromName: string,
    toEmail: string,
    subject: string,
    body: string,
): string {
    return [
        `From: ${fromName} <${fromEmail}>`,
        `To: ${toEmail}`,
        `Subject: ${subject}`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        '',
        body,
    ].join('\r\n');
}

/** base64url encode — Gmail API requires base64url not standard base64. */
function toBase64Url(str: string): string {
    return Buffer.from(str).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function POST(request: Request) {
    const user = await getAuthenticatedUser();
    if (!user) return unauthorizedResponse();

    let body: SendBody;
    try {
        body = await request.json() as SendBody;
    } catch {
        return Response.json({ error: 'Invalid request body' }, { status: 400 });
    }
    const { job_id, cover_letter } = body;
    if (!job_id || !cover_letter) {
        return Response.json({ error: 'job_id and cover_letter required' }, { status: 400 });
    }

    try {
        const { DynamoDBWrapper } = await import('@worksignal/shared');
        const db = new DynamoDBWrapper();

        const job = await db.get('Jobs', { job_id });
        if (!job) return Response.json({ error: 'Job not found' }, { status: 404 });

        const employerEmail = (job.employer_email as string | null) ?? null;
        const subject = `Application for ${job.role_title as string} at ${job.company as string}`;

        // ── No employer email → return source URL for manual apply ──────────
        if (!employerEmail) {
            return Response.json({
                sent: false,
                fallback: 'no_email',
                source_url: (job.source_url as string | null) ?? null,
            });
        }

        // ── Get Gmail access token from session ──────────────────────────────
        const session = await getServerSession(authOptions);
        const accessToken = (session?.user as { accessToken?: string } | undefined)?.accessToken;

        if (!accessToken) {
            const mailto = `mailto:${employerEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(cover_letter)}`;
            return Response.json({ sent: false, fallback: 'needs_auth', mailto });
        }

        // ── Send via Gmail API ───────────────────────────────────────────────
        const fromEmail = user.email ?? session?.user?.email ?? '';
        const fromName = user.name ?? session?.user?.name ?? '';
        const rfc = buildRFC2822(fromEmail, fromName, employerEmail, subject, cover_letter);
        const raw = toBase64Url(rfc);

        const gmailRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ raw }),
        });

        if (!gmailRes.ok) {
            const errData = await gmailRes.json() as { error?: { message?: string } };
            console.warn('[apply/send] Gmail API error:', gmailRes.status, errData);

            if (gmailRes.status === 401 || gmailRes.status === 403) {
                // Token expired or missing gmail.send scope — offer mailto fallback.
                const mailto = `mailto:${employerEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(cover_letter)}`;
                return Response.json({ sent: false, fallback: 'token_expired', mailto });
            }
            return Response.json(
                { sent: false, error: errData.error?.message ?? 'Gmail send failed' },
                { status: 500 },
            );
        }

        const gmailData = await gmailRes.json() as { id?: string; threadId?: string };
        console.log(`[apply/send] ✓ Email sent — messageId: ${gmailData.id ?? 'unknown'} → ${employerEmail}`);

        // ── Persist Application record ───────────────────────────────────────
        // Look up verdict_id if available (best-effort — don't fail the send).
        let verdictId: string | null = null;
        try {
            const verdicts = await db.query('AgentVerdicts', {
                IndexName: 'job_id-user_id-index',
                KeyConditionExpression: 'job_id = :j AND user_id = :u',
                ExpressionAttributeValues: { ':j': job_id, ':u': user.userId },
                Limit: 1,
            });
            verdictId = (verdicts[0] as { verdict_id?: string } | undefined)?.verdict_id ?? null;
        } catch { /* non-critical */ }

        const now = new Date().toISOString();
        const applicationId = randomUUID();

        try {
            await db.put('Applications', {
                application_id: applicationId,
                user_id: user.userId,
                job_id,
                verdict_id: verdictId ?? `manual-${applicationId}`,
                company: job.company,
                role_title: job.role_title,
                customised_resume_s3_key: '',
                customisation_applied: false,
                cover_letter_text: cover_letter,
                sent_at: now,
                recipient_email: employerEmail,
                email_thread_id: gmailData.threadId ?? null,
                status: 'sent',
                redirect_source_url: null,
                redirected_at: null,
                status_updated_at: now,
                classification_confidence: 0,
            });
            console.log(`[apply/send] ✓ Application record created — application_id: ${applicationId}`);
        } catch (dbErr) {
            console.warn('[apply/send] Failed to persist Application record:', dbErr);
            // Don't fail the response — email was already sent.
        }

        return Response.json({
            sent: true,
            application_id: applicationId,
            thread_id: gmailData.threadId ?? null,
            recipient: employerEmail,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal server error';
        console.error('[apply/send] Unexpected error:', err);
        return Response.json({ error: message }, { status: 500 });
    }
}
