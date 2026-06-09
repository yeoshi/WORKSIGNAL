/**
 * DynamoDB client wrapper.
 *
 * Wraps the AWS SDK v3 DynamoDB Document client to give the rest of the
 * codebase a small, typed, marshalling-free surface (plain JS objects in and
 * out). All tables are on-demand in `ap-southeast-1` (see design Data Models).
 *
 * The underlying document client is injectable so unit tests can supply a fake
 * without touching AWS; in production the client is lazily constructed from the
 * default credential chain and region.
 */

import {
  DynamoDBClient,
  type DynamoDBClientConfig,
} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  DeleteCommand,
  UpdateCommand,
  QueryCommand,
  type QueryCommandInput,
  type UpdateCommandInput,
} from '@aws-sdk/lib-dynamodb';

/** Default region for all WORKSIGNAL infrastructure (design: AWS ap-southeast-1). */
const DEFAULT_REGION = 'ap-southeast-1';

/** Minimal structural type the wrapper needs; satisfied by DynamoDBDocumentClient. */
export interface DocumentClientLike {
  send(command: unknown): Promise<unknown>;
}

/** A DynamoDB item is any plain key/value record. */
export type DynamoItem = Record<string, unknown>;

export interface DynamoDBWrapperOptions {
  /** Inject a pre-built document client (e.g. a fake in tests). */
  client?: DocumentClientLike;
  /** Region override used only when constructing a real client. */
  region?: string;
  /** Extra config forwarded to the real `DynamoDBClient` constructor. */
  clientConfig?: DynamoDBClientConfig;
}

/**
 * Build a real DynamoDB Document client using the default credential chain.
 * `removeUndefinedValues` keeps writes clean when optional fields are absent.
 */
function buildDefaultClient(
  region: string,
  clientConfig?: DynamoDBClientConfig,
): DocumentClientLike {
  const base = new DynamoDBClient({ region, ...clientConfig });
  return DynamoDBDocumentClient.from(base, {
    marshallOptions: { removeUndefinedValues: true },
  });
}

export class DynamoDBWrapper {
  private readonly client: DocumentClientLike;

  constructor(options: DynamoDBWrapperOptions = {}) {
    this.client =
      options.client ??
      buildDefaultClient(options.region ?? DEFAULT_REGION, options.clientConfig);
  }

  /** Fetch a single item by primary key. Returns `undefined` when absent. */
  async get<T extends DynamoItem = DynamoItem>(
    tableName: string,
    key: DynamoItem,
  ): Promise<T | undefined> {
    const result = (await this.client.send(
      new GetCommand({ TableName: tableName, Key: key }),
    )) as { Item?: T };
    return result.Item;
  }

  /** Write (create or replace) a single item. */
  async put<T extends DynamoItem = DynamoItem>(
    tableName: string,
    item: T,
  ): Promise<void> {
    await this.client.send(new PutCommand({ TableName: tableName, Item: item }));
  }

  /** Delete a single item by primary key. */
  async delete(tableName: string, key: DynamoItem): Promise<void> {
    await this.client.send(
      new DeleteCommand({ TableName: tableName, Key: key }),
    );
  }

  /**
   * Apply an update expression to a single item and return the resulting
   * attributes (defaults to `ALL_NEW`).
   */
  async update<T extends DynamoItem = DynamoItem>(
    tableName: string,
    key: DynamoItem,
    params: Omit<UpdateCommandInput, 'TableName' | 'Key'>,
  ): Promise<T | undefined> {
    const result = (await this.client.send(
      new UpdateCommand({
        TableName: tableName,
        Key: key,
        ReturnValues: 'ALL_NEW',
        ...params,
      }),
    )) as { Attributes?: T };
    return result.Attributes;
  }

  /**
   * Run a query, transparently following pagination until all matching items
   * are collected. Supply `IndexName` in `params` to query a GSI.
   */
  async query<T extends DynamoItem = DynamoItem>(
    tableName: string,
    params: Omit<QueryCommandInput, 'TableName'>,
  ): Promise<T[]> {
    const items: T[] = [];
    let lastEvaluatedKey: Record<string, unknown> | undefined;
    do {
      const result = (await this.client.send(
        new QueryCommand({
          TableName: tableName,
          ...params,
          ExclusiveStartKey: lastEvaluatedKey,
        }),
      )) as { Items?: T[]; LastEvaluatedKey?: Record<string, unknown> };
      if (result.Items) {
        items.push(...result.Items);
      }
      lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);
    return items;
  }
}

/** Convenience factory mirroring the {@link DynamoDBWrapper} constructor. */
export function createDynamoDBWrapper(
  options?: DynamoDBWrapperOptions,
): DynamoDBWrapper {
  return new DynamoDBWrapper(options);
}
