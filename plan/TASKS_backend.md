# WORKSIGNAL — Backend Tasks
**Owner:** Rose | **Deadline:** Jun 10 11:59pm | **Region:** us-east-1
**Last updated:** Jun 10, 2026 — reflects actual deployed/tested state

- user profile and resume

- DONE: integrate exa for searching 
- CHECK DASHBOARD DATABASE: 
-- Run Agents 
-- Get Verdicts 
-- Save to dynamo
-- live update Agent Run outputs to dashboard 
-- add a clear old step (for demo)

- Agent run outputs: 
  - 4 = apply -- add to list to apply
  - 3 = apply w caveat -- add to list to apply
  - 2 = deadlock -- have the orchestrator re-evaluate this - apply or hold
  - 1 = skip 

- List of jobs where ambition score is high, but realism is low
- display on Growth agent  
- conslidate the skills required there


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

## PROGRESS SNAPSHOT (as of Jun 10, updated)

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 0 — Env | ⚠️ 3/5 done | ❌ `EXA_API_KEY` missing · ❌ `ENCRYPTION_SECRET` missing · ✅ region/creds set |
| Phase 1 — AWS Resources | ✅ Done | All 6 DynamoDB tables ACTIVE · S3 bucket exists · Bedrock tested |
| Phase 2 — API Tests | ⚠️ 3/5 done | ✅ MCF · ✅ Bedrock · ✅ DynamoDB · ❌ Exa (no key) · ❓ S3 not confirmed |
| Phase 3 — SES | ✅ Done | Both emails verified · config in `.env.local` |
| Phase 4 — Integration Tests | ❌ Not started | Blocked by EXA_API_KEY |
| Phase 5 — Dashboard Route | ✅ Done | Fully wired to DynamoDB — real data, no stub |
| Phase 5b — Agent/Run SSE Route | ✅ Done | `/api/agent/run` SSE pipeline runs in-process on Vercel; real-time debate log |
| Phase 5c — Agent Run UI | ✅ Done | AgentRunModal on dashboard with live event rendering |
| Phase 6 — Full Pipeline | ⚠️ Script + route complete | `/api/agent/run` handles it live; `runFullFlow.ts` also available; needs EXA_API_KEY |
| Phase 7 — Lambda Handlers | ❌ Not started | `handlers/` dir does not exist; needed for autonomous/EventBridge operation |
| Phase 8 — Vercel Deploy | ✅ Deployed | `worksignal_demo` live; `NEXTAUTH_URL` needs Vercel prod URL set in dashboard |
| Phase 9 — E2E QA | ⚠️ Partial | Onboarding + dashboard confirmed; full pipeline run pending EXA_API_KEY |

