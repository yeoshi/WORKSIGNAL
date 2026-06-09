# WORKSIGNAL — Backend Tasks
**Owner:** Rose | **Deadline:** Jun 10 11:59pm | **Region:** us-east-1

---
- upon onboarding, directly populate and match user against 50 jobs; 
- check careers api

## Codebase Structure

```
WORKSIGNAL/
├── backend/src/
│   ├── applications/    ApplicationSender (SES), ApplicationTracker, StatusMachine
│   ├── auth/            AuthService (Google OAuth, Gmail token AES-256-GCM)
│   ├── bedrock/         invokeWithBoundedRetry (max 3 retries, exp backoff)
│   ├── debate/          4 agents + DebateMachine + MaterialGeneration + VerdictPersistence
│   ├── discovery/       OpportunityScanner (MCF API), ExaFallback, ExaQuery
│   ├── e2e/             fullFlow.integration.test.ts — full pipeline mock test
│   ├── growth/          GrowthAgent, Roadmap, Trigger
│   ├── inbox/           GmailMonitor, RoleDisambiguation
│   ├── network/         NetworkAgent, Suggestions, Trigger
│   ├── onboarding/      OnboardingService, ResumeParser (Bedrock), Calibration
│   ├── orchestrator/    DecisionTree, DegradedResolution, FastTrack, RealismFloor
│   ├── preFilter/       PreFilter (salary/type/arrangement/EP), Relaxation
│   ├── recalibration/   RecalibrationEngine, Accuracy, Emergency
│   └── scripts/         runDebateDemo.ts (manual test script)
│
├── frontend/app/
│   ├── api/             Next.js BFF routes (these ARE the API; no separate Lambda for HTTP)
│   │   ├── auth/        NextAuth.js (Google OAuth)
│   │   ├── dashboard/   GET — currently returns EMPTY STUB in non-demo mode ← NEEDS WIRING
│   │   ├── jobs/[id]/   GET detail, POST send, POST skip ← wired to DynamoDB + backend
│   │   ├── pipeline/    GET list + GET debate ← wired to ApplicationTracker
│   │   ├── onboarding/  GET/PUT profile, POST resume, POST targets ← wired to backend
│   │   ├── growth/      GET roadmaps ← needs checking
│   │   ├── network/     GET suggestions ← needs checking
│   │   ├── brief/       GET weekly brief ← needs checking
│   │   └── lib/
│   │       ├── auth.ts       getAuthenticatedUser()
│   │       ├── demoData.ts   DEMO_MODE flag + all mock data
│   │       └── backend.ts    backendGet/backendPost (used when WORKSIGNAL_API_URL is set)
│   │
│   ├── dashboard/       [-] partial — ActionNeededCards, AgentStatusBanner, InsightCards
│   ├── jobs/[jobId]/    [-] partial — DebateCard, DebateCardList, DecisionSummary, JobHeader
│   ├── pipeline/        [-] partial — PipelineTable, StatusBadge
│   ├── onboarding/      [-] partial — 4 steps exist (SignIn, Resume, AboutYou, Targets)
│   ├── growth/          [x] complete — SkillGapHeader, RoadmapPlan, WeekCard
│   ├── network/         [x] complete — ConnectionCard, CompanyHeader, UpcomingEvents
│   └── brief/           [x] complete — AgentAccuracyDisplay, SummaryMetrics, ThresholdAdjustments
│
├── infra/src/
│   ├── dynamodb.ts      6 table TypeScript definitions (shape only, NOT CDK/SAM)
│   ├── s3.ts            S3 bucket definition
│   ├── schedules.ts     EventBridge schedule definitions
│   └── debateMachine.ts Step Functions ASL definition
│
└── shared/src/
    ├── types/           User, Job, Application, Verdict, Growth, Recalibration types
    └── utils/           DynamoDBWrapper (SDK v3), S3Helper, crypto (AES-256-GCM), logger
```

**How frontend → backend works:**
- Next.js API routes import directly from `@worksignal/backend` (monorepo mode, no Lambda needed for HTTP)
- Vercel deploys both the UI and the API routes as serverless functions
- Background jobs (debate scan, Gmail poll, recalibration) DO need Lambda + EventBridge

**What's fully tested:** 508 unit + integration tests pass (`npm run test` from repo root)

**What's missing for live:** AWS resources not created, env vars incomplete, dashboard route stub not wired, background Lambda handlers don't exist

---

## PHASE 0 — Environment Fix
**Time:** 15 min | **Blocks everything else**

### Task 0.1 — Fix AWS region
```bash
# Edit frontend/.env.local — change:
# AWS_DEFAULT_REGION=us-east-1
```

### Task 0.2 — Get fresh AWS credentials
The session tokens in `.env.local` are expired. Get fresh ones from the hackathon AWS account:
```bash
# If using hackathon-provided IAM role:
aws configure --profile worksignal
# Enter: Access Key ID, Secret Access Key, region=ap-southeast-1, output=json

# Or if using SSO:
aws sso login --profile worksignal

# Test it works:
aws sts get-caller-identity --region ap-southeast-1
# Expected: { "Account": "...", "UserId": "...", "Arn": "..." }
```

Update `.env.local` with the new credentials (or use the named profile).

### Task 0.3 — Add Exa API key
```bash
# Add to frontend/.env.local:
# EXA_API_KEY=your_key_from_hackathon_credits
```

Also add to `backend/.env` (create if not exists):
```bash
echo "EXA_API_KEY=your_key_here" >> /Users/roselin/Desktop/SUPERAI/WORKSIGNAL/backend/.env
```

### Task 0.4 — Add encryption secret
Auth service requires a 32-byte encryption secret for Gmail token AES-256-GCM:
```bash
# Generate a random 32-byte hex secret:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Add to frontend/.env.local:
# ENCRYPTION_SECRET=<output from above>
```

**Verify phase 0:**
```bash
aws bedrock list-foundation-models --region ap-southeast-1 | head -20
# Should list foundation models without error
```

---

## PHASE 1 — Provision AWS Resources
**Time:** 45 min | **Requires Phase 0**

### Task 1.1 — Create DynamoDB tables

All 6 table definitions are in `infra/src/dynamodb.ts`. Create them via CLI:

```bash
# Users table
aws dynamodb create-table \
  --table-name worksignal-users \
  --attribute-definitions AttributeName=user_id,AttributeType=S \
  --key-schema AttributeName=user_id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region ap-southeast-1

# Jobs table (with user_id GSI)
aws dynamodb create-table \
  --table-name worksignal-jobs \
  --attribute-definitions AttributeName=job_id,AttributeType=S AttributeName=user_id,AttributeType=S \
  --key-schema AttributeName=job_id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --global-secondary-indexes '[{
    "IndexName":"user_id-index",
    "KeySchema":[{"AttributeName":"user_id","KeyType":"HASH"}],
    "Projection":{"ProjectionType":"ALL"}
  }]' \
  --region ap-southeast-1

# AgentVerdicts table (with job_id+user_id GSI)
aws dynamodb create-table \
  --table-name worksignal-agent-verdicts \
  --attribute-definitions AttributeName=verdict_id,AttributeType=S AttributeName=job_id,AttributeType=S AttributeName=user_id,AttributeType=S \
  --key-schema AttributeName=verdict_id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --global-secondary-indexes '[{
    "IndexName":"job_id-user_id-index",
    "KeySchema":[{"AttributeName":"job_id","KeyType":"HASH"},{"AttributeName":"user_id","KeyType":"RANGE"}],
    "Projection":{"ProjectionType":"ALL"}
  }]' \
  --region ap-southeast-1

# Applications table (with user_id+company GSI)
aws dynamodb create-table \
  --table-name worksignal-applications \
  --attribute-definitions AttributeName=application_id,AttributeType=S AttributeName=user_id,AttributeType=S AttributeName=company,AttributeType=S \
  --key-schema AttributeName=application_id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --global-secondary-indexes '[{
    "IndexName":"user_id-company-index",
    "KeySchema":[{"AttributeName":"user_id","KeyType":"HASH"},{"AttributeName":"company","KeyType":"RANGE"}],
    "Projection":{"ProjectionType":"ALL"}
  }]' \
  --region ap-southeast-1

# SkillGaps table
aws dynamodb create-table \
  --table-name worksignal-skill-gaps \
  --attribute-definitions AttributeName=user_id,AttributeType=S AttributeName=skill,AttributeType=S \
  --key-schema AttributeName=user_id,KeyType=HASH AttributeName=skill,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  --region ap-southeast-1

# RecalibrationLog table (with user_id+week_of GSI)
aws dynamodb create-table \
  --table-name worksignal-recalibration-log \
  --attribute-definitions AttributeName=recalibration_id,AttributeType=S AttributeName=user_id,AttributeType=S AttributeName=week_of,AttributeType=S \
  --key-schema AttributeName=recalibration_id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --global-secondary-indexes '[{
    "IndexName":"user_id-week_of-index",
    "KeySchema":[{"AttributeName":"user_id","KeyType":"HASH"},{"AttributeName":"week_of","KeyType":"RANGE"}],
    "Projection":{"ProjectionType":"ALL"}
  }]' \
  --region ap-southeast-1
```

