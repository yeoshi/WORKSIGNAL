# WORKSIGNAL — Product Requirements Document v2.0
## SuperAI NEXT Hackathon 2026 | Team: Yeo Shi + Rose

> **Product:** WORKSIGNAL
> **Slogan:** *In a market full of noise, find the roles worth your move.*
> **One-liner:** Six AI agents that debate, research, upskill, and connect you — so you only see the jobs worth your time, with everything prepared to apply.
> **Status as of:** Jun 10, 2026

---

## 1. Problem Statement

### The Singapore Paradox

Singapore has more jobs than jobseekers (vacancy-to-unemployed ratio 1.35), yet only 51.9% of fresh graduates from the 2025 cohort secured employment by mid-year. 60% describe their search as "somewhat difficult" or "very difficult."

The problem isn't supply. It's **matching quality**.

### Why Existing Tools Fail

Every competitor optimises for volume: JobCopilot (50 apps/day), Sonara (10x your applications), JobHire.ai (200 apps for $49). All share 6 universal failures:

| Failure | Evidence |
|---|---|
| Keyword match, not fit | Roles mismatch level, skills, location |
| No reasoning transparency | "Little visibility into why jobs stay pending" |
| No company research | Scam job exposure, no risk screening |
| No learning from outcomes | No feedback loop |
| US-centric | "Effectiveness drops significantly in Asia" |
| No upskilling guidance | All stop at "apply" |

### WORKSIGNAL's Thesis

More applications ≠ more interviews. Better applications = more interviews.

Six agents debate every job before the user sees it. They research companies, track outcomes, build upskill roadmaps, surface connections, and recalibrate weekly.

---

## 2. Target User

**Primary:** Singaporean early-career professionals (fresh grads + 1-3 years experience), actively job searching.

**Secondary:** Mid-career (3-7 yrs), senior professionals (8+ yrs), foreigners seeking EP-sponsored roles.

---

## 3. Feature Scope & Current Status

### MVP Features (36-hour build)

| Feature | Priority | Build Status | Notes |
|---|---|---|---|
| Google OAuth onboarding | P0 | ✅ Complete | Gmail read scope requested |
| Resume upload + parsing | P0 | ✅ Complete | PDF → S3 → Bedrock extraction |
| Career stage + residency calibration | P0 | ✅ Complete | Threshold auto-adjustment |
| Targets + non-negotiables setup | P0 | ✅ Complete | Priority ranking, hard filters |
| Edge case detection (fresh grad / senior / EP) | P0 | ✅ Complete | Agent threshold adjustment |
| Opportunity scanning (MCF API) | P0 | ✅ Complete | 14-day lookback, per-user targets |
| Non-negotiable pre-filter | P0 | ✅ Complete | Silent discard, salary/type/EP checks |
| 4-agent debate engine | P0 | ✅ Complete | Ambition, Realism, Risk, Opportunity via Bedrock |
| Master Orchestrator | P0 | ✅ Complete | Deterministic decision tree + enriched Bedrock reasoning |
| Resume customisation | P0 | ✅ Complete | Per-JD tailoring via Bedrock, S3 storage |
| Cover letter generation | P0 | ✅ Complete | Per-JD, S3 storage |
| Job detail view (debate screen) | P0 | ✅ Complete | Debate cards, orchestrator summary |
| Application send via SES | P0 | ✅ Complete | SES wired, both emails verified |
| Application pipeline tracker | P0 | ✅ Complete | Status machine, UI complete |
| Gmail callback detection | P0 | ✅ Code complete | GmailMonitor built, Lambda not yet deployed |
| **Live agent run with SSE stream** | P0 | ✅ Complete | Real-time debate log via `/api/agent/run` |
| Growth Agent | P1 | ✅ Code + UI complete | Triggers on 3x skill gap; Exa roadmap; Lambda needed |
| Network Agent | P1 | ✅ Code + UI complete | Triggers on 2+ applications to same company; Lambda needed |
| Self-recalibration engine | P1 | ✅ Code complete | RecalibrationEngine built; Lambda + EventBridge needed |
| Weekly brief screen | P1 | ✅ UI complete | Frontend complete; needs real RecalibrationLog data |

### Out of Scope (confirmed)
- Interview prep agent
- Real-time market signals dashboard
- WhatsApp/Telegram notifications
- Browser extension
- Stripe/payments, mobile app
- Salary negotiation assistant

---

## 4. The 6 Agents

### 4.1 AMBITION AGENT (Debate)
**Mandate:** Maximise career ceiling. Push to stretch. Bias: lean toward applying.
**Evaluates:** Seniority step-up, salary lift, AI-adjacent skills, company prestige, progression clarity, automation-proofing.
**Output:** `apply | skip`, ambition_score (0-100), reasoning, key_argument.

### 4.2 REALISM AGENT (Debate)
**Mandate:** Optimise for actual callback probability. Conservative — 10 strong > 50 weak.
**Evaluates:** % of JD requirements met, experience gap severity, WLB red flags, salary benchmark alignment.
**Output:** `apply | skip | caution`, match_score, key_gaps[], work_life_flags[], reasoning, key_argument.
**Threshold:** 80% match by default; 70% for fresh grads; 85% for seniors.

### 4.3 RISK AGENT (Debate)
**Mandate:** Protect from bad companies. Bias: skeptical — assume there's a reason every role is open.
**Evaluates:** Company financials, layoffs (Exa), Glassdoor rating, culture red flags, contract vs perm signals, EP sponsorship track record.
**Output:** `safe | caution | avoid`, risk_score, red_flags[] with sources, glassdoor_score.
**Note:** `avoid` triggers absolute Master veto — no override possible.

### 4.4 OPPORTUNITY AGENT (Debate)
**Mandate:** Detect timing advantages and urgency.
**Evaluates:** Posting age, company hiring speed, funding/expansion signals (Exa), first-mover advantage, FCF 14-day rule for EP holders.
**Output:** `act_now | monitor | no_advantage`, urgency_score, timing_factors[].

### 4.5 GROWTH AGENT (Background)
**Mandate:** Build upskilling roadmaps when skill gaps repeat.
**Trigger:** Realism Agent flags same skill gap across 3+ distinct jobs.
**Actions:** Exa search for SkillsFuture courses, free courses, portfolio projects, SG events.
**Output:** 4-week roadmap with linked resources, projected match score improvement.
**Status:** Code complete, frontend complete. Lambda handler not yet deployed.

### 4.6 NETWORK AGENT (Background)
**Mandate:** Find strategic connections to increase interview chances.
**Trigger:** User applies to 2+ roles at same company OR callback rate low after 2 weeks.
**Actions:** Exa search for people, alumni, community members, SG networking events.
**Output:** ≤3 connection suggestions (alumni → community → cold), personalised outreach drafts.
**Status:** Code complete, frontend complete. Lambda handler not yet deployed.

---

## 5. Master Orchestrator

Decision is **deterministic** (pure code), enriched with Bedrock-generated prose. Evaluated in order:

1. **Risk veto:** Risk = `avoid` → `veto_skip`. No override.
2. **Count apply-equivalent verdicts (n):**
   - n = 4 → `apply_consensus`
   - n = 3 → `apply_with_caveat` (records dissent)
   - n = 2 → `deadlock_escalate` (surfaced to user)
   - n ≤ 1 → `skip_consensus`
3. **Realism floor:** If Realism `match_score < 50` on any apply decision → `user_action_required = true`
4. **Fast-track:** Opportunity = `act_now` + 2+ others apply → top of review queue

**Apply-equivalent mapping:**

| Agent | Apply-equivalent | Not apply-equivalent |
|---|---|---|
| Ambition | `apply` | `skip` |
| Realism | `apply` | `skip`, `caution` |
| Risk | `safe` | `caution`, `avoid` |
| Opportunity | `act_now`, `monitor` | `no_advantage` |

**Recalibration Agent (FUTURE)** — not yet deployed as Lambda. Will adjust per-agent thresholds weekly based on callback outcomes.

---

## 6. Core User Flow

```
ONE-TIME SETUP
1. Sign in with Google (OAuth, gmail.readonly scope)
2. Upload resume (PDF → S3 → Bedrock parse → structured profile)
3. Career stage + residency → auto-calibrate agent thresholds
4. Set targets: roles, industries, dream companies, priority ranking
5. Set non-negotiables: salary floor, employment type, work arrangement

ON-DEMAND / BACKGROUND AGENT RUN
6. User triggers "Run Agents" OR EventBridge fires every 3 hours (pending Lambda)
7. Opportunity Scanner: MCF API → Jobs DynamoDB (14-day lookback)
8. Pre-filter: silent discard of non-negotiable violations
9. For each surviving job: 4 agents run in parallel (Bedrock)
10. Master Orchestrator resolves decision
11. apply_consensus / apply_with_caveat → generate resume + cover letter (Bedrock + S3)
12. deadlock_escalate → surfaces on dashboard for user decision
13. skip_consensus / veto_skip → logged, not shown

LIVE AGENT RUN (IMPLEMENTED)
- Dashboard "Run Agents" button triggers SSE stream
- Frontend renders real-time debate log: scan → pre-filter → per-agent verdicts → orchestrator reasoning → persist
- Results appear as kanban cards on dashboard

USER REVIEWS & SENDS
14. Dashboard shows action_needed cards for jobs requiring review
15. Job detail view: 4 debate cards + Master decision + resume/cover letter preview
16. User edits cover letter → one-tap Send via SES

CONTINUOUS LEARNING (PLANNED)
17. Gmail Monitor polls inbox every 30 min for callbacks/rejections/ghosts
18. RecalibrationEngine runs weekly (Sunday 9am SGT) → adjusts thresholds
19. Growth Agent activates when skill gap repeated 3+ times
20. Network Agent activates when 2+ applications to same company
```

---

## 7. Non-Negotiable Pre-Filter

Runs before any agent debate. Violations result in silent discard — no user record, no debate compute spent.

```
Pre-filter checks:
1. salary_max >= user.min_salary
2. employment_type ∈ user's selected types
3. work_arrangement compatible with preference
4. location = Singapore (fully-remote: SG-based employer or SG timezone only)
5. Custom dealbreakers (no night shifts, no travel, etc.)
6. If need_sponsorship: salary_max >= EP floor ($5,600 or $6,200 for finance)
7. If need_sponsorship: job indicates EP sponsorship available
```

If ALL jobs in a run are filtered → notify user "filters may be too strict" → suggest a relaxation with evidence (e.g. "8 of 12 jobs would pass if min salary dropped to $5,500"). Relaxation requires explicit user approval — non-negotiables never auto-change.

---

## 8. Edge Cases

| User Type | Detection | Agent Adjustments |
|---|---|---|
| Fresh graduate | Career stage = `fresh_grad` | Realism threshold → 70%; Ambition: first job IS the stretch; Growth immediately active |
| Senior (8+ yrs) | Career stage = `senior` | Realism threshold → 85%; Network most aggressive; Focus on title/team/P&L |
| Needs EP sponsorship | Residency = `need_sponsorship` | EP salary floor enforced; Risk checks sponsor history; Opportunity checks FCF 14-day rule |
| Career switcher | Career stage = `career_switcher` + from/to | Transferable skills weighted; Growth builds transition roadmap; full resume narrative reframe |

---

## 9. Design System

| Element | Spec |
|---|---|
| Font | Inter (400/500/600/700), JetBrains Mono for data |
| Brand | Indigo-600 `#4F46E5` |
| Backgrounds | Primary `#FAFAFA`, Card `#FFFFFF`, Section `#F5F5F5` |
| Agent colours | Ambition `#DC2626`, Realism `#2563EB`, Risk `#D97706`, Opportunity `#059669`, Growth `#7C3AED`, Network `#0891B2` |
| Status colours | Callback `#10B981`, Rejected `#EF4444`, Waiting `#6B7280`, Ghosted `#94A3B8` |
| Motion | Staggered card entrance animation (100ms delay per card) |

---

## 10. Screens Inventory

| Screen | Status | Notes |
|---|---|---|
| Landing page | ✅ Complete | Sign in with Google |
| Onboarding (4 steps) | ✅ Complete | SignIn → Resume → AboutYou → Targets |
| Dashboard | ✅ Complete | Kanban cards, agent status, live run modal |
| Job Detail / Debate View | ✅ Complete | 4 debate cards + orchestrator summary + resume/cover letter |
| Pipeline View | ✅ Complete | Table with status badges, click → debate |
| Growth Roadmap | ✅ Complete | SkillGapHeader, RoadmapPlan, WeekCard |
| Network Suggestions | ✅ Complete | ConnectionCard, CompanyHeader, UpcomingEvents |
| Weekly Brief | ✅ Complete | AgentAccuracy, SummaryMetrics, ThresholdAdjustments |
| Profile / Settings | ✅ Complete | Edit onboarding data post-setup |

---

## 11. Database Schema (DynamoDB, us-east-1)

Six tables, all `PAY_PER_REQUEST`. Table names are bare strings (no prefix).

| Table | Partition Key | GSI | Status |
|---|---|---|---|
| `Users` | `user_id` | — | ✅ ACTIVE |
| `Jobs` | `job_id` | `user_id-index` | ✅ ACTIVE |
| `AgentVerdicts` | `verdict_id` | `job_id-user_id-index` | ✅ ACTIVE |
| `Applications` | `application_id` | `user_id-company-index` | ✅ ACTIVE |
| `SkillGaps` | `user_id` (HASH) + `skill` (RANGE) | — | ✅ ACTIVE |
| `RecalibrationLog` | `recalibration_id` | `user_id-week_of-index` | ✅ ACTIVE |

---

## 12. External Integrations

| Service | Purpose | Status |
|---|---|---|
| MyCareersFuture API | Job discovery (SG-native, no auth) | ✅ Working |
| AWS Bedrock (Claude Sonnet) | All 6 agent LLM calls + material generation | ✅ Working (us-east-1) |
| AWS DynamoDB | Persistence | ✅ All 6 tables ACTIVE |
| AWS S3 | Resume + generated document storage | ✅ Bucket exists |
| AWS SES | Application email sending | ✅ Both emails verified |
| Exa API | Company research (Risk Agent), Growth Agent, Network Agent | ⚠️ Key missing |
| Gmail API (OAuth) | Callback/rejection detection | ✅ Code complete; Lambda not deployed |
| AWS EventBridge | Scheduled triggers (debate scan, Gmail poll, recalibration) | ❌ Not wired |
| AWS Lambda | Background job handlers | ❌ Handlers not created |
| Vercel | Frontend hosting | ✅ Deployed (worksignal_demo) |

---

## 13. Failure Handling

| Failure | Recovery |
|---|---|
| MCF API down | Fall back to Exa-only job search |
| Exa returns nothing | Risk Agent: `caution` noting insufficient data |
| Bedrock rate limit | Retry with exponential backoff, max 3 |
| Single agent fails | Master resolves on remaining agents; records `agent_failures` |
| All agents fail | No decision produced; logged only |
| 2-2 deadlock | `deadlock_escalate` → surfaced to user |
| Resume customisation fails | Base resume attached; `customisation_applied = false` |
| Gmail token expired | Prompt re-auth; queue retry |
| Low classification confidence (<60) | `needs_review` status |
| No reply for 14 days | `ghosted` status |
| SES bounce | `delivery_failed` + user notification |
| All jobs filtered in a run | Notify user + Filter_Relaxation_Suggestion (requires explicit approval) |
| Zero callbacks for 3 weeks | Emergency recalibration + user alert |

---

## 14. Self-Recalibration Engine

**Trigger:** Weekly EventBridge (Sunday 9am SGT). Not yet deployed.

**Logic:**
1. Fetch last 7 days' applications + current statuses
2. Callback → agents who said `apply` were RIGHT; Rejection → WRONG
3. Calculate per-agent accuracy
4. Identify patterns (Ambition too aggressive? Realism too conservative?)
5. Adjust thresholds (e.g. Ambition 70% → 82%)
6. Generate brief text via Bedrock
7. Save to `RecalibrationLog`; update `Users.agent_weights`
8. Notify: "Weekly brief ready"

**Emergency recalibration:** if 3 consecutive weeks have zero callbacks → emergency run + alert.

---

*WORKSIGNAL PRD v2.0 — Updated Jun 10, 2026*
*Reflects actual as-built system status*
