/**
 * DELETE /api/dashboard/clear — remove all Jobs and AgentVerdicts for the
 * authenticated user, so a fresh agent run populates a clean dashboard.
 */

import { DynamoDBWrapper } from '@worksignal/shared';
import { getAuthenticatedUser, unauthorizedResponse } from '../../lib/auth';

export async function DELETE() {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  const db = new DynamoDBWrapper();

  const jobs = await db.query('Jobs', {
    IndexName: 'user_id-index',
    KeyConditionExpression: 'user_id = :u',
    ExpressionAttributeValues: { ':u': user.userId },
  });

  await Promise.all(
    jobs.map(async (job) => {
      const jobId = job.job_id as string;

      const verdicts = await db.query('AgentVerdicts', {
        IndexName: 'job_id-user_id-index',
        KeyConditionExpression: 'job_id = :j AND user_id = :u',
        ExpressionAttributeValues: { ':j': jobId, ':u': user.userId },
      });

      await Promise.all(
        verdicts.map((v) =>
          db.delete('AgentVerdicts', { verdict_id: v.verdict_id as string }),
        ),
      );

      await db.delete('Jobs', { job_id: jobId });
    }),
  );

  return Response.json({ deleted_jobs: jobs.length });
}
