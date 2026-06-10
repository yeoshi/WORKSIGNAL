# WORKSIGNAL — Technical Specification v2.0
## Architecture & System Design Status
*Updated: Jun 10, 2026 | Reflects actual as-built codebase*

---

## 1. System Overview

WORKSIGNAL is a monorepo Next.js 14 application deployed on Vercel with an AWS serverless backend. The frontend and synchronous API are co-deployed on Vercel. Background agent work (debate scan, Gmail polling, recalibration) runs on AWS Lambda triggered by EventBridge — **these Lambda handlers do not yet exist** and are the primary deployment gap.

### Repository Structure

```
WORKSIGNAL/
├── backend/src/         Pure TypeScript service logic — NO Lambda handlers
├── frontend/            Next.js 14 app — deployed to Vercel
├── infra/src/           AWS resource definitions (TypeScript, NOT CDK/SAM)
├── shared/src/          Shared types, DynamoDBWrapper, S3Helper, crypto, logger
└── plan/                PRD, Tech Spec, Task docs
```

### Monorepo Workspaces

```json
{
  "@worksignal/backend":  "backend/",
  "@worksignal/shared":   "shared/",
  "@worksignal/infra":    "infra/"
}
```

The frontend imports directly from `@worksignal/backend` and `@worksignal/shared` via workspace linking. Vercel compiles everything together — there is no separate API Gateway for synchronous HTTP calls. Background work is the only thing that needs Lambda.

---

## 2. Technology Stack

| Layer | Technology | Region / Version |
|---|---|---|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS | Vercel |
| Auth | NextAuth.js, Google OAuth 2.0 (`gmail.readonly`) | — |
| Agent LLM | AWS Bedrock: `us.anthropic.claude-sonnet-4-6` | us-east-1 |
| Database | AWS DynamoDB (on-demand, 6 tables) | us-east-1 |
| File storage | AWS S3 (`worksignal-documents-dev`) | us-east-1 |
| Email sending | AWS SES | us-east-1 |
| Email reading | Gmail API (OAuth) | — |
| Job discovery | MyCareersFuture public API | `api.mycareersfuture.gov.sg/v2/search` |
| Company research | Exa API | `api.exa.ai/search` |
| Scheduling | AWS EventBridge | us-east-1 (not yet wired) |
| Background compute | AWS Lambda | us-east-1 (handlers not yet created) |
| Hosting | Vercel | Project: `worksignal_demo` |

---

## 3. Architecture

### 3.1 Request Flow — Synchronous (Live)

```
Browser
  │
  ▼ HTTPS
Vercel Edge / Serverless Functions
  ├── Next.js API Routes  (/api/*)           ← All synchronous HTTP lives here
  │     ├── /api/auth/[...nextauth]          ← NextAuth.js Google OAuth
  │     ├── /api/dashboard                  ← Aggregates DynamoDB (Users, Jobs, AgentVerdicts, Applications, SkillGaps, RecalibrationLog)
  │     ├── /api/agent/run                  ← SSE stream — runs full pipeline in-process
  │     ├── /api/jobs/[jobId]               ← Job + verdict detail
  │     ├── /api/jobs/[jobId]/send          ← Triggers SES send
  │     ├── /api/jobs/[jobId]/materials/    ← Resume/cover letter retrieval + regen
  │     ├── /api/pipeline                   ← Application list
  │     ├── /api/pipeline/[id]/debate       ← Debate detail for a past application
  │     ├── /api/onboarding/*               ← Profile CRUD
  │     ├── /api/growth                     ← SkillGaps from DynamoDB
  │     ├── /api/network                    ← Network suggestions (empty until Lambda runs)
  │     └── /api/brief                      ← RecalibrationLog from DynamoDB
  │
  └── AWS (us-east-1)
        ├── DynamoDB        ← Primary data store
        ├── S3              ← Resumes + generated PDFs
        ├── Bedrock         ← LLM inference (all agents + material generation)
        └── SES             ← Application email dispatch
```

### 3.2 Live Agent Run — SSE Stream

`GET /api/agent/run` is the key integration point. It runs the full debate pipeline inline in a Vercel serverless function and streams Server-Sent Events to the frontend in real-time.

