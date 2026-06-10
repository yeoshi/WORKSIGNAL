/**
 * POST /api/jobs/[jobId]/resume/from-text — Persist AI-generated resume as PDF.
 */

import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { getAuthenticatedUser, unauthorizedResponse } from '../../../../lib/auth';
import { textToResumePdf } from '../../../../lib/resumePdf';

export async function POST(
  request: NextRequest,
  { params }: { params: { jobId: string } },
) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  const { jobId } = params;

  let resumeText = '';
  try {
    const body = (await request.json()) as { resumeText?: string };
    resumeText = body.resumeText?.trim() ?? '';
  } catch {
    return Response.json({ error: 'Bad Request', message: 'Invalid JSON body.' }, { status: 400 });
  }

  if (!resumeText) {
    return Response.json(
      { error: 'Bad Request', message: 'resumeText is required.' },
      { status: 400 },
    );
  }

  try {
    const { DynamoDBWrapper, S3Helper } = await import('@worksignal/shared');
    const db = new DynamoDBWrapper();

    const job = await db.get('Jobs', { job_id: jobId });
    if (!job || job.user_id !== user.userId) {
      return Response.json({ error: 'Not Found', message: 'Job not found.' }, { status: 404 });
    }

    const pdfBytes = await textToResumePdf(resumeText);
    const bucket = process.env.WORKSIGNAL_S3_BUCKET ?? 'worksignal-documents';
    const s3Key = `resumes/customised/${user.userId}/${jobId}/${randomUUID()}/tailored-resume.pdf`;

    const s3 = new S3Helper({ bucket });
    await s3.putObject(s3Key, Buffer.from(pdfBytes), {
      contentType: 'application/pdf',
    });

    const verdictItems = await db.query('AgentVerdicts', {
      IndexName: 'job_id-user_id-index',
      KeyConditionExpression: 'job_id = :j AND user_id = :u',
      ExpressionAttributeValues: { ':j': jobId, ':u': user.userId },
    });

    const verdictItem = verdictItems[0];
    if (verdictItem?.verdict_id) {
      await db.update('AgentVerdicts', { verdict_id: verdictItem.verdict_id }, {
        UpdateExpression:
          'SET customised_resume_s3_key = :key, customisation_applied = :applied, updated_at = :ts',
        ExpressionAttributeValues: {
          ':key': s3Key,
          ':applied': true,
          ':ts': new Date().toISOString(),
        },
      });
    }

    const resumeUrl = await s3.getPresignedUrl(s3Key);

    return Response.json({ ok: true, s3Key, resumeUrl, customisation_applied: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error(`[resume-from-text] error for job=${jobId}:`, message);
    return Response.json({ error: 'Error', message }, { status: 500 });
  }
}
