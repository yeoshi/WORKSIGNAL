/**
 * POST /api/jobs/[jobId]/materials/regenerate — Re-generate application materials.
 */

import { NextRequest } from 'next/server';
import { getAuthenticatedUser, unauthorizedResponse } from '../../../../lib/auth';
import { generateAndPersistJobMaterials } from '../../../../lib/jobMaterialsGeneration';

export async function POST(
  _request: NextRequest,
  { params }: { params: { jobId: string } },
) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  const { jobId } = params;

  try {
    const { DynamoDBWrapper } = await import('@worksignal/shared');
    const db = new DynamoDBWrapper();

    const job = await db.get('Jobs', { job_id: jobId });
    if (!job || job.user_id !== user.userId) {
      return Response.json({ error: 'Not Found', message: 'Job not found.' }, { status: 404 });
    }

    const verdictItems = await db.query('AgentVerdicts', {
      IndexName: 'job_id-user_id-index',
      KeyConditionExpression: 'job_id = :j AND user_id = :u',
      ExpressionAttributeValues: { ':j': jobId, ':u': user.userId },
    });

    const verdictItem = verdictItems[0];
    if (!verdictItem?.verdict_id) {
      return Response.json(
        { error: 'Not Found', message: 'No verdict found for this job.' },
        { status: 404 },
      );
    }

    const decision = verdictItem.master_decision as Record<string, unknown> | undefined;
    if (!decision) {
      return Response.json(
        { error: 'Bad Request', message: 'Job has no orchestrator decision yet.' },
        { status: 400 },
      );
    }

    const materials = await generateAndPersistJobMaterials({
      userId: user.userId,
      jobId,
      verdictId: String(verdictItem.verdict_id),
      job: job as Record<string, unknown>,
      decision,
    });

    return Response.json({ ok: true, ...materials });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error(`[materials/regenerate] error for job=${jobId}:`, message);
    return Response.json({ error: 'Error', message }, { status: 500 });
  }
}