```
Browser opens EventSource('/api/agent/run')
  │
  ▼ SSE stream
/api/agent/run (Vercel, maxDuration: 300s)
  │
  ├─ event: start          { run_id, user_name }
  ├─ event: scan_start
  │
  ├─ MCF API call          → up to 20 jobs
  ├─ event: scan_complete  { count, jobs[] }
  │
  ├─ preFilter() per job
  ├─ event: prefilter_result (per job)
  ├─ event: prefilter_summary
  │
  ├─ For each surviving job:
  │     ├─ event: debate_start
  │     ├─ Bedrock (4 agents in parallel)
  │     │     ├─ event: agent_result (ambition)
  │     │     ├─ event: agent_result (realism)
  │     │     ├─ event: exa_research (if EXA_API_KEY set)
  │     │     ├─ event: agent_result (risk)
  │     │     └─ event: agent_result (opportunity)
  │     ├─ DynamoDB: PUT AgentVerdicts
  │     ├─ event: db_persist (verdicts)
  │     ├─ resolveEnriched() → deterministic + Bedrock summary
  │     ├─ event: orchestrator_reasoning
  │     ├─ DynamoDB: UPDATE AgentVerdicts (master_decision)
  │     ├─ event: db_persist (master_decision)
  │     ├─ [if apply] Bedrock: generate resume + cover letter → S3
  │     ├─ event: materials_start / materials_complete / materials_failed
  │     └─ event: debate_result
  │
  └─ event: run_complete   { scanned, survivors, debated, elapsed_s, tally }
```

**If `NEXT_PUBLIC_API_URL` is set:** the `/api/agent/run` route proxies the SSE stream to that URL (API Gateway → Lambda). This is the production path that isn't built yet. Without it set, the pipeline runs in-process in the Vercel function.

### 3.3 Background Jobs — Planned (Not Yet Deployed)

```
AWS EventBridge (cron rules — NOT YET CREATED)
  │
  ├─ Every 3 hours   → Lambda: debateScanHandler     (scan → pre-filter → debate → DynamoDB)
  ├─ Every 30 min    → Lambda: gmailPollHandler       (Gmail API → classify → update Applications)
  └─ Weekly Sun 9am  → Lambda: recalibrationHandler   (analyse outcomes → adjust thresholds → brief)

Required Lambda files (DO NOT EXIST YET):
  backend/src/handlers/debateScanHandler.ts
  backend/src/handlers/gmailPollHandler.ts
  backend/src/handlers/recalibrationHandler.ts
  backend/src/handlers/growthAgentHandler.ts    (triggered by skill gap threshold)
  backend/src/handlers/networkAgentHandler.ts   (triggered by company applications count)
```

---

## 4. Component Map

### 4.1 Backend Services (`backend/src/`)

