/**
 * GET /api/pipeline — List user's applications (Req 17).
 */

import { DynamoDBWrapper } from '@worksignal/shared';
import { getAuthenticatedUser, unauthorizedResponse } from '../lib/auth';
import { DEMO_MODE, DEMO_PIPELINE } from '../lib/demo';
import { listUserApplications } from '../lib/listUserApplications';

export async function GET() {
  if (DEMO_MODE) return Response.json(DEMO_PIPELINE);

  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  try {
    const db = new DynamoDBWrapper();
    const applications = await listUserApplications(db, user.userId);
    return Response.json(applications);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return Response.json({ error: 'Error', message }, { status: 500 });
  }
}