**Verify tables exist:**
```bash
aws dynamodb list-tables --region ap-southeast-1
# Expected: worksignal-users, worksignal-jobs, worksignal-agent-verdicts,
#           worksignal-applications, worksignal-skill-gaps, worksignal-recalibration-log
```

### Task 1.2 — Create S3 bucket

```bash
# Create bucket (bucket names must be globally unique — add your account suffix)
aws s3 mb s3://worksignal-documents-dev --region ap-southeast-1

# Block all public access
aws s3api put-public-access-block \
  --bucket worksignal-documents-dev \
  --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true" \
  --region ap-southeast-1

# Enable versioning
aws s3api put-bucket-versioning \
  --bucket worksignal-documents-dev \
  --versioning-configuration Status=Enabled \
  --region ap-southeast-1
```

**Verify bucket exists:**
```bash
aws s3 ls s3://worksignal-documents-dev --region ap-southeast-1
# Should not error
```

### Task 1.3 — Verify Bedrock model access

```bash
# Check Claude Sonnet is available in ap-southeast-1:
aws bedrock list-foundation-models \
  --region ap-southeast-1 \
  --query "modelSummaries[?contains(modelId,'claude-sonnet')].[modelId,modelLifecycleStatus]" \
  --output table
```

Note the exact model ID — PRD says `anthropic.claude-sonnet-4-20250514`. If not available, fall back to `anthropic.claude-3-5-sonnet-20241022-v2:0`.

Update `backend/src/bedrock/invoke.ts` with the correct model ID if needed.

---

## PHASE 2 — Test External API Connections
**Time:** 30 min | **Requires Phase 0**

### Task 2.1 — Test MCF API (free, no auth)
```bash
curl -s -X POST \
  "https://api.mycareersfuture.gov.sg/v2/search?limit=5&page=0" \
  -H "Content-Type: application/json" \
  -d '{"search":"software engineer Singapore"}' | python3 -m json.tool | head -40
```
**Expected:** JSON with `results` array containing Singapore job listings.
**Frontend impact:** OpportunityScanner feeds jobs into Jobs DynamoDB → Dashboard action_needed cards.

### Task 2.2 — Test Exa API
```bash
curl -s -X POST https://api.exa.ai/search \
  -H "x-api-key: $EXA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query":"Grab Singapore layoffs 2026","numResults":3,"type":"auto"}' | python3 -m json.tool
```
**Expected:** JSON with `results` array containing web search results.
**Frontend impact:** Risk Agent uses Exa → red_flags in debate card → JobDetailView.

### Task 2.3 — Test Bedrock
```bash
aws bedrock-runtime invoke-model \
  --model-id "anthropic.claude-3-5-sonnet-20241022-v2:0" \
  --body '{"anthropic_version":"bedrock-2023-05-31","max_tokens":100,"messages":[{"role":"user","content":"Reply with just: WORKSIGNAL OK"}]}' \
  --region ap-southeast-1 \
  --content-type application/json \
  --accept application/json \
  /tmp/bedrock-test.json && cat /tmp/bedrock-test.json
```
**Expected:** Response with `"WORKSIGNAL OK"` in content.
**Frontend impact:** All 4 debate agents + material generation use Bedrock → debate cards, cover letter, customised resume.