| Module | File | Status | Notes |
|---|---|---|---|
| **Onboarding** | `onboarding/onboardingService.ts` | ✅ Complete | Profile CRUD, calibration, auto-threshold adjustment |
| **Resume Parser** | `onboarding/resumeParser.ts` | ✅ Complete | PDF → S3 → Bedrock extraction |
| **Auth Service** | `auth/authService.ts` | ✅ Complete | Google OAuth, Gmail token AES-256-GCM encryption |
| **Opportunity Scanner** | `discovery/opportunityScanner.ts` | ✅ Complete | MCF API, 14-day lookback, saves to Jobs DynamoDB |
| **Exa Fallback** | `discovery/exaFallback.ts` | ✅ Complete | Exa-based job discovery when MCF fails |
| **Pre-Filter** | `preFilter/preFilter.ts` | ✅ Complete | Pure function, deterministic, 7 hard checks |
| **Filter Relaxation** | `preFilter/relaxation.ts` | ✅ Complete | Generates relaxation suggestions |
| **Ambition Agent** | `debate/agents/ambition.ts` | ✅ Complete | Bedrock, career ceiling focus |
| **Realism Agent** | `debate/agents/realism.ts` | ✅ Complete | Bedrock, callback probability |
| **Risk Agent** | `debate/agents/risk.ts` | ✅ Complete | Bedrock + Exa, company research |
| **Opportunity Agent** | `debate/agents/opportunity.ts` | ✅ Complete | Bedrock, timing/urgency |
| **Debate Machine** | `debate/debateMachine.ts` | ✅ Complete | Orchestrates 4 agents |
| **Verdict Validator** | `debate/verdictValidator.ts` | ✅ Complete | JSON schema + score range validation |
| **Verdict Persistence** | `debate/verdictPersistence.ts` | ✅ Complete | DynamoDB AgentVerdicts writes |
| **Master Orchestrator** | `orchestrator/decisionTree.ts` | ✅ Complete | Deterministic decision, Bedrock enrichment |
| **Material Generation** | `debate/materialGeneration.ts` | ✅ Complete | Resume + cover letter via Bedrock, S3 storage |
| **Application Sender** | `applications/applicationSender.ts` | ✅ Complete | SES send, redirect path |
| **Application Tracker** | `applications/applicationTracker.ts` | ✅ Complete | Status machine, pipeline list |
| **Status Machine** | `applications/statusMachine.ts` | ✅ Complete | State transitions (sent → callback/rejected/ghosted) |
| **Reply Progression** | `applications/replyProgression.ts` | ✅ Complete | Confidence-based status updates |
| **Gmail Monitor** | `inbox/gmailMonitor.ts` | ✅ Complete | Gmail API polling, fuzzy company matching |
| **Role Disambiguation** | `inbox/roleDisambiguation.ts` | ✅ Complete | Multi-application company disambiguation |
| **Growth Agent** | `growth/growthAgent.ts` | ✅ Complete | Roadmap generation via Exa |
| **Growth Trigger** | `growth/trigger.ts` | ✅ Complete | 3-distinct-job threshold logic |
| **Network Agent** | `network/networkAgent.ts` | ✅ Complete | Connection suggestions via Exa |
| **Network Trigger** | `network/trigger.ts` | ✅ Complete | 2-application threshold logic |
| **Recalibration Engine** | `recalibration/recalibrationEngine.ts` | ✅ Complete | Weekly accuracy compute + threshold adjustment |
| **Bedrock Wrapper** | `bedrock/invoke.ts` | ✅ Complete | Retry with exponential backoff, max 3 |
| **Lambda Handlers** | `handlers/` | ❌ Missing | Directory does not exist |
| **Step Functions ASL** | `infra/src/debateMachine.ts` | ✅ Defined | TypeScript definition only — NOT deployed to AWS |

### 4.2 Frontend API Routes (`frontend/app/api/`)

| Route | Method | Status | Backed By |
|---|---|---|---|
| `/api/auth/[...nextauth]` | ALL | ✅ Complete | NextAuth.js + Google OAuth |
| `/api/agent/run` | GET (SSE) | ✅ Complete | Inline pipeline run (or proxies to API GW) |
| `/api/dashboard` | GET | ✅ Complete | DynamoDB (Users, Jobs, AgentVerdicts, Applications, SkillGaps, RecalibrationLog) |
| `/api/jobs/[jobId]` | GET | ✅ Complete | DynamoDB Jobs + AgentVerdicts |
| `/api/jobs/[jobId]/send` | POST | ✅ Complete | ApplicationSender (SES) |
| `/api/jobs/[jobId]/skip` | POST | ✅ Complete | Updates job status |
| `/api/jobs/[jobId]/materials/resume` | GET | ✅ Complete | S3 pre-signed URL |
| `/api/jobs/[jobId]/materials/regenerate` | POST | ✅ Complete | Bedrock re-generation |
| `/api/pipeline` | GET | ✅ Complete | ApplicationTracker.list() → DynamoDB |
| `/api/pipeline/[id]/debate` | GET | ✅ Complete | ApplicationTracker.getDebate() |
| `/api/onboarding/*` | GET/POST | ✅ Complete | OnboardingService |
| `/api/onboarding/resume` | POST | ✅ Complete | S3 upload + resume parse |
| `/api/growth` | GET | ✅ Complete | DynamoDB SkillGaps |
| `/api/network` | GET | ⚠️ Stub | Returns `[]` until Lambda writes data |
| `/api/brief` | GET | ⚠️ Stub | Returns mock until RecalibrationLog has data |
| `/api/profile` | GET/PUT | ✅ Complete | OnboardingService |
| `/api/generate-cover-letter` | POST | ✅ Complete | Bedrock generation |
| `/api/generate-resume` | POST | ✅ Complete | Bedrock generation |
| `/api/generate-tailoring-notes` | POST | ✅ Complete | Bedrock generation |
| `/api/apply/draft` | POST | ✅ Complete | Draft application materials |
| `/api/apply/send` | POST | ✅ Complete | SES dispatch |

### 4.3 Frontend Pages (`frontend/app/(app)/`)

| Page | Route | Status | Components |
|---|---|---|---|
| Dashboard | `/dashboard` | ✅ Complete | AgentRunModal, ActionNeededCards (Kanban), AgentStatusBanner, PipelineKanban, InsightCards, RelaxationSuggestionPrompt |
| Job Detail | `/jobs/[jobId]` | ✅ Complete | DebateCard × 4, DecisionSummary, JobHeader, materials preview |
| Pipeline | `/pipeline` | ✅ Complete | PipelineTable, StatusBadge |
| Growth | `/growth` | ✅ Complete | SkillGapHeader, RoadmapPlan, WeekCard |
| Network | `/network` | ✅ Complete | ConnectionCard, CompanyHeader, UpcomingEvents |
| Brief | `/brief` | ✅ Complete | AgentAccuracyDisplay, SummaryMetrics, ThresholdAdjustments |
| Profile | `/profile` | ✅ Complete | Editable onboarding fields |
| Settings | `/settings` | ✅ Complete | Non-negotiables, priority ranking |
| Onboarding | `/onboarding` | ✅ Complete | 4 steps: SignIn → Resume → AboutYou → Targets |

### 4.4 Shared Utilities (`shared/src/`)

| Utility | Status | Notes |
|---|---|---|
| `DynamoDBWrapper` | ✅ Complete | AWS SDK v3, reads `AWS_DEFAULT_REGION` env var |
| `S3Helper` | ✅ Complete | Pre-signed URL generation, upload |
| `crypto` | ✅ Complete | AES-256-GCM encryption for Gmail OAuth tokens |
| `logger` | ✅ Complete | Structured logging |
| Shared types | ✅ Complete | User, Job, Application, Verdict, Growth, Recalibration, Relaxation |

---

## 5. Data Models

### DynamoDB Tables (us-east-1)

**Users** — PK: `user_id` (Google OAuth sub)
- Profile, non-negotiables, agent_weights, gmail_oauth_token (AES-256-GCM encrypted), last_scan_at

**Jobs** — PK: `job_id` | GSI: `user_id-index`
- MCF data: company, role_title, salary_min/max, jd_text, employment_type, work_arrangement, ep_sponsorship_signal, mcf_listing_days

**AgentVerdicts** — PK: `verdict_id` | GSI: `job_id-user_id-index`
- All 4 agent verdicts + master_decision (decision class, summary, agents_for/against, resume_instructions, cover_letter_angle, user_action_required, orchestrator_verdict)
- agent_failures[] for degraded resolution tracking

**Applications** — PK: `application_id` | GSI: `user_id-company-index`
- Status machine: `sent | opened | callback | rejected | ghosted | redirected_external | needs_review | delivery_failed`
- customised_resume_s3_key, cover_letter_text, email_thread_id, classification_confidence

**SkillGaps** — PK: `user_id` (HASH) + `skill` (RANGE)
- times_flagged, flagged_job_ids (set for distinct-job counting), roadmap, status

**RecalibrationLog** — PK: `recalibration_id` | GSI: `user_id-week_of-index`
- Weekly metrics, per-agent accuracy, adjustments_made, emergency flag, brief_text

### S3 (`worksignal-documents-dev`, us-east-1)

```
resumes/{user_id}/original.pdf               ← uploaded resume
resumes/{user_id}/jobs/{job_id}/resume.pdf   ← customised resume
resumes/{user_id}/jobs/{job_id}/cover.txt    ← cover letter
```

