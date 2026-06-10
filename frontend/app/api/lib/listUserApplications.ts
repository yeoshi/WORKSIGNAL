import type { DynamoDBWrapper } from './dynamodb';

const APPLICATIONS_USER_INDEX = 'user_id-company-index';

export async function listUserApplications(
  db: DynamoDBWrapper,
  userId: string,
): Promise<Array<Record<string, unknown>>> {
  const items = await db.query('Applications', {
    IndexName: APPLICATIONS_USER_INDEX,
    KeyConditionExpression: 'user_id = :u',
    ExpressionAttributeValues: { ':u': userId },
  });
  return items ?? [];
}