### Task 2.4 — Test DynamoDB write + read
```bash
# Write a test record
aws dynamodb put-item \
  --table-name worksignal-users \
  --item '{"user_id":{"S":"test-user-001"},"email":{"S":"test@test.com"},"name":{"S":"Test User"}}' \
  --region ap-southeast-1

# Read it back
aws dynamodb get-item \
  --table-name worksignal-users \
  --key '{"user_id":{"S":"test-user-001"}}' \
  --region ap-southeast-1

# Clean up
aws dynamodb delete-item \
  --table-name worksignal-users \
  --key '{"user_id":{"S":"test-user-001"}}' \
  --region ap-southeast-1
```

### Task 2.5 — Test S3 upload + pre-signed URL
```bash
# Create a test file
echo "test resume content" > /tmp/test-resume.pdf

# Upload
aws s3 cp /tmp/test-resume.pdf s3://worksignal-documents-dev/resumes/test-user-001/test.pdf \
  --region ap-southeast-1

# Generate pre-signed URL
aws s3 presign s3://worksignal-documents-dev/resumes/test-user-001/test.pdf \
  --expires-in 900 \
  --region ap-southeast-1

# Clean up
aws s3 rm s3://worksignal-documents-dev/resumes/test-user-001/test.pdf --region ap-southeast-1
```

---

## PHASE 3 — SES Email Setup
**Time:** 15 min | **Required for application sending**

### Task 3.1 — Verify sender email identity
```bash
# Verify the email address that will send applications (must match SES config)
aws ses verify-email-identity \
  --email-address lx.rose.lin@gmail.com \
  --region ap-southeast-1

echo "Check your inbox for the verification email and click the link."
```

### Task 3.2 — Add SES config to .env.local
```bash
# Add to frontend/.env.local:
# SES_FROM_EMAIL=lx.rose.lin@gmail.com
# SES_REGION=ap-southeast-1
```

### Task 3.3 — Test SES send
```bash
aws ses send-email \
  --from "lx.rose.lin@gmail.com" \
  --destination "ToAddresses=lx.rose.lin@gmail.com" \
  --message "Subject={Data='WORKSIGNAL SES Test'},Body={Text={Data='SES is working from ap-southeast-1'}}" \
  --region ap-southeast-1
```

---

## PHASE 4 — Run Integration Tests Against Real AWS
**Time:** 30 min | **Requires Phases 1-3**

### Task 4.1 — Run the backend integration tests
These tests use real AWS when credentials are present in env. They skip gracefully if AWS is unreachable.

```bash
cd /Users/roselin/Desktop/SUPERAI/WORKSIGNAL

# Run only integration tests (not the full 508-test suite)
npx vitest run --reporter=verbose backend/src/discovery/opportunityScanner.integration.test.ts

npx vitest run --reporter=verbose backend/src/debate/debateMachine.integration.test.ts

npx vitest run --reporter=verbose backend/src/recalibration/recalibrationEngine.integration.test.ts

npx vitest run --reporter=verbose backend/src/e2e/fullFlow.integration.test.ts
```

### Task 4.2 — Run the debate demo script manually
This exercises the full debate pipeline and prints results to terminal:
```bash
cd /Users/roselin/Desktop/SUPERAI/WORKSIGNAL/backend
npx tsx src/scripts/runDebateDemo.ts
```
**Expected:** JSON output showing 4 agent verdicts + Master Orchestrator decision.

---

## PHASE 5 — Wire Dashboard Route to Real Data
**Time:** 1 hr | **Required for frontend to show real data**

The dashboard route (`frontend/app/api/dashboard/route.ts`) returns an empty stub when `DEMO_MODE=false`. All other routes are already wired to real backend services. This is the one gap.

### Task 5.1 — Check what data the dashboard aggregates

The dashboard needs:
- `agent_status` — latest `last_scan_at` from Users table
- `action_needed` — Jobs table with `status=awaiting_review` for this user
- `pipeline` — Applications table grouped by status
- `growth` — SkillGaps table for this user
- `network` — NetworkSuggestions or similar
- `intelligence` — RecalibrationLog for latest callback_rate
- `relaxation_suggestions` — RelaxationSuggestions table/records

### Task 5.2 — Edit the dashboard route

Replace the empty stub in `frontend/app/api/dashboard/route.ts` (lines 94–107) with real DynamoDB queries:

```typescript
import { DynamoDBWrapper } from '@worksignal/shared';
const db = new DynamoDBWrapper();

// Get user record (for last_scan_at)
const userRecord = await db.get('Users', { user_id: user.userId });

// Get jobs awaiting review
const pendingJobs = await db.query('Jobs', {
    IndexName: 'user_id-index',
    KeyConditionExpression: 'user_id = :u',
    FilterExpression: 'attribute_exists(pending_review)',
    ExpressionAttributeValues: { ':u': user.userId },
});

// Get applications by status
const applications = await db.query('Applications', {
    IndexName: 'user_id-company-index',
    KeyConditionExpression: 'user_id = :u',
    ExpressionAttributeValues: { ':u': user.userId },
});

// Get skill gaps
const skillGaps = await db.query('SkillGaps', {
    KeyConditionExpression: 'user_id = :u',
    ExpressionAttributeValues: { ':u': user.userId },
});
```

Then assemble the same shape as `demoDashboard` using real data.

**Test it in browser:** Log in → Dashboard should show 0 counts (empty DB) rather than throwing 500.

---

## PHASE 6 — Seed Demo Data for Judges
**Time:** 1 hr | **Required for a convincing demo**

The PRD risk register says "Pre-cache 3 demo verdicts in DynamoDB" to avoid Bedrock latency during the live demo.

### Task 6.1 — Run the debate script on 3 real MCF jobs

First scan MCF to get real job IDs:
```bash
cd /Users/roselin/Desktop/SUPERAI/WORKSIGNAL/backend
npx tsx src/scripts/runDebateDemo.ts
```

Then use the DynamoDB wrapper to write results directly:
```bash
# Or insert pre-crafted demo data manually via AWS CLI:
# (Use the same shape as demoPipeline / demoJobDetail in demoData.ts
#  but store them in real DynamoDB under a demo user_id)
```

### Task 6.2 — Add DEMO_USER_ID env var

For the demo, set a specific `user_id` that has pre-seeded data:
```bash
# Add to frontend/.env.local:
# DEMO_USER_ID=worksignal-demo-2026
```

---

## PHASE 7 — Background Agent Lambdas (for EventBridge)
**Time:** 2–3 hrs | **Required for judges to see autonomous agents running**

These background jobs run every 3 hrs (debate scan), 30 min (Gmail poll), and weekly (recalibration). They need Lambda handlers that EventBridge can trigger.

### Task 7.1 — Create debate scan Lambda handler

Create `backend/src/handlers/debateScanHandler.ts`:
```typescript
import { runDebateMachine } from '../debate/debateMachine.js';
import { createOpportunityScanner } from '../discovery/opportunityScanner.js';
import { DynamoDBWrapper } from '@worksignal/shared';

export const handler = async () => {
    const db = new DynamoDBWrapper();
    // Get all active users
    const users = await db.query('Users', {
        FilterExpression: 'attribute_exists(profile)',
        KeyConditionExpression: '',  // scan all — adjust for production
        ExpressionAttributeValues: {},
    });
    
    for (const user of users) {
        const scanner = createOpportunityScanner({ db });
        await runDebateMachine({ userId: user.user_id, db, scanner });
    }
};
```

### Task 7.2 — Create Gmail poll Lambda handler

Create `backend/src/handlers/gmailPollHandler.ts`:
```typescript
import { GmailMonitorImpl } from '../inbox/gmailMonitor.js';
import { DynamoDBWrapper } from '@worksignal/shared';

export const handler = async () => {
    const db = new DynamoDBWrapper();
    const monitor = new GmailMonitorImpl({ db });
    // Poll Gmail for all users with inbox_monitoring_available=true
    const users = await db.query('Users', {
        FilterExpression: 'inbox_monitoring_available = :t',
        ExpressionAttributeValues: { ':t': true },
    });
    for (const user of users) {
        await monitor.poll(user.user_id);
    }
};
```