**Immediate unblocking steps (in order):**
1. Add `EXA_API_KEY=...` to `/WORKSIGNAL/.env.aws` and `frontend/.env.local` — Risk Agent degrades without it
2. Add `ENCRYPTION_SECRET=...` to `frontend/.env.local` (32-byte hex: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
3. Update `NEXTAUTH_URL` to Vercel prod URL in Vercel dashboard env vars
4. `cd backend && npx tsx src/scripts/seedDashboard.ts` — ensure complete user record in DynamoDB
5. Click "Run Agents" on dashboard or `npx tsx src/scripts/runFullFlow.ts` — verify full pipeline
6. Build Phase 7 Lambda handlers for autonomous EventBridge operation

---

## DynamoDB Setup — Step-by-Step (Do This First)

This is the fastest path to fix the `ResourceNotFoundException` errors you're seeing in `npm run dev`. Follow in order.

### Step 1 — Confirm you have valid AWS credentials

```bash
aws sts get-caller-identity --region us-east-1
```
Expected: JSON with `Account`, `UserId`, `Arn`. If you get an auth error, go to Phase 0.2 first.

### Step 2 — Check your .env.local has the correct region

Open `frontend/.env.local` and confirm:
```
AWS_DEFAULT_REGION=us-east-1
```
The `DynamoDBWrapper` reads this env var (`shared/src/utils/dynamodb.ts:29`). If it's wrong or missing, all AWS calls go to the wrong region even if the tables exist.

### Step 3 — Create all 6 tables (copy-paste the full block)

```bash
aws dynamodb create-table --table-name Users \
  --attribute-definitions AttributeName=user_id,AttributeType=S \
  --key-schema AttributeName=user_id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST --region us-east-1

aws dynamodb create-table --table-name Jobs \
  --attribute-definitions AttributeName=job_id,AttributeType=S AttributeName=user_id,AttributeType=S \
  --key-schema AttributeName=job_id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --global-secondary-indexes '[{"IndexName":"user_id-index","KeySchema":[{"AttributeName":"user_id","KeyType":"HASH"}],"Projection":{"ProjectionType":"ALL"}}]' \
  --region us-east-1

aws dynamodb create-table --table-name AgentVerdicts \
  --attribute-definitions AttributeName=verdict_id,AttributeType=S AttributeName=job_id,AttributeType=S AttributeName=user_id,AttributeType=S \
  --key-schema AttributeName=verdict_id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --global-secondary-indexes '[{"IndexName":"job_id-user_id-index","KeySchema":[{"AttributeName":"job_id","KeyType":"HASH"},{"AttributeName":"user_id","KeyType":"RANGE"}],"Projection":{"ProjectionType":"ALL"}}]' \
  --region us-east-1

aws dynamodb create-table --table-name Applications \
  --attribute-definitions AttributeName=application_id,AttributeType=S AttributeName=user_id,AttributeType=S AttributeName=company,AttributeType=S \
  --key-schema AttributeName=application_id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --global-secondary-indexes '[{"IndexName":"user_id-company-index","KeySchema":[{"AttributeName":"user_id","KeyType":"HASH"},{"AttributeName":"company","KeyType":"RANGE"}],"Projection":{"ProjectionType":"ALL"}}]' \
  --region us-east-1

aws dynamodb create-table --table-name SkillGaps \
  --attribute-definitions AttributeName=user_id,AttributeType=S AttributeName=skill,AttributeType=S \
  --key-schema AttributeName=user_id,KeyType=HASH AttributeName=skill,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST --region us-east-1

aws dynamodb create-table --table-name RecalibrationLog \
  --attribute-definitions AttributeName=recalibration_id,AttributeType=S AttributeName=user_id,AttributeType=S AttributeName=week_of,AttributeType=S \
  --key-schema AttributeName=recalibration_id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --global-secondary-indexes '[{"IndexName":"user_id-week_of-index","KeySchema":[{"AttributeName":"user_id","KeyType":"HASH"},{"AttributeName":"week_of","KeyType":"RANGE"}],"Projection":{"ProjectionType":"ALL"}}]' \
  --region us-east-1
```

### Step 4 — Wait for tables to become ACTIVE

On-demand tables usually activate in under 30 seconds. Poll until all 6 show `ACTIVE`:

```bash
for table in Users Jobs AgentVerdicts Applications SkillGaps RecalibrationLog; do
  echo -n "$table: "
  aws dynamodb describe-table --table-name $table --region us-east-1 \
    --query "Table.TableStatus" --output text
done
# All 6 should print: ACTIVE
```

### Step 5 — Test the exact query the pipeline runs

This replicates what `ApplicationTracker.list()` does under the hood:

```bash
aws dynamodb query \
  --table-name Applications \
  --index-name user_id-company-index \
  --key-condition-expression "user_id = :u" \
  --expression-attribute-values '{":u":{"S":"test-user"}}' \
  --region us-east-1
# Expected: {"Count": 0, "Items": []} — empty but NO ResourceNotFoundException
```

### Step 6 — Restart dev server and confirm errors are gone

```bash
# Stop the running dev server (Ctrl+C), then:
cd /Users/roselin/Desktop/SUPERAI/WORKSIGNAL/frontend
npm run dev
```

Watch the logs. You should see **no more** `"Pipeline load failed; retrying silently"` warnings. The pipeline will load an empty list instead.

### If a table already exists (re-run safe)

```bash
# Check which tables already exist:
aws dynamodb list-tables --region us-east-1 --output text
# If a table exists you'll get ResourceInUseException on create — that's fine, skip it.
```

---

## PHASE 0 — Environment Fix · ⚠️ PARTIAL (2/4)
**Time:** 15 min | **Blocks everything else**

### ✅ Task 0.1 — Fix AWS region
```bash
# Edit frontend/.env.local — change:
# AWS_DEFAULT_REGION=us-east-1
```

### ✅ Task 0.2 — Get fresh AWS credentials
The session tokens in `.env.local` are expired. Get fresh ones from the hackathon AWS account:
```bash
# If using hackathon-provided IAM role:
aws configure --profile worksignal
# Enter: Access Key ID, Secret Access Key, region=us-east-1, output=json

# Or if using SSO:
aws sso login --profile worksignal

# Test it works:
aws sts get-caller-identity --region us-east-1
# Expected: { "Account": "...", "UserId": "...", "Arn": "..." }
```

Update `.env.local` with the new credentials (or use the named profile).

### ❌ Task 0.3 — Add Exa API key  ← BLOCKED: key not in any env file
```bash
# Add to frontend/.env.local:
# EXA_API_KEY=your_key_from_hackathon_credits
```

Also add to `backend/.env` (create if not exists):
```bash
echo "EXA_API_KEY=your_key_here" >> /Users/roselin/Desktop/SUPERAI/WORKSIGNAL/backend/.env
```

### ❌ Task 0.4 — Add encryption secret  ← BLOCKED: not in frontend/.env.local
Auth service requires a 32-byte encryption secret for Gmail token AES-256-GCM:
```bash
# Generate a random 32-byte hex secret:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Add to frontend/.env.local:
# ENCRYPTION_SECRET=<output from above>
```

**Verify phase 0:**
```bash
aws bedrock list-foundation-models --region us-east-1 | head -20
# Should list foundation models without error
```

---

## PHASE 1 — Provision AWS Resources · ✅ DONE
**Time:** 45 min | **Requires Phase 0**

---

### DynamoDB: Design Decision & Under the Hood

#### Design Decision

Six tables are defined in `infra/src/dynamodb.ts` with **on-demand billing** (`PAY_PER_REQUEST`). For a hackathon this is the right call — no capacity planning, no throttling surprises, and you only pay per request.

**CRITICAL: Table names are hardcoded as short bare strings in every service.** Do NOT add a `worksignal-` prefix when creating them — the code will break.

| Table | Partition key | Sort / GSI keys | Used by |
|---|---|---|---|
| `Users` | `user_id` | — | AuthService, OnboardingService, OpportunityScanner, RecalibrationEngine |
| `Jobs` | `job_id` | GSI: `user_id-index` | OpportunityScanner, VerdictPersistence |
| `AgentVerdicts` | `verdict_id` | GSI: `job_id-user_id-index` | VerdictPersistence, ApplicationTracker.getDebate |
| `Applications` | `application_id` | GSI: `user_id-company-index` | ApplicationTracker (pipeline), GmailMonitor, NetworkAgent, RecalibrationEngine |
| `SkillGaps` | `user_id` (HASH) + `skill` (RANGE) | — | GrowthAgent |
| `RecalibrationLog` | `recalibration_id` | GSI: `user_id-week_of-index` | RecalibrationEngine |

The GSIs are pre-planned for the query patterns the code already issues — `user_id-company-index` on Applications lets the pipeline list all of a user's applications without a full-table scan.

#### What happens under the hood when the Pipeline page loads

```
Browser loads /pipeline
  └─ fetchPipeline.ts:27        fetch('/api/pipeline')
       └─ app/api/pipeline/route.ts:22   tracker.list(user.userId)
            └─ applicationTracker.ts:284   list(userId)
                 └─ applicationTracker.ts:411   loadApplications(userId)
                      └─ shared/src/utils/dynamodb.ts:122   DynamoDBWrapper.query(
                             tableName = 'Applications',          ← hardcoded constant (line 77)
                             IndexName  = 'user_id-company-index', ← hardcoded constant (line 80)
                             KeyConditionExpression = 'user_id = :u',
                             ExpressionAttributeValues = { ':u': userId }
                           )
                           └─ @aws-sdk/lib-dynamodb QueryCommand → AWS DynamoDB us-east-1
                                ← ResourceNotFoundException  (table 'Applications' does not exist yet)
  list() catches the error, retries 3 more times (attempt 1–4), logs each as warn
  After 4 failures: returns [] silently + fires backgroundRetry (applicationTracker.ts:305)
```

The **retry loop** (`listMaxRetries = 3` → 4 total attempts, 200 ms apart) is Requirement 17.2: "retry automatically in the background WITHOUT notifying the user." That is why you see exactly 4 warn log lines, not a thrown error in the UI.

**Where the hardcoded table name constants live** (all must match what you create in AWS):

| Constant | File | Value |
|---|---|---|
| `DEFAULT_APPLICATIONS_TABLE` | `applicationTracker.ts:77` | `'Applications'` |
| `DEFAULT_AGENT_VERDICTS_TABLE` | `verdictPersistence.ts:75` | `'AgentVerdicts'` |
| `DEFAULT_USERS_TABLE` / `USERS_TABLE` | `authService.ts:36`, `onboardingService.ts:61`, etc. | `'Users'` |
| `DEFAULT_JOBS_TABLE` | `opportunityScanner.ts:56` | `'Jobs'` |
| `SKILL_GAPS_TABLE` | `growthAgent.ts:59` | `'SkillGaps'` |
| `DEFAULT_RECALIBRATION_LOG_TABLE` | `recalibrationEngine.ts:89` | `'RecalibrationLog'` |

The `DynamoDBWrapper` itself (`shared/src/utils/dynamodb.ts:29`) reads the region from `AWS_DEFAULT_REGION` env var and falls back to `us-west-2`. Make sure `.env.local` has `AWS_DEFAULT_REGION=us-east-1`.

---

### ✅ Task 1.1 — Create DynamoDB tables

All 6 table definitions are in `infra/src/dynamodb.ts`. Create them via CLI using the **exact names the code expects** (no prefix):

```bash
# Users table
aws dynamodb create-table \
  --table-name Users \
  --attribute-definitions AttributeName=user_id,AttributeType=S \
  --key-schema AttributeName=user_id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1

# Jobs table (with user_id GSI)
aws dynamodb create-table \
  --table-name Jobs \
  --attribute-definitions AttributeName=job_id,AttributeType=S AttributeName=user_id,AttributeType=S \
  --key-schema AttributeName=job_id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --global-secondary-indexes '[{
    "IndexName":"user_id-index",
    "KeySchema":[{"AttributeName":"user_id","KeyType":"HASH"}],
    "Projection":{"ProjectionType":"ALL"}
  }]' \
  --region us-east-1

# AgentVerdicts table (with job_id+user_id GSI)
aws dynamodb create-table \
  --table-name AgentVerdicts \
  --attribute-definitions AttributeName=verdict_id,AttributeType=S AttributeName=job_id,AttributeType=S AttributeName=user_id,AttributeType=S \
  --key-schema AttributeName=verdict_id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --global-secondary-indexes '[{
    "IndexName":"job_id-user_id-index",
    "KeySchema":[{"AttributeName":"job_id","KeyType":"HASH"},{"AttributeName":"user_id","KeyType":"RANGE"}],
    "Projection":{"ProjectionType":"ALL"}
  }]' \
  --region us-east-1

# Applications table (with user_id+company GSI — this is what the pipeline query hits)
aws dynamodb create-table \
  --table-name Applications \
  --attribute-definitions AttributeName=application_id,AttributeType=S AttributeName=user_id,AttributeType=S AttributeName=company,AttributeType=S \
  --key-schema AttributeName=application_id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --global-secondary-indexes '[{
    "IndexName":"user_id-company-index",
    "KeySchema":[{"AttributeName":"user_id","KeyType":"HASH"},{"AttributeName":"company","KeyType":"RANGE"}],
    "Projection":{"ProjectionType":"ALL"}
  }]' \
  --region us-east-1

# SkillGaps table (composite PK: user_id HASH + skill RANGE — no GSI needed)
aws dynamodb create-table \
  --table-name SkillGaps \
  --attribute-definitions AttributeName=user_id,AttributeType=S AttributeName=skill,AttributeType=S \
  --key-schema AttributeName=user_id,KeyType=HASH AttributeName=skill,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1

# RecalibrationLog table (with user_id+week_of GSI)
aws dynamodb create-table \
  --table-name RecalibrationLog \
  --attribute-definitions AttributeName=recalibration_id,AttributeType=S AttributeName=user_id,AttributeType=S AttributeName=week_of,AttributeType=S \
  --key-schema AttributeName=recalibration_id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --global-secondary-indexes '[{
    "IndexName":"user_id-week_of-index",
    "KeySchema":[{"AttributeName":"user_id","KeyType":"HASH"},{"AttributeName":"week_of","KeyType":"RANGE"}],
    "Projection":{"ProjectionType":"ALL"}
  }]' \
  --region us-east-1
```

**Verify tables exist and are ACTIVE:**
```bash
aws dynamodb list-tables --region us-east-1
# Expected: Users, Jobs, AgentVerdicts, Applications, SkillGaps, RecalibrationLog

# Check each is ACTIVE (not still CREATING):
for table in Users Jobs AgentVerdicts Applications SkillGaps RecalibrationLog; do
  echo -n "$table: "
  aws dynamodb describe-table --table-name $table --region us-east-1 \
    --query "Table.TableStatus" --output text
done
```

**Test write + read on the Applications table (the one causing the pipeline error):**
```bash
# Write a test application record
aws dynamodb put-item \
  --table-name Applications \
  --item '{
    "application_id":{"S":"test-app-001"},
    "user_id":{"S":"test-user-001"},
    "company":{"S":"Grab"},
    "role_title":{"S":"Senior Engineer"},
    "status":{"S":"sent"},
    "sent_at":{"S":"2026-06-09T00:00:00.000Z"},
    "status_updated_at":{"S":"2026-06-09T00:00:00.000Z"},
    "classification_confidence":{"N":"0"}
  }' \
  --region us-east-1

# Query via GSI (exactly what ApplicationTracker.list() does)
aws dynamodb query \
  --table-name Applications \
  --index-name user_id-company-index \
  --key-condition-expression "user_id = :u" \
  --expression-attribute-values '{":u":{"S":"test-user-001"}}' \
  --region us-east-1

# Expected: Items array containing the record above. If you see this, the pipeline
# will stop throwing ResourceNotFoundException for real users.

# Clean up
aws dynamodb delete-item \
  --table-name Applications \
  --key '{"application_id":{"S":"test-app-001"}}' \
  --region us-east-1
```

**After creating tables, verify the pipeline error is gone:**
```bash
# Restart the Next.js dev server, then watch logs — you should see NO more:
# "Pipeline load failed; retrying silently"
# Instead the pipeline will load (empty list) without errors.
```

### ✅ Task 1.2 — Create S3 bucket

```bash
# Create bucket (bucket names must be globally unique — add your account suffix)
aws s3 mb s3://worksignal-documents-dev --region us-east-1

# Block all public access
aws s3api put-public-access-block \
  --bucket worksignal-documents-dev \
  --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true" \
  --region us-east-1

# Enable versioning
aws s3api put-bucket-versioning \
  --bucket worksignal-documents-dev \
  --versioning-configuration Status=Enabled \
  --region us-east-1
```

**Verify bucket exists:**
```bash
aws s3 ls s3://worksignal-documents-dev --region us-east-1
# Should not error
```

### ✅ Task 1.3 — Verify Bedrock model access

```bash
# Check Claude Sonnet is available in us-east-1:
aws bedrock list-foundation-models \
  --region us-east-1 \
  --query "modelSummaries[?contains(modelId,'claude-sonnet')].[modelId,modelLifecycleStatus]" \
  --output table
```

Note the exact model ID — PRD says `anthropic.claude-sonnet-4-20250514`. If not available, fall back to `anthropic.claude-3-5-sonnet-20241022-v2:0`.

Update `backend/src/bedrock/invoke.ts` with the correct model ID if needed.

-------------------------------------------------------
|                ListFoundationModels                 |
+---------------------------------------------+-------+
|  anthropic.claude-sonnet-4-20250514-v1:0    |  None |
|  anthropic.claude-sonnet-4-6                |  None |
|  anthropic.claude-sonnet-4-5-20250929-v1:0  |  None |
+---------------------------------------------+-------+
---

## PHASE 2 — Test External API Connections · ⚠️ PARTIAL (3/5)
**Time:** 30 min | **Requires Phase 0**

### ✅ Task 2.1 — Test MCF API
```bash
curl -s -X POST \
  "https://api.mycareersfuture.gov.sg/v2/search?limit=5&page=0" \
  -H "Content-Type: application/json" \
  -d '{"search":"software engineer Singapore"}' | python3 -m json.tool | head -40
```
**Expected:** JSON with `results` array containing Singapore job listings.
**Frontend impact:** OpportunityScanner feeds jobs into Jobs DynamoDB → Dashboard action_needed cards.

### Task 2.2 — Test Exa API  ← blocked by missing EXA_API_KEY


```bash
curl -s -X POST https://api.exa.ai/search \
  -H "x-api-key: $EXA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query":"Grab Singapore layoffs 2026","numResults":3,"type":"auto"}' | python3 -m json.tool
```
**Expected:** JSON with `results` array containing web search results.
**Frontend impact:** Risk Agent uses Exa → red_flags in debate card → JobDetailView.

### ✅ Task 2.3 — Test Bedrock
```bash
aws bedrock-runtime invoke-model \
  --model-id "anthropic.claude-3-5-sonnet-20241022-v2:0" \
  --body '{"anthropic_version":"bedrock-2023-05-31","max_tokens":100,"messages":[{"role":"user","content":"Reply with just: WORKSIGNAL OK"}]}' \
  --region us-east-1 \
  --content-type application/json \
  --accept application/json \
  /tmp/bedrock-test.json && cat /tmp/bedrock-test.json
```
**Expected:** Response with `"WORKSIGNAL OK"` in content.
**Frontend impact:** All 4 debate agents + material generation use Bedrock → debate cards, cover letter, customised resume.

### ✅ Task 2.4 — Test DynamoDB write + read
```bash
# Write a test record
aws dynamodb put-item \
  --table-name Users \
  --item '{"user_id":{"S":"test-user-001"},"email":{"S":"test@test.com"},"name":{"S":"Test User"}}' \
  --region us-east-1

# Read it back
aws dynamodb get-item \
  --table-name Users \
  --key '{"user_id":{"S":"test-user-001"}}' \
  --region us-east-1

# Clean up
aws dynamodb delete-item \
  --table-name Users \
  --key '{"user_id":{"S":"test-user-001"}}' \
  --region us-east-1
```

okay done!

### Task 2.5 — Test S3 upload + pre-signed URL  ← not confirmed
```bash
# Create a test file
echo "test resume content" > /tmp/test-resume.pdf

# Upload
aws s3 cp /tmp/test-resume.pdf s3://worksignal-documents-dev/resumes/test-user-001/test.pdf \
  --region us-east-1

# Generate pre-signed URL
aws s3 presign s3://worksignal-documents-dev/resumes/test-user-001/test.pdf \
  --expires-in 900 \
  --region us-east-1

# Clean up
aws s3 rm s3://worksignal-documents-dev/resumes/test-user-001/test.pdf --region us-east-1
```

---

## PHASE 3 — SES Email Setup · ✅ DONE
**Time:** 15 min | **Required for application sending**

### ✅ Task 3.1 — Verify sender email identity
```bash
# Verify the email address that will send applications (must match SES config)
aws ses verify-email-identity \
  --email-address lx.rose.lin@gmail.com \
  --region us-east-1

echo "Check your inbox for the verification email and click the link."

aws ses verify-email-identity \
  --email-address yeoshitan@gmail.com \
  --region us-east-1

echo "Check your inbox for the verification email and click the link."
```

### ✅ Task 3.2 — Add SES config to .env.local
```bash
# Add to frontend/.env.local:
# SES_FROM_EMAIL=lx.rose.lin@gmail.com
# SES_REGION=us-east-1
```

### Task 3.3 — Test SES send  ← not confirmed 
( i tested manually )
```bash
aws ses send-email \
  --from "lx.rose.lin@gmail.com" \
  --destination "ToAddresses=yeoshitan@gmail.com" \
  --message "Subject={Data='WORKSIGNAL SES Test'},Body={Text={Data='SES is working from us-east-1'}}" \
  --region us-east-1
```

---

## PHASE 4 — Run Integration Tests Against Real AWS · ❌ NOT STARTED
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

## PHASE 5 — Wire Dashboard Route to Real Data · ✅ DONE
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

## PHASE 6 — Seed Demo Data for Judges · ⚠️ SCRIPT WRITTEN — NOT YET RUN E2E
**Time:** ~5 min to run | **Required for a convincing demo**

Runs the complete live pipeline: MCF scan → pre-filter → 4 Bedrock debate agents per job → save to DynamoDB. This is the command that shows the full flow working end-to-end.

### ⚠️ Task 6.1 — Run the full pipeline (single command)  ← script complete; needs EXA key + E2E run to confirm

```bash
cd /Users/roselin/Desktop/SUPERAI/WORKSIGNAL/backend
npx tsx src/scripts/runFullFlow.ts
```

**What this does, step by step:**

1. **MCF Scan** — calls MyCareersFuture API for Rose's target roles (Data Engineer, ML Engineer, Software Engineer, etc.). Applies `sortBy: new_posting_date` + 14-day recency filter, caps at 20 jobs. Saves each job to DynamoDB `Jobs` table. Updates `Users.last_scan_at`.

2. **Pre-filter** — runs each job through the deterministic `preFilter()` against Rose's non-negotiables:
   - `salary_max >= $5000`
   - `employment_type = full_time`
   - `work_arrangement = hybrid_remote` (hybrid or fully-remote pass)
   - `location = Singapore`
   Jobs that fail are dropped silently (never shown to the user).

3. **Debate (4 agents in parallel per job)** — for each surviving job:
   - 🚀 Ambition — career growth & brand signal (Bedrock)
   - 🎯 Realism — skill match, salary fit, WLB flags (Bedrock)
   - 🛡  Risk — company stability, Glassdoor signal, red flags (Bedrock + Exa)
   - ⚡ Opportunity — urgency, timing, EP sponsorship (Bedrock)
   
   Master Orchestrator resolves to one of:
   - `apply_consensus` — all 4 agree → queued for send
   - `apply_with_caveat` — majority apply → queued with note
   - `deadlock_escalate` — 2-2 split → surfaced in `action_needed` on dashboard
   - `skip_consensus` — agents agree to skip
   - `veto_skip` — Risk agent blocked it

   Each job's record is saved to DynamoDB `AgentVerdicts` table with `master_decision` embedded.

4. **Dashboard reads real data** — after the script completes, `GET /api/dashboard` returns live DynamoDB data (sign in to test).

**Expected output:**
```
✓ Loaded credentials from .env.aws

── WORKSIGNAL — FULL PIPELINE FLOW ───────────────────
  Region : us-east-1
  Model  : us.anthropic.claude-sonnet-4-6
  User   : 109848448123861557723

── STEP 1 — MCF SCAN ──────────────────────────────────
  Scanning MyCareersFuture… (this may take a few seconds)
  ✓ Found 18 jobs from MCF (2.3s)
  ✓ Saved to DynamoDB Jobs table

  1. Data Engineer — Grab Singapore             ($6,000–$9,000 · full_time · hybrid · 3d old)
  2. ML Engineer — Sea Limited                  ($7,000–$11,000 · full_time · hybrid · 5d old)
  ...

── STEP 2 — PRE-FILTER (non-negotiables) ──────────────
  ✓ PASS  Data Engineer @ Grab Singapore
  ✓ PASS  ML Engineer @ Sea Limited
  ✗ FAIL  Data Analyst @ SomeAgency             blocked by: min_salary
  ...
  Survivors : 9 passed
  Rejected  : 9 filtered out

── STEP 3 — DEBATE (9 jobs) ───────────────────────────
  [1/9] Data Engineer @ Grab Singapore
        $6,000–$9,000 · 3d old
        🚀 Ambition   : apply (87)
        🎯 Realism    : apply (79)
        🛡  Risk       : safe (18)
        ⚡ Opportunity : act_now (91)
        ✅ APPLY — consensus  (28.4s)
        verdict_id: abc-123...
  ...
── SUMMARY ────────────────────────────────────────────
  Debated     : 9 jobs
  apply_consensus    — 5 job(s)
  deadlock_escalate  — 2 job(s)
  skip_consensus     — 2 job(s)
```

**Timing note:** Each job's 4 Bedrock agents run in parallel. Expect ~20–30s per job. With 5–10 survivors, total runtime is roughly 2–5 minutes.

**Re-runnable:** Running again is safe — Jobs and AgentVerdicts use `put-item` (overwrites existing records with same primary key). `scanIntervalMs: 0` bypasses the 24h gate so you can run on demand for the demo.

**Pre-requisites:**
- AWS credentials valid in `.env.aws` (session tokens expire ~1hr)
- User record exists in DynamoDB (run `seedDashboard.ts` first if not)
- Bedrock model access: `us.anthropic.claude-sonnet-4-6` in `us-east-1`

**If you get `ExpiredTokenException`:** Your session credentials expired. Update `.env.aws` and `~/.aws/credentials` with fresh tokens.

### ❌ Task 6.2 — Verify dashboard returns live data  ← pending runFullFlow.ts success

After running the full flow, sign in and check:
```bash
# While signed in at localhost:3000, open in browser:
http://localhost:3000/api/dashboard
```

Expected: `pipeline.total > 0`, `action_needed` contains deadlock jobs, `growth` shows skill gaps from the verdicts.

---

## PHASE 7 — Background Agent Lambdas (for EventBridge) · ❌ NOT STARTED
**Time:** 2–3 hrs | **Required for judges to see autonomous agents running**

These background jobs run every 3 hrs (debate scan), 30 min (Gmail poll), and weekly (recalibration). They need Lambda handlers that EventBridge can trigger.

### ❌ Task 7.1 — Create debate scan Lambda handler

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

### ❌ Task 7.2 — Create Gmail poll Lambda handler

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

### ❌ Task 7.3 — Create recalibration Lambda handler

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

### ❌ Task 7.4 — Create Lambda functions in AWS

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
  --environment "Variables={AWS_DEFAULT_REGION=us-east-1,EXA_API_KEY=$EXA_API_KEY,WORKSIGNAL_S3_BUCKET=worksignal-documents-dev,ENCRYPTION_SECRET=$ENCRYPTION_SECRET}" \
  --region us-east-1
```

### ❌ Task 7.5 — Wire EventBridge to Lambdas

```bash
# Create EventBridge rule for daily midnight-SGT debate scan
aws events put-rule \
  --name worksignal-debate-schedule \
  --schedule-expression "cron(0 16 * * ? *)" \
  --state ENABLED \
  --region us-east-1

# Add Lambda as target
aws events put-targets \
  --rule worksignal-debate-schedule \
  --targets "Id=1,Arn=arn:aws:lambda:us-east-1:YOUR_ACCOUNT:function:worksignal-debate-scan" \
  --region us-east-1

# Grant EventBridge permission to invoke Lambda
aws lambda add-permission \
  --function-name worksignal-debate-scan \
  --statement-id allow-eventbridge \
  --action lambda:InvokeFunction \
  --principal events.amazonaws.com \
  --source-arn arn:aws:events:us-east-1:YOUR_ACCOUNT:rule/worksignal-debate-schedule \
  --region us-east-1
```

**Test manual trigger:**
```bash
aws lambda invoke \
  --function-name worksignal-debate-scan \
  --payload '{}' \
  /tmp/lambda-test.json && cat /tmp/lambda-test.json
```

---

## PHASE 8 — Vercel Deployment · ❌ NOT STARTED
**Time:** 30 min | **Final step before submission**

### ❌ Task 8.1 — Deploy frontend to Vercel

```bash
cd /Users/roselin/Desktop/SUPERAI/WORKSIGNAL/frontend
npx vercel --prod
```

Note the deployment URL (e.g. `https://worksignal.vercel.app`).

### ❌ Task 8.2 — Set Vercel environment variables

In Vercel dashboard or via CLI, set all env vars:
```bash
vercel env add NEXTAUTH_URL production   # → https://worksignal.vercel.app
vercel env add NEXTAUTH_SECRET production
vercel env add GOOGLE_CLIENT_ID production
vercel env add GOOGLE_CLIENT_SECRET production
vercel env add AWS_DEFAULT_REGION production   # → us-east-1
vercel env add AWS_ACCESS_KEY_ID production
vercel env add AWS_SECRET_ACCESS_KEY production
vercel env add EXA_API_KEY production
vercel env add WORKSIGNAL_S3_BUCKET production  # → worksignal-documents-dev
vercel env add ENCRYPTION_SECRET production
vercel env add DEMO_MODE production              # → false (or true for demo safety)
```

### ❌ Task 8.3 — Update Google OAuth redirect URI

In Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client ID:
- Add `https://worksignal.vercel.app/api/auth/callback/google` to Authorised redirect URIs

### ❌ Task 8.4 — Redeploy after env vars
```bash
vercel --prod
```

---

## PHASE 9 — End-to-End Integration Verification · ❌ NOT STARTED
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
aws dynamodb describe-table --table-name worksignal-users --region us-east-1 | grep TableStatus

# 4. S3 reachable
aws s3 ls s3://worksignal-documents-dev --region us-east-1

# 5. Bedrock reachable
aws bedrock list-foundation-models --region us-east-1 --query "modelSummaries[0].modelId"

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

**`ResourceNotFoundException: Requested resource not found`** — Table doesn't exist in AWS yet, OR the name is wrong. The code hardcodes bare names (`Applications`, `Users`, `Jobs`, `AgentVerdicts`, `SkillGaps`, `RecalibrationLog`) as constants in each service file — they must be created with exactly those names. Also confirm `AWS_DEFAULT_REGION=us-east-1` in `.env.local` so the SDK hits the right region.

**`UnrecognizedClientException: The security token included in the request is expired`** — AWS session token expired. Re-run Phase 0.2.

**`ModelNotReadyException` or `AccessDeniedException` on Bedrock** — Model access not enabled on hackathon account. Go to AWS Console → Bedrock → Model access → Request access for Claude Sonnet.

**Next.js `Module not found: @worksignal/backend`** — Run `npm install` from the repo root to link workspace packages.

**Google OAuth `redirect_uri_mismatch`** — Add the exact Vercel callback URL to Google Cloud Console: `https://your-app.vercel.app/api/auth/callback/google`

---

## KEY FEATURE STABILITY ASSESSMENT

---

### FEATURE 1 (P0): Job Matching via Multi-Agent Debate

**What's built:**
| Sub-feature | Status | Notes |
|---|---|---|
| MCF scan (OpportunityScanner) | ✅ Works | Fetches past 14d, saves to Jobs DynamoDB |
| Pre-filter (non-negotiables) | ✅ Works | salary / employment_type / work_arrangement / location / EP checks |
| 4 Bedrock debate agents | ✅ Code complete | Ambition · Realism · Risk · Opportunity |
| Risk Agent Exa research |  | `EXA_API_KEY` not set → agent runs degraded (no company intel) |
| VerdictPersistence + DynamoDB | ✅ Code complete | Saves AgentVerdicts record; `runFullFlow.ts` embeds `master_decision` |
| `runFullFlow.ts` script | ✅ Written | Not yet run E2E to completion |
| Frontend `/api/jobs/[jobId]` | ✅ Wired | Returns job + all 4 agent verdicts + master decision from DynamoDB |
| Frontend debate log view | ✅ Page exists | `app/jobs/[jobId]/` — DebateCard, DebateCardList, DecisionSummary |
| Dashboard `action_needed` cards | ✅ Wired | Pulls deadlock jobs from DynamoDB |

- Trigger this flow on user's command via one button on frontend 
- When running is in progress, dashboard for the job, should be able to show agentic reasoning and full log of what the agent is doing 
  - api call, to get the jobs opportunities - gets call responses from mcf and exa search (based on user profile, with final prefiling )
  - multi agent debate 
  - log debate, and verdict, 

**MCF vs Exa for job sourcing:**
- **MCF (current):** Free, SG-native, structured fields. Filter happens in `OpportunityScanner` by keyword (target roles) + `postingDate` recency. MCF doesn't expose `work_arrangement` field — all jobs get `'any'` which pre-filter now passes through as `'unknown'` (cannot confirm violation). This is correct behaviour.
- **Exa fallback (`ExaFallback`):** Code exists in `discovery/exaFallback.ts`. It queries Exa with `"[role] Singapore jobs site:mycareersfuture.gov.sg"`. Needs `EXA_API_KEY`. Can be more targeted (embed salary, remote preference in query string) but results are less structured.
- **Recommendation:** MCF first (already working). Exa fallback only if MCF returns < 5 results.

**Steps to verify this feature works:**
```bash
# 1. Add EXA_API_KEY to both env files:
echo 'EXA_API_KEY=your_key_here' >> /Users/roselin/Desktop/SUPERAI/WORKSIGNAL/.env.aws
# Also add to frontend/.env.local

# 2. Re-seed user record (has all required fields now):
cd /Users/roselin/Desktop/SUPERAI/WORKSIGNAL/backend
npx tsx src/scripts/seedDashboard.ts

# 3. Run full pipeline:
npx tsx src/scripts/runFullFlow.ts
# Expected: MCF finds jobs → some pass pre-filter → 4 agents debate each →
#           verdicts saved to DynamoDB → summary printed

# 4. Check dashboard:
# Sign in at localhost:3000 → Dashboard should show action_needed cards
# Click a job card → debate log should show all 4 agent verdicts

# 5. Verify via API:
curl http://localhost:3000/api/dashboard   # (must be signed in)
```

**What to change:**
- ❌ Add `EXA_API_KEY` to `WORKSIGNAL/.env.aws` and `frontend/.env.local` — single biggest blocker
- Nothing else in the code needs changing; all pre-filter and agent fixes from this session are in

---

### FEATURE 2 (P1): Recalibration + Agent Feedback Loop

**What's built:**
| Sub-feature | Status | Notes |
|---|---|---|
| `RecalibrationEngine` backend | ✅ Exists | Tracks callback_rate, adjusts agent thresholds |
| `RecalibrationLog` DynamoDB table | ✅ Active | Empty — needs data |
| Email-based feedback (GmailMonitor) | ✅ Code exists | Polls Gmail for reply signals to sent applications |
| Recalibration Lambda handler | ❌ Not created | Phase 7.3 not done |
| Frontend direct feedback UI | ❌ Not implemented | User can't click thumbs up/down on a verdict yet |
| Weekly auto-recalibration trigger | ❌ Not wired | Needs EventBridge (Phase 7) |

**How the feedback loop works (design):**
1. WORKSIGNAL sends application via SES → Gmail records as sent
2. GmailMonitor polls inbox → detects reply (interview invite / rejection)
3. RecalibrationEngine records outcome → updates `agent_weights` thresholds over time
4. Next week's debate uses adjusted thresholds per user

**What to change to stabilise this:**
- ❌ **Create `backend/src/handlers/recalibrationHandler.ts`** (Phase 7.3 code is in the task file above)
- ❌ **Add a "feedback" button on the frontend job detail page** — POST to a `/api/jobs/[jobId]/feedback` route, write outcome to RecalibrationLog — this is new work (~1 hr)
- ❌ **Wire EventBridge** (Phase 7.5) to run recalibration weekly

**Steps to test current state** (without Lambda):
```bash
# You can manually trigger recalibration via the existing engine:
cd /Users/roselin/Desktop/SUPERAI/WORKSIGNAL/backend
npx tsx -e "
  import { config } from 'dotenv';
  // load env then:
  const { RecalibrationEngineImpl } = await import('./src/recalibration/recalibrationEngine.js');
  // ... not easily scriptable without a small test script
"
# Realistically: build the Lambda handler first (Task 7.3), then test it manually
```

---

### FEATURE 3 (P2): Growth Agent

**What's built:**
| Sub-feature | Status | Notes |
|---|---|---|
| `GrowthAgent` backend | ✅ Exists | Generates roadmaps from SkillGaps |
| `SkillGaps` DynamoDB table | ✅ Active | Empty — populated by debate agents flagging `key_gaps` |
| Frontend `/growth` page | ✅ Complete | SkillGapHeader, RoadmapPlan, WeekCard |
| `/api/growth` route | ✅ Wired | Returns SkillGaps from DynamoDB |

**Status:** Will work automatically once `runFullFlow.ts` completes — Realism agent records `key_gaps` which feed into SkillGaps table. No code changes needed.

**Steps to verify:**
1. Run `runFullFlow.ts` successfully (Feature 1 steps above)
2. Visit `localhost:3000/growth` — should show skill gaps flagged by the Realism agent

---

### FEATURE 4 (P2): Network Agent

**What's built:**
| Sub-feature | Status | Notes |
|---|---|---|
| `NetworkAgent` backend | ✅ Exists | Generates connection suggestions |
| Frontend `/network` page | ✅ Complete | ConnectionCard, CompanyHeader, UpcomingEvents |
| `/api/network` route | ⚠️ Partial | Returns `[]` — populated by NetworkAgent Lambda |
| Network Lambda handler | ❌ Not created | Phase 7 not done |

**Status:** Frontend page exists but shows empty until Lambda runs NetworkAgent and writes suggestions to a backing store.

**What to change:**
- ❌ After Phase 7 Lambda handlers are done, add network suggestions generation to the debate scan Lambda (or a separate scheduled trigger)
- The `/api/network` route in `frontend/app/api/network/` needs to read from DynamoDB once data exists

---

### WHAT TO DO RIGHT NOW (Jun 10 deadline order)

| # | Action | Time | Impact |
|---|--------|------|--------|
| 1 | **Add `EXA_API_KEY`** to `.env.aws` + `frontend/.env.local` | 2 min | Unblocks Risk agent + Exa test |
| 2 | **Add `ENCRYPTION_SECRET`** to `frontend/.env.local` | 2 min | Required for Gmail token encryption (auth flow) |
| 3 | **`npx tsx src/scripts/seedDashboard.ts`** | 1 min | Pushes complete user record to DynamoDB |
| 4 | **`npx tsx src/scripts/runFullFlow.ts`** | ~5 min | Proves the full pipeline works; fills DynamoDB with real verdicts |
| 5 | **Start Vercel deploy (Phase 8)** | 30 min | Required for judges to access the app |
| 6 | **Build Lambda handlers (Phase 7.1–7.3)** | 2–3 hr | Enables autonomous scanning + recalibration for demo |
| 7 | **Add direct feedback button on job detail** | 1 hr | Makes recalibration loop demonstrable without waiting for emails |

------

for task 2.5 i want to be able see it integrate with frontend, pending frontend onboarding 
upload via a profile page edit setting too