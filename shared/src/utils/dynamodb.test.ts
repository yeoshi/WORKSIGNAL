import { describe, it, expect } from 'vitest';
import { DynamoDBWrapper, type DocumentClientLike } from './dynamodb.js';

interface SentCommand {
  name: string;
  input: Record<string, unknown>;
}

/**
 * Fake document client that records sent commands and returns scripted
 * responses keyed by command class name.
 */
function fakeClient(
  responses: Record<string, unknown[]> = {},
): DocumentClientLike & { sent: SentCommand[] } {
  const queues: Record<string, unknown[]> = { ...responses };
  const sent: SentCommand[] = [];
  return {
    sent,
    async send(command: unknown) {
      const cmd = command as { constructor: { name: string }; input: Record<string, unknown> };
      const name = cmd.constructor.name;
      sent.push({ name, input: cmd.input });
      const queue = queues[name];
      const next = queue && queue.length > 0 ? queue.shift() : undefined;
      return next ?? {};
    },
  };
}

describe('DynamoDBWrapper', () => {
  it('get returns the item from a GetCommand', async () => {
    const client = fakeClient({ GetCommand: [{ Item: { user_id: 'u1', name: 'Ada' } }] });
    const db = new DynamoDBWrapper({ client });
    const item = await db.get('Users', { user_id: 'u1' });
    expect(item).toEqual({ user_id: 'u1', name: 'Ada' });
    expect(client.sent[0]).toMatchObject({
      name: 'GetCommand',
      input: { TableName: 'Users', Key: { user_id: 'u1' } },
    });
  });

  it('get returns undefined when no item exists', async () => {
    const client = fakeClient({ GetCommand: [{}] });
    const db = new DynamoDBWrapper({ client });
    expect(await db.get('Users', { user_id: 'missing' })).toBeUndefined();
  });

  it('put sends a PutCommand with the item', async () => {
    const client = fakeClient();
    const db = new DynamoDBWrapper({ client });
    await db.put('Jobs', { job_id: 'j1', company: 'Acme' });
    expect(client.sent[0]).toMatchObject({
      name: 'PutCommand',
      input: { TableName: 'Jobs', Item: { job_id: 'j1', company: 'Acme' } },
    });
  });

  it('delete sends a DeleteCommand with the key', async () => {
    const client = fakeClient();
    const db = new DynamoDBWrapper({ client });
    await db.delete('Jobs', { job_id: 'j1' });
    expect(client.sent[0]).toMatchObject({
      name: 'DeleteCommand',
      input: { TableName: 'Jobs', Key: { job_id: 'j1' } },
    });
  });

  it('update returns the new attributes and defaults to ALL_NEW', async () => {
    const client = fakeClient({ UpdateCommand: [{ Attributes: { status: 'sent' } }] });
    const db = new DynamoDBWrapper({ client });
    const result = await db.update(
      'Applications',
      { application_id: 'a1' },
      { UpdateExpression: 'SET #s = :s', ExpressionAttributeNames: { '#s': 'status' }, ExpressionAttributeValues: { ':s': 'sent' } },
    );
    expect(result).toEqual({ status: 'sent' });
    expect(client.sent[0]!.input.ReturnValues).toBe('ALL_NEW');
  });

  it('query aggregates items across paginated responses', async () => {
    const client = fakeClient({
      QueryCommand: [
        { Items: [{ id: 1 }], LastEvaluatedKey: { id: 1 } },
        { Items: [{ id: 2 }] },
      ],
    });
    const db = new DynamoDBWrapper({ client });
    const items = await db.query('Jobs', {
      IndexName: 'user_id-index',
      KeyConditionExpression: 'user_id = :u',
      ExpressionAttributeValues: { ':u': 'u1' },
    });
    expect(items).toEqual([{ id: 1 }, { id: 2 }]);
    expect(client.sent).toHaveLength(2);
    // Second query carries the pagination cursor from the first.
    expect(client.sent[1]!.input.ExclusiveStartKey).toEqual({ id: 1 });
  });

  it('query returns an empty array when there are no items', async () => {
    const client = fakeClient({ QueryCommand: [{}] });
    const db = new DynamoDBWrapper({ client });
    expect(await db.query('Jobs', { KeyConditionExpression: 'user_id = :u', ExpressionAttributeValues: { ':u': 'x' } })).toEqual([]);
  });
});
