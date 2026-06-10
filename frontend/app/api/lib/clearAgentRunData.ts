/**
 * Clear persisted agent output before a fresh Growth or Network run.
 */

import type { DynamoDBWrapper } from '@worksignal/shared';

export async function clearSkillGapsForUser(
  db: DynamoDBWrapper,
  userId: string,
): Promise<number> {
  const items =
    (await db.query('SkillGaps', {
      KeyConditionExpression: 'user_id = :u',
      ExpressionAttributeValues: { ':u': userId },
    })) ?? [];

  for (const item of items) {
    const skill = item.skill;
    if (typeof skill !== 'string' || !skill.trim()) continue;
    await db.delete('SkillGaps', { user_id: userId, skill });
  }

  return items.length;
}

export async function clearNetworkSuggestionsForUser(
  db: DynamoDBWrapper,
  userId: string,
): Promise<number> {
  const items =
    (await db.query('NetworkSuggestions', {
      KeyConditionExpression: 'user_id = :u',
      ExpressionAttributeValues: { ':u': userId },
    })) ?? [];

  for (const item of items) {
    const company = item.company;
    if (typeof company !== 'string' || !company.trim()) continue;
    await db.delete('NetworkSuggestions', { user_id: userId, company });
  }

  return items.length;
}