All objects private. Frontend receives time-limited pre-signed URLs.

---

## 6. Authentication & Security

- **Google OAuth 2.0** via NextAuth.js. Scopes: `openid email profile gmail.readonly`.
- Gmail decline: sign-in still completes; `inbox_monitoring_available = false` stored.
- **Gmail refresh token** encrypted AES-256-GCM (key: `ENCRYPTION_SECRET`, 32-byte hex) before DynamoDB storage.
- All user-data API endpoints require authenticated NextAuth session mapped to Google `sub`.
- S3 objects private; never public. Pre-signed URLs for frontend access.
- External content (MCF, Exa, Gmail) treated as untrusted input — never executed, validated before persistence.

---

## 7. AWS Configuration

| Service | Configuration |
|---|---|
| Region | us-east-1 |
| Bedrock model | `us.anthropic.claude-sonnet-4-6` |
| DynamoDB billing | PAY_PER_REQUEST (on-demand) |
| S3 bucket | `worksignal-documents-dev` (versioning enabled, public access blocked) |
| SES verified identities | `lx.rose.lin@gmail.com`, `yeoshitan@gmail.com` |
| EventBridge rules | NOT YET CREATED |
| Lambda functions | NOT YET CREATED |
| Step Functions | NOT YET DEPLOYED (ASL defined in TypeScript) |

---

## 8. Environment Variables

### `frontend/.env.local`

| Variable | Status | Notes |
|---|---|---|
| `NEXTAUTH_URL` | ✅ Set | `http://localhost:3000` (dev); needs Vercel URL for prod |
| `NEXTAUTH_SECRET` | ✅ Set | — |
| `GOOGLE_CLIENT_ID` | ✅ Set | — |
| `GOOGLE_CLIENT_SECRET` | ✅ Set | — |
| `AWS_DEFAULT_REGION` | ✅ Set | `us-east-1` |
| `AWS_ACCESS_KEY_ID` | ✅ Set | — |
| `AWS_SECRET_ACCESS_KEY` | ✅ Set | — |
| `AWS_SESSION_TOKEN` | ⚠️ Expires ~1hr | Refresh when `ExpiredTokenException` |
| `WORKSIGNAL_S3_BUCKET` | ✅ Set | `worksignal-documents-dev` |
| `SES_FROM_EMAIL` | ✅ Set | `lx.rose.lin@gmail.com` |
| `SES_REGION` | ✅ Set | `us-east-1` |
| `BEDROCK_MODEL_ID` | ✅ Set | `us.anthropic.claude-sonnet-4-6` |
| `DEMO_MODE` | ✅ Set | `false` (real data mode) |
| `EXA_API_KEY` | ❌ Missing | Risk/Opportunity degraded without it |
| `ENCRYPTION_SECRET` | ❌ Missing | Auth flow fails without it |
| `NEXT_PUBLIC_API_URL` | Not set | Not needed unless Lambda backend deployed |

---

## 9. Deployment

### Current State (Vercel)

```
Project: worksignal_demo  (prj_SgQgrlFgy2xALDaqQoMnYNsdu8rw)
Deploy command: cd frontend && npm run build
Output dir: frontend/.next
Vercel root: /frontend
```

The frontend (including all synchronous API routes) deploys successfully to Vercel. The agent run pipeline (`/api/agent/run`) runs in-process as a Vercel serverless function with `maxDuration: 300s`.

### Lambda Backend (Not Yet Built)

When built, the Lambda backend will handle:
1. **Scheduled debate scan** (every 3 hours per user) — `debateScanHandler.ts`
2. **Gmail polling** (every 30 minutes) — `gmailPollHandler.ts`
3. **Weekly recalibration** (Sunday 9am SGT) — `recalibrationHandler.ts`
4. **Growth Agent** (triggered when skill gap count ≥ 3) — `growthAgentHandler.ts`
5. **Network Agent** (triggered when company application count ≥ 2) — `networkAgentHandler.ts`

EventBridge → Lambda flow:
```
EventBridge rule (cron) → Lambda invoke → service logic → DynamoDB/SES/Bedrock/Exa
```

The agent/run SSE route also supports proxying to an API Gateway URL (`NEXT_PUBLIC_API_URL`) for long-running Lambda-backed execution, bypassing Vercel's 300s limit.

---

## 10. Test Coverage

| Suite | Count | Status |
|---|---|---|
| Unit tests | ~400 | ✅ Passing |
| Integration tests (mocked AWS) | ~80 | ✅ Passing |
| E2E test (`fullFlow.integration.test.ts`) | 1 full pipeline | ✅ Passing (mocked services) |
| Property-based tests (fast-check) | 22 properties | ✅ Passing |
| **Total** | **508** | **All pass** |

**Not yet run against live AWS:**
- `opportunityScanner.integration.test.ts` (real MCF)
- `debateMachine.integration.test.ts` (real Bedrock)
- `recalibrationEngine.integration.test.ts` (real DynamoDB)

---

## 11. Key Design Decisions

### Why Vercel-inline Pipeline (not Lambda-first)

For the hackathon demo, running the pipeline inline in the Vercel function via SSE means:
- Zero Lambda deployment complexity
- Real-time streaming to the frontend
- The Vercel 300s limit is sufficient for 5-10 jobs (~20-30s each with parallel Bedrock)
- Lambda backend path exists in the code for production scale (proxy via `NEXT_PUBLIC_API_URL`)

### Why No Step Functions (yet)

Step Functions ASL is defined in `infra/src/debateMachine.ts` but not deployed. For the hackathon, the debate machine runs as TypeScript code (not as an AWS state machine). The visual Step Functions diagram can be shown in the pitch from the code/design docs without live AWS execution.

### Why MCF over Exa for Job Discovery

MCF API: free, SG-native, structured fields, no auth. Exa fallback exists in `discovery/exaFallback.ts`. MCF is the default; Exa fallback activates only when MCF returns < 5 results. MCF doesn't expose `work_arrangement` field — pre-filter treats it as `unknown` (passes through as can't confirm violation).

### Why Deterministic Master Orchestrator

The decision class (`apply_consensus`, `deadlock_escalate`, etc.) is computed by pure TypeScript code — not by Bedrock. Bedrock only writes human-readable summaries and resume instructions. This makes the decision:
- Testable (property-based tests, 100 iterations each)
- Reproducible (same input always → same decision)
- Auditable (user sees exactly why)

---

## 12. Deployment Gaps Summary

| Gap | Impact | Effort |
|---|---|---|
| `EXA_API_KEY` missing | Risk Agent runs degraded (no company research); Growth/Network agents can't search | 2 min |
| `ENCRYPTION_SECRET` missing | Gmail token encryption fails; auth flow broken | 2 min |
| Lambda handlers don't exist | No autonomous scanning; no Gmail polling; no weekly recalibration | 2-3 hrs |
| EventBridge rules not created | Scheduled agent runs don't happen | 30 min (after Lambda) |
| Step Functions not deployed | Visual workflow not in AWS console (pitch only) | 1-2 hrs |
| `NEXTAUTH_URL` = localhost | Google OAuth redirect fails on Vercel prod | 5 min |
| Vercel prod env vars | Missing production values | 30 min |

---

*WORKSIGNAL Tech Spec v2.0 — Updated Jun 10, 2026*

---

Then a pure deterministic tree (decisionTree.ts) maps their verdicts:

If Risk = avoid → veto_skip (absolute, overrides everything)
Otherwise count how many agents are "apply-equivalent":
Ambition: apply
Realism: apply (caution/skip count as dissent)
Risk: safe (caution counts as dissent)
Opportunity: act_now or monitor
Count n → decision:
n=4 → apply_consensus
n=3 → apply_with_caveat (records the dissenter's key_argument)
n=2 → deadlock_escalate
n≤1 → skip_consensus
No Bedrock involved in the decision itself — it's pure code from scores.

i want the orchestrator, to NOT JUST be a decision tree, but i want it gather all the information 

- from the 4 agents' decisions
- and from the user profile 

- make a final recommendation to APPLY or HOLD and upskill first 
- provide its reasoning as well. 