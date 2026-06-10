#!/usr/bin/env node
/**
 * Validates AWS credentials loaded from frontend/.env.local.
 * Run after updating keys: node scripts/validate-aws-env.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DynamoDBClient, ListTablesCommand } from '@aws-sdk/client-dynamodb';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(root, '.env.local');

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

const region = process.env.AWS_DEFAULT_REGION ?? process.env.AWS_REGION ?? 'us-west-2';
const hasKey = Boolean(process.env.AWS_ACCESS_KEY_ID);
const hasSecret = Boolean(process.env.AWS_SECRET_ACCESS_KEY);
const hasToken = Boolean(process.env.AWS_SESSION_TOKEN);
const demoMode = process.env.DEMO_MODE === 'true';

console.log(`DEMO_MODE=${demoMode ? 'true' : 'false'}`);
console.log(`Region: ${region}`);
console.log(`AWS_ACCESS_KEY_ID: ${hasKey ? 'set' : 'MISSING'}`);
console.log(`AWS_SECRET_ACCESS_KEY: ${hasSecret ? 'set' : 'MISSING'}`);
console.log(`AWS_SESSION_TOKEN: ${hasToken ? 'set' : 'missing (ok for long-lived IAM keys)'}`);

if (demoMode) {
  console.log('\n⚠️  DEMO_MODE is true — app uses mock data, not real AWS.');
  process.exit(1);
}

if (!hasKey || !hasSecret) {
  console.log('\n❌ Add AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY to frontend/.env.local');
  process.exit(1);
}

const client = new DynamoDBClient({ region });
try {
  await client.send(new ListTablesCommand({ Limit: 1 }));
  console.log('\n✅ AWS credentials are valid. Restart the dev server: npm run dev');
} catch (error) {
  const name = error?.name ?? 'Error';
  const message = error?.message ?? String(error);
  console.log(`\n❌ AWS check failed: ${name}: ${message}`);
  if (/ExpiredToken/i.test(message)) {
    console.log(
      '\nYour session token expired. Get fresh creds from AWS (SSO/console), update all three in .env.local, then re-run this script.',
    );
  }
  process.exit(1);
}
