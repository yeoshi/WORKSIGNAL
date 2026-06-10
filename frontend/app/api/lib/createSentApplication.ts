/**
 * Shared helper to persist a sent Application record in DynamoDB.
 */

import { randomUUID } from 'node:crypto';
import type { DynamoDBWrapper } from '@worksignal/shared';

export interface CreateSentApplicationInput {
  db: DynamoDBWrapper;
  userId: string;
  jobId: string;
  job: Record<string, unknown>;
  coverLetterText?: string;
  recipientEmail?: string | null;
  emailThreadId?: string | null;
  redirectSourceUrl?: string | null;
  redirectedAt?: string | null;
}

export interface CreateSentApplicationResult {
  application_id: string;
  sent_at: string;
}

export async function lookupVerdictId(
  db: DynamoDBWrapper,
  jobId: string,
  userId: string,
): Promise<string | null> {
  try {
    const verdicts = await db.query('AgentVerdicts', {
      IndexName: 'job_id-user_id-index',
      KeyConditionExpression: 'job_id = :j AND user_id = :u',
      ExpressionAttributeValues: { ':j': jobId, ':u': userId },
      Limit: 1,
    });
    return (verdicts[0] as { verdict_id?: string } | undefined)?.verdict_id ?? null;
  } catch {
    return null;
  }
}

export async function createSentApplication(
  input: CreateSentApplicationInput,
): Promise<CreateSentApplicationResult> {
  const {
    db,
    userId,
    jobId,
    job,
    coverLetterText = '',
    recipientEmail = null,
    emailThreadId = null,
    redirectSourceUrl = null,
    redirectedAt = null,
  } = input;

  const verdictId = await lookupVerdictId(db, jobId, userId);
  const now = new Date().toISOString();
  const applicationId = randomUUID();
  const effectiveRedirectedAt =
    redirectedAt ?? (redirectSourceUrl ? now : null);

  await db.put('Applications', {
    application_id: applicationId,
    user_id: userId,
    job_id: jobId,
    verdict_id: verdictId ?? `manual-${applicationId}`,
    company: job.company,
    role_title: job.role_title,
    customised_resume_s3_key: '',
    customisation_applied: false,
    cover_letter_text: coverLetterText,
    sent_at: now,
    recipient_email: recipientEmail,
    email_thread_id: emailThreadId,
    status: 'sent',
    redirect_source_url: redirectSourceUrl,
    redirected_at: effectiveRedirectedAt,
    status_updated_at: now,
    classification_confidence: 0,
  });

  return { application_id: applicationId, sent_at: now };
}
