import { describe, expect, it, vi } from 'vitest';
import { DynamoDBWrapper } from '@worksignal/shared';
import {
  clearNetworkSuggestionsForUser,
  clearSkillGapsForUser,
} from './clearAgentRunData';

function fakeDb(items: Record<string, unknown>[]): DynamoDBWrapper {
  const deleted: unknown[] = [];
  return new DynamoDBWrapper({
    client: {
      send: vi.fn(async (command: unknown) => {
        const name = (command as { constructor: { name: string } }).constructor.name;
        if (name === 'QueryCommand') return { Items: items };
        if (name === 'DeleteCommand') {
          deleted.push(command);
          return {};
        }
        return {};
      }),
    },
  });
}

describe('clearAgentRunData', () => {
  it('deletes all SkillGaps rows for the user', async () => {
    const db = fakeDb([
      { user_id: 'u1', skill: 'Kubernetes' },
      { user_id: 'u1', skill: 'SQL' },
    ]);
    const count = await clearSkillGapsForUser(db, 'u1');
    expect(count).toBe(2);
    expect(db['client'].send).toHaveBeenCalled();
  });

  it('deletes all NetworkSuggestions rows for the user', async () => {
    const db = fakeDb([
      { user_id: 'u1', company: 'Google' },
      { user_id: 'u1', company: 'Grab' },
    ]);
    const count = await clearNetworkSuggestionsForUser(db, 'u1');
    expect(count).toBe(2);
  });
});
