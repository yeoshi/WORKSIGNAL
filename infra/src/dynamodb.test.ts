import { describe, it, expect } from 'vitest';
import {
  AgentVerdictsTable,
  ApplicationsTable,
  DYNAMODB_REGION,
  JobsTable,
  RecalibrationLogTable,
  SkillGapsTable,
  UsersTable,
  WORKSIGNAL_TABLES,
  type TableDefinition,
} from './dynamodb.js';

/** Names referenced by a table's KeySchema and any GSI KeySchema. */
function allKeyAttributeNames(table: TableDefinition): string[] {
  const fromPrimary = table.KeySchema.map((k) => k.AttributeName);
  const fromIndexes = (table.GlobalSecondaryIndexes ?? []).flatMap((gsi) =>
    gsi.KeySchema.map((k) => k.AttributeName),
  );
  return [...new Set([...fromPrimary, ...fromIndexes])];
}

describe('DynamoDB table infrastructure', () => {
  it('targets the configured AWS region', () => {
    expect(DYNAMODB_REGION).toBe(process.env.AWS_DEFAULT_REGION ?? 'us-west-2');
  });

  it('defines exactly the six design tables', () => {
    expect(WORKSIGNAL_TABLES.map((t) => t.TableName)).toEqual([
      'Users',
      'Jobs',
      'AgentVerdicts',
      'Applications',
      'SkillGaps',
      'RecalibrationLog',
    ]);
  });

  describe.each(WORKSIGNAL_TABLES.map((t) => [t.TableName, t] as const))(
    '%s',
    (_name, table) => {
      it('uses on-demand (PAY_PER_REQUEST) billing', () => {
        expect(table.BillingMode).toBe('PAY_PER_REQUEST');
      });

      it('has at least one HASH key in its primary KeySchema', () => {
        expect(table.KeySchema.some((k) => k.KeyType === 'HASH')).toBe(true);
      });

      it('declares an AttributeDefinition for every key attribute used', () => {
        const declared = new Set(
          table.AttributeDefinitions.map((a) => a.AttributeName),
        );
        for (const keyName of allKeyAttributeNames(table)) {
          expect(declared.has(keyName)).toBe(true);
        }
      });

      it('does not declare unused (non-key) attribute definitions', () => {
        const keyNames = new Set(allKeyAttributeNames(table));
        for (const def of table.AttributeDefinitions) {
          expect(keyNames.has(def.AttributeName)).toBe(true);
        }
      });

      it('records NEW attributes with a requirement reference', () => {
        for (const attr of table.documentedAttributes) {
          if (attr.isNew) {
            expect(attr.requirement).toBeTruthy();
          }
        }
      });
    },
  );

  it('keys Users on user_id with no GSI', () => {
    expect(UsersTable.KeySchema).toEqual([
      { AttributeName: 'user_id', KeyType: 'HASH' },
    ]);
    expect(UsersTable.GlobalSecondaryIndexes).toBeUndefined();
  });

  it('keys Jobs on job_id with a user_id GSI', () => {
    expect(JobsTable.KeySchema).toEqual([
      { AttributeName: 'job_id', KeyType: 'HASH' },
    ]);
    expect(JobsTable.GlobalSecondaryIndexes?.[0]?.KeySchema).toEqual([
      { AttributeName: 'user_id', KeyType: 'HASH' },
    ]);
  });

  it('keys AgentVerdicts on verdict_id with a (job_id, user_id) GSI', () => {
    expect(AgentVerdictsTable.KeySchema).toEqual([
      { AttributeName: 'verdict_id', KeyType: 'HASH' },
    ]);
    expect(AgentVerdictsTable.GlobalSecondaryIndexes?.[0]?.KeySchema).toEqual([
      { AttributeName: 'job_id', KeyType: 'HASH' },
      { AttributeName: 'user_id', KeyType: 'RANGE' },
    ]);
  });

  it('keys Applications on application_id with a (user_id, company) GSI', () => {
    expect(ApplicationsTable.KeySchema).toEqual([
      { AttributeName: 'application_id', KeyType: 'HASH' },
    ]);
    expect(ApplicationsTable.GlobalSecondaryIndexes?.[0]?.KeySchema).toEqual([
      { AttributeName: 'user_id', KeyType: 'HASH' },
      { AttributeName: 'company', KeyType: 'RANGE' },
    ]);
  });

  it('keys SkillGaps on a composite (user_id, skill) primary key', () => {
    expect(SkillGapsTable.KeySchema).toEqual([
      { AttributeName: 'user_id', KeyType: 'HASH' },
      { AttributeName: 'skill', KeyType: 'RANGE' },
    ]);
    expect(SkillGapsTable.GlobalSecondaryIndexes).toBeUndefined();
  });

  it('keys RecalibrationLog on recalibration_id with a (user_id, week_of) GSI', () => {
    expect(RecalibrationLogTable.KeySchema).toEqual([
      { AttributeName: 'recalibration_id', KeyType: 'HASH' },
    ]);
    expect(
      RecalibrationLogTable.GlobalSecondaryIndexes?.[0]?.KeySchema,
    ).toEqual([
      { AttributeName: 'user_id', KeyType: 'HASH' },
      { AttributeName: 'week_of', KeyType: 'RANGE' },
    ]);
  });

  it('includes all design NEW attributes across the schema', () => {
    const newAttrs = WORKSIGNAL_TABLES.flatMap((t) =>
      t.documentedAttributes.filter((a) => a.isNew).map((a) => a.name),
    );
    expect(newAttrs).toEqual(
      expect.arrayContaining([
        'inbox_monitoring_available',
        'onboarding_version',
        'ep_sponsorship_signal',
        'mcf_listing_days',
        'customisation_applied',
        'redirect_source_url',
        'agent_failures',
        'emergency',
      ]),
    );
  });
});