### Task 7.3 — Create recalibration Lambda handler

Create `backend/src/handlers/recalibrationHandler.ts`:
```typescript
import { RecalibrationEngineImpl } from '../recalibration/recalibrationEngine.js';
import { DynamoDBWrapper } from '@worksignal/shared';

export const handler = async () => {
    const db = new DynamoDBWrapper();
    const engine = new RecalibrationEngineImpl({ db });
    const users = await db.query('Users', {
        KeyConditionExpression: 'attribute_exists(user_id)',
        ExpressionAttributeValues: {},
    });
    for (const user of users) {
        await engine.runWeeklyRecalibration(user.user_id);
    }
};
```

### Task 7.4 — Create Lambda functions in AWS

```bash
# First, build the backend
cd /Users/roselin/Desktop/SUPERAI/WORKSIGNAL/backend
npm run build

# Zip the dist (adjust based on actual build output):
cd dist && zip -r ../lambda-debate.zip . && cd ..

# Create Lambda function
aws lambda create-function \
  --function-name worksignal-debate-scan \
  --runtime nodejs20.x \
  --role arn:aws:iam::YOUR_ACCOUNT:role/lambda-execution-role \
  --handler handlers/debateScanHandler.handler \
  --zip-file fileb://lambda-debate.zip \
  --timeout 300 \
  --memory-size 512 \
  --environment "Variables={AWS_DEFAULT_REGION=ap-southeast-1,EXA_API_KEY=$EXA_API_KEY,WORKSIGNAL_S3_BUCKET=worksignal-documents-dev,ENCRYPTION_SECRET=$ENCRYPTION_SECRET}" \
  --region ap-southeast-1
```

### Task 7.5 — Wire EventBridge to Lambdas

```bash
# Create EventBridge rule for 3-hourly debate scan
aws events put-rule \
  --name worksignal-debate-schedule \
  --schedule-expression "rate(3 hours)" \
  --state ENABLED \
  --region ap-southeast-1

# Add Lambda as target
aws events put-targets \
  --rule worksignal-debate-schedule \
  --targets "Id=1,Arn=arn:aws:lambda:ap-southeast-1:YOUR_ACCOUNT:function:worksignal-debate-scan" \
  --region ap-southeast-1

# Grant EventBridge permission to invoke Lambda
aws lambda add-permission \
  --function-name worksignal-debate-scan \
  --statement-id allow-eventbridge \
  --action lambda:InvokeFunction \
  --principal events.amazonaws.com \
  --source-arn arn:aws:events:ap-southeast-1:YOUR_ACCOUNT:rule/worksignal-debate-schedule \
  --region ap-southeast-1
```

**Test manual trigger:**
```bash
aws lambda invoke \
  --function-name worksignal-debate-scan \
  --payload '{}' \
  /tmp/lambda-test.json && cat /tmp/lambda-test.json
```

---

## PHASE 8 — Vercel Deployment
**Time:** 30 min | **Final step before submission**

### Task 8.1 — Deploy frontend to Vercel

```bash
cd /Users/roselin/Desktop/SUPERAI/WORKSIGNAL/frontend
npx vercel --prod
```

Note the deployment URL (e.g. `https://worksignal.vercel.app`).

### Task 8.2 — Set Vercel environment variables

In Vercel dashboard or via CLI, set all env vars:
```bash
vercel env add NEXTAUTH_URL production   # → https://worksignal.vercel.app
vercel env add NEXTAUTH_SECRET production
vercel env add GOOGLE_CLIENT_ID production
vercel env add GOOGLE_CLIENT_SECRET production
vercel env add AWS_DEFAULT_REGION production   # → ap-southeast-1
vercel env add AWS_ACCESS_KEY_ID production
vercel env add AWS_SECRET_ACCESS_KEY production
vercel env add EXA_API_KEY production
vercel env add WORKSIGNAL_S3_BUCKET production  # → worksignal-documents-dev
vercel env add ENCRYPTION_SECRET production
vercel env add DEMO_MODE production              # → false (or true for demo safety)
```

### Task 8.3 — Update Google OAuth redirect URI

In Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client ID:
- Add `https://worksignal.vercel.app/api/auth/callback/google` to Authorised redirect URIs

