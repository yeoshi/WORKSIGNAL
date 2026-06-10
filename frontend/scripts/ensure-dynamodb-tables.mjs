#!/usr/bin/env node
/**
 * Ensure WORKSIGNAL DynamoDB tables exist (on-demand billing).
 * Uses credentials from frontend/.env.local — same as validate-aws-env.mjs.
 *
 *   node scripts/ensure-dynamodb-tables.mjs
 *   node scripts/ensure-dynamodb-tables.mjs --create   # create missing tables
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  ListTablesCommand,
} from '@aws-sdk/client-dynamodb';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(root, '.env.local');
const shouldCreate = process.argv.includes('--create');

function loadEnvFile(path) {
  const content = readFileSync(path, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(envPath);

const region = process.env.AWS_DEFAULT_REGION ?? process.env.AWS_REGION ?? 'us-east-1';

/** Table definitions the app expects (subset most relevant to Growth/Network). */
const TABLES = [
  {
    name: 'Users',
    input: {
      TableName: 'Users',
      BillingMode: 'PAY_PER_REQUEST',
      AttributeDefinitions: [{ AttributeName: 'user_id', AttributeType: 'S' }],
      KeySchema: [{ AttributeName: 'user_id', KeyType: 'HASH' }],
    },
  },
  {
    name: 'Jobs',
    input: {
      TableName: 'Jobs',
      BillingMode: 'PAY_PER_REQUEST',
      AttributeDefinitions: [
        { AttributeName: 'job_id', AttributeType: 'S' },
        { AttributeName: 'user_id', AttributeType: 'S' },
      ],
      KeySchema: [{ AttributeName: 'job_id', KeyType: 'HASH' }],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'user_id-index',
          KeySchema: [{ AttributeName: 'user_id', KeyType: 'HASH' }],
          Projection: { ProjectionType: 'ALL' },
        },
      ],
    },
  },
  {
    name: 'AgentVerdicts',
    input: {
      TableName: 'AgentVerdicts',
      BillingMode: 'PAY_PER_REQUEST',
      AttributeDefinitions: [
        { AttributeName: 'verdict_id', AttributeType: 'S' },
        { AttributeName: 'job_id', AttributeType: 'S' },
        { AttributeName: 'user_id', AttributeType: 'S' },
      ],
      KeySchema: [{ AttributeName: 'verdict_id', KeyType: 'HASH' }],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'job_id-user_id-index',
          KeySchema: [
            { AttributeName: 'job_id', KeyType: 'HASH' },
            { AttributeName: 'user_id', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
        },
      ],
    },
  },
  {
    name: 'Applications',
    input: {
      TableName: 'Applications',
      BillingMode: 'PAY_PER_REQUEST',
      AttributeDefinitions: [
        { AttributeName: 'application_id', AttributeType: 'S' },
        { AttributeName: 'user_id', AttributeType: 'S' },
        { AttributeName: 'company', AttributeType: 'S' },
      ],
      KeySchema: [{ AttributeName: 'application_id', KeyType: 'HASH' }],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'user_id-company-index',
          KeySchema: [
            { AttributeName: 'user_id', KeyType: 'HASH' },
            { AttributeName: 'company', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
        },
      ],
    },
  },
  {
    name: 'SkillGaps',
    note: 'Growth Agent — roadmaps',
    input: {
      TableName: 'SkillGaps',
      BillingMode: 'PAY_PER_REQUEST',
      AttributeDefinitions: [
        { AttributeName: 'user_id', AttributeType: 'S' },
        { AttributeName: 'skill', AttributeType: 'S' },
      ],
      KeySchema: [
        { AttributeName: 'user_id', KeyType: 'HASH' },
        { AttributeName: 'skill', KeyType: 'RANGE' },
      ],
    },
  },
  {
    name: 'NetworkSuggestions',
    note: 'Network Agent — NEW for live run',
    input: {
      TableName: 'NetworkSuggestions',
      BillingMode: 'PAY_PER_REQUEST',
      AttributeDefinitions: [
        { AttributeName: 'user_id', AttributeType: 'S' },
        { AttributeName: 'company', AttributeType: 'S' },
      ],
      KeySchema: [
        { AttributeName: 'user_id', KeyType: 'HASH' },
        { AttributeName: 'company', KeyType: 'RANGE' },
      ],
    },
  },
  {
    name: 'RecalibrationLog',
    input: {
      TableName: 'RecalibrationLog',
      BillingMode: 'PAY_PER_REQUEST',
      AttributeDefinitions: [
        { AttributeName: 'recalibration_id', AttributeType: 'S' },
        { AttributeName: 'user_id', AttributeType: 'S' },
        { AttributeName: 'week_of', AttributeType: 'S' },
      ],
      KeySchema: [{ AttributeName: 'recalibration_id', KeyType: 'HASH' }],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'user_id-week_of-index',
          KeySchema: [
            { AttributeName: 'user_id', KeyType: 'HASH' },
            { AttributeName: 'week_of', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
        },
      ],
    },
  },
];

const client = new DynamoDBClient({ region });

async function tableExists(name) {
  try {
    await client.send(new DescribeTableCommand({ TableName: name }));
    return true;
  } catch (error) {
    if (error?.name === 'ResourceNotFoundException') return false;
    throw error;
  }
}

console.log(`Region: ${region}`);
console.log(shouldCreate ? 'Mode: check + create missing\n' : 'Mode: check only (pass --create to provision)\n');

const missing = [];

for (const table of TABLES) {
  const exists = await tableExists(table.name);
  const tag = table.note ? ` — ${table.note}` : '';
  if (exists) {
    console.log(`✅ ${table.name}${tag}`);
  } else {
    console.log(`❌ ${table.name} MISSING${tag}`);
    missing.push(table);
  }
}

if (missing.length === 0) {
  console.log('\nAll tables present.');
  process.exit(0);
}

if (!shouldCreate) {
  console.log(`\n${missing.length} table(s) missing. Run:`);
  console.log('  node scripts/ensure-dynamodb-tables.mjs --create');
  process.exit(1);
}

console.log('\nCreating missing tables…');
for (const table of missing) {
  process.stdout.write(`  ${table.name}… `);
  await client.send(new CreateTableCommand(table.input));
  console.log('requested (may take ~30s to become ACTIVE)');
}

console.log('\nDone. Re-run without --create to verify when ACTIVE.');