### Task 8.4 — Redeploy after env vars
```bash
vercel --prod
```

---

## PHASE 9 — End-to-End Integration Verification
**Time:** 30 min | **Final QA before demo**

Run through the full demo flow to verify each step hits real AWS:

### Checklist: Terminal smoke tests
```bash
# 1. MCF API returns jobs
curl -s "https://api.mycareersfuture.gov.sg/v2/search?limit=3&page=0" \
  -X POST -H "Content-Type: application/json" \
  -d '{"search":"software engineer"}' | python3 -m json.tool | grep '"title"' | head -3

# 2. Exa returns results
curl -s "https://api.exa.ai/search" \
  -X POST -H "x-api-key: $EXA_API_KEY" -H "Content-Type: application/json" \
  -d '{"query":"Grab Singapore company health 2026","numResults":2}' | python3 -m json.tool | grep '"title"'

# 3. DynamoDB reachable
aws dynamodb describe-table --table-name worksignal-users --region ap-southeast-1 | grep TableStatus

# 4. S3 reachable
aws s3 ls s3://worksignal-documents-dev --region ap-southeast-1

# 5. Bedrock reachable
aws bedrock list-foundation-models --region ap-southeast-1 --query "modelSummaries[0].modelId"

# 6. Local Next.js dev server returns real data (not demo)
curl -s http://localhost:3000/api/dashboard | python3 -m json.tool | grep '"jobs_in_review"'
```

### Checklist: Browser flow
1. Visit `https://worksignal.vercel.app` → landing page loads
2. Click Sign In → Google OAuth prompt → redirects back to dashboard
3. Complete onboarding (upload a PDF resume, fill targets) → check DynamoDB for Users record
4. Dashboard shows (even if empty) without 500 error
5. Navigate to `/growth` → loads Growth page
6. Navigate to `/network` → loads Network page
7. Navigate to `/brief` → loads Brief page
8. Navigate to `/pipeline` → loads Pipeline (empty is fine if no applications sent)

---

## Priority Order for Jun 10 Deadline

If time is short, do these first — they unblock the demo flow:

| Priority | Phase | Task | Why |
|---|---|---|---|
| 🔴 P0 | Phase 0 | Fix region + fresh AWS creds | Everything else fails without this |
| 🔴 P0 | Phase 0 | Add EXA_API_KEY | Debate Risk/Opportunity agents fail without this |
| 🔴 P0 | Phase 1.1 | Create 6 DynamoDB tables | Every DB operation fails |
| 🔴 P0 | Phase 1.2 | Create S3 bucket | Resume upload + material generation fail |
| 🔴 P0 | Phase 2.1–2.5 | Test all API connections | Confirms infra is wired correctly |
| 🟡 P1 | Phase 3 | SES email verification | Application sending fails without it |
| 🟡 P1 | Phase 5 | Wire dashboard route | Dashboard shows empty instead of agent activity |
| 🟡 P1 | Phase 8 | Vercel deploy + env vars | Required for judges to access the app |
| 🟢 P2 | Phase 6 | Seed demo data | Needed for reliable live demo |
| 🟢 P2 | Phase 7 | Lambda + EventBridge | Shows autonomous agent behaviour to judges |
| 🟢 P2 | Phase 4 | Integration tests | Confirms real AWS path works (vs mocks) |

---

## Common Issues

**`ResourceNotFoundException: Requested resource not found`** — Table name mismatch. Check that table names in `shared/src/utils/dynamodb.ts` match what you created. The code may use `Users` but AWS needs the exact name configured via env var.

**`UnrecognizedClientException: The security token included in the request is expired`** — AWS session token expired. Re-run Phase 0.2.

**`ModelNotReadyException` or `AccessDeniedException` on Bedrock** — Model access not enabled on hackathon account. Go to AWS Console → Bedrock → Model access → Request access for Claude Sonnet.

**Next.js `Module not found: @worksignal/backend`** — Run `npm install` from the repo root to link workspace packages.

**Google OAuth `redirect_uri_mismatch`** — Add the exact Vercel callback URL to Google Cloud Console: `https://your-app.vercel.app/api/auth/callback/google`
