# WORKSIGNAL — Full Product Requirements Document

## SuperAI NEXT Hackathon 2026 | Team: Yeo Shi + Rose

> **Product:** WORKSIGNAL
> **Slogan:** *In a market full of noise, find the roles worth your move.*
> **One-liner:** Six AI agents that debate, research, upskill, and connect you — so you only see the jobs worth your time, with everything prepared to apply.

---

## 1. Problem Statement

### The Singapore paradox

In 2026, Singapore has more jobs than jobseekers — a vacancy-to-unemployed ratio of 1.35. Yet only 51.9% of fresh graduates from the 2025 cohort secured employment by mid-year. A CNA poll of 105 fresh grads found 26.7% had not secured full-time jobs, and 60% described their search as "somewhat difficult" or "very difficult."

The problem isn't supply. It's matching.

### Why matching is broken

- Singapore employers spend less than 60 seconds on a first pass of a fresh graduate CV
- The market is "not in decline, it is simply becoming more selective" — hiring intent dropped from 54.6% to 44.6% of firms between Feb and Mar 2026
- "Demonstrated capability, strategic self-presentation, and immediate productivity" now matter more than academic pedigree
- Graduate employment within 6 months of final exams declined from 89.6% (2023) to 87.1% (2024)

### Why existing tools make it worse

Every tool in this category — JobCopilot, Sonara, ClickHired, JobHire.ai — optimises for volume:

- JobCopilot: "50 applications per day" → 3.8/5 Trustpilot, users report scam jobs and irrelevant matches
- Sonara: "10x your job applications" → users report "Over 50% of submissions failed to send." An IT professional received recommendations for "clerks and Doctors"
- JobHire.ai: "200 applications for $49" → users getting "calls for Junior roles when I have 10 years of experience"
- None of them research company health, track callbacks, learn from outcomes, or serve the Singapore market specifically

**The 6 universal failures:**

| # | What they get wrong | Evidence |
|---|---|---|
| 1 | Match on keywords, not fit | "Weak matching that ignores skills, level, and location" |
| 2 | No reasoning transparency | "Little visibility into why jobs stay pending" |
| 3 | No company research | Scam job exposure, no risk screening |
| 4 | No learning from outcomes | "No way to provide feedback that I got an interview" |
| 5 | US-centric | "If you are looking for work in Asia, effectiveness drops significantly" |
| 6 | No upskilling guidance | All stop at "apply" — none help you become more employable |

### WORKSIGNAL's thesis

More applications ≠ more interviews. Better applications = more interviews.

WORKSIGNAL's agents argue about whether you should apply at all. They research every company. They track what works and what doesn't. They upskill you for jobs you can't get yet. They connect you to the right people. They get smarter every week.

**Pitch copy:**
```
THEM: "We sent 50 applications today!"
  → Poor matches, scam jobs, bot detection, zero learning

US: "Our agents debated 50 jobs. 3 are worth your time."
  → Company researched, resume customised, reasoning shown
  → Tracks callbacks, learns, recalibrates weekly
  → Upskills you for jobs you can't get yet
```

---

## 2. Target User

**Primary:** Singaporean early-career professionals (fresh grads + 1-3 years experience), aged 22-28, actively job searching.

**Secondary personas (edge cases — designed for but not demo focus):**
- Mid-career professionals (3-7 years) exploring strategic moves or career switches
- Senior professionals (8+ years) seeking leadership roles
- Foreigners seeking Employment Pass-sponsored roles in Singapore

---

## 3. What SG Job Seekers Actually Care About

Research from Deloitte 2025 Singapore Gen Z & Millennial Survey, Randstad, Robert Walters, ManpowerGroup:

**The trifecta:** Money, Meaning, Well-being

| Factor | Data | Source |
|---|---|---|
| Salary & benefits | 57% of Gen Z would leave for higher pay | Randstad |
| Work-life balance | Most important factor for ALL generations | Randstad |
| Flexible hours | 82% of SG professionals value this | Robert Walters |
| Career growth | Top priority when choosing employer | Deloitte SG 2025 |
| Job security | 39% put stability as top non-monetary factor (up from 31%) | KPMG |
| Purpose alignment | 89% of Gen Zs say purpose matters to job satisfaction | Deloitte SG 2024 |
| AI-proofing | 75% say GenAI will push them toward less automatable roles | Deloitte SG 2025 |
| Learning & development | Prioritised when choosing employer, but only 8% want leadership | Deloitte SG 2025 |

**These factors inform how each agent evaluates jobs — not just skills match.**

---

## 4. Core User Flow

```
ONE-TIME SETUP (~10 minutes)
1. Sign up via Google OAuth (grants Gmail read access)
2. Upload resume (PDF)
3. Tell us about you: career stage + residency status
4. Set targets: roles, industries, dream companies, priorities
5. Set non-negotiables: hard filters agents can never override

AGENTS RUN 24/7 IN BACKGROUND
6. Opportunity Agent scans MyCareersFuture API + Exa every 3 hours
7. Non-negotiable pre-filter eliminates invalid matches silently
8. For each viable role, 4 debate agents evaluate in parallel
9. Master Orchestrator resolves: apply / skip / escalate to user
10. Growth Agent activates when skill gaps detected repeatedly
11. Network Agent activates when user shows interest in specific companies

USER GETS NOTIFIED ONLY WHEN ACTION NEEDED
12. Consensus apply → "Review & Send" notification
13. Deadlock → "Your agents disagree — break the tie"
14. User reviews debate + customised resume/cover letter → one tap to send

CONTINUOUS LEARNING LOOP
15. Gmail API monitors inbox for callbacks / rejections / ghosts
16. Outcomes feed into recalibration engine
17. Weekly brief: what worked, what didn't, agent thresholds adjusted
```

---

## 5. Feature Scope

### In Scope (MVP for 36 hours)

| Feature | Priority | Description |
|---|---|---|
| Google OAuth onboarding | P0 | Sign in with Google, grant Gmail read access |
| Resume upload + parsing | P0 | PDF → structured profile via Bedrock |
| Calibration + non-negotiables | P0 | Career stage, targets, hard filters |
| Edge case detection | P0 | Fresh grad / experienced / foreigner auto-adjusts |
| Opportunity Agent | P0 | MyCareersFuture API + Exa, every 3hrs |
| Non-negotiable pre-filter | P0 | Hard filter before debate — salary, location, type |
| 4-agent debate engine | P0 | Ambition, Realism, Risk, Opportunity via Step Functions |
| Master Orchestrator | P0 | Resolves consensus or escalates |
| Resume customisation | P0 | Per-JD tailoring via Bedrock |
| Cover letter generation | P0 | Per-JD cover letter via Bedrock |
| Job detail view (debate screen) | P0 | The hero UI — full debate visible |
| Send application via SES | P0 | One-tap send to employer |
| Application pipeline tracker | P0 | Applied → Waiting → Callback → Rejected |
| Gmail callback detection | P0 | Read replies, classify with Bedrock |
| Growth Agent | P1 | Upskilling roadmaps when skill gaps detected |
| Network Agent | P1 | Connection suggestions + coffee chat outreach |
| Self-recalibration mockup | P1 | Show concept with realistic data for demo |
| Weekly brief screen | P1 | Static mockup with 1 real data point if time |

### Out of Scope

- Interview prep agent
- Real-time market signals dashboard
- WhatsApp/Telegram notifications
- Browser extension for portal autofill
- Stripe/payments
- Mobile app
- Salary negotiation assistant

---

## 6. The 6 Agents

### 6.1 AMBITION AGENT (Debate)

**Mandate:** Maximise career ceiling. Push to stretch.

**Evaluates:**
- Is this a step up in seniority?
- Salary above current/expected market rate?
- Builds skills flagged as growth areas?
- More prestigious company?
- Builds AI-adjacent/future-proof skills?
- Career progression path visible?

**System prompt:**
```
You are the Ambition Agent in WORKSIGNAL, a multi-agent job application system.

Your mandate: maximise this user's career ceiling. Push them to stretch.
Your bias: lean toward applying. People undersell themselves.

Evaluate each job against the user's profile on:
1. Seniority step-up potential
2. Salary improvement vs current/market rate
3. Growth area skill building (especially AI-adjacent skills)
4. Company brand and career optionality
5. Career progression path clarity
6. Whether this role is future-proof against automation

Consider the user's stated priority ranking (money/growth/balance/brand/purpose/stability).

Output JSON:
{
  "verdict": "apply" | "skip",
  "ambition_score": 0-100,
  "reasoning": "2-3 sentences",
  "key_argument": "one-line for the debate summary"
}
```

### 6.2 REALISM AGENT (Debate)

**Mandate:** Optimise for actual callback probability. Keep user honest.

**Evaluates:**
- % of JD requirements actually met
- Experience gap severity
- Realistic callback probability
- Whether role description signals healthy work-life balance
- Market salary benchmark alignment

**System prompt:**
```
You are the Realism Agent in WORKSIGNAL.

Your mandate: optimise for actual application success rate.
Your bias: conservative. 10 strong > 50 weak.

Evaluate:
1. % of hard requirements met (years, tools, certifications)
2. Is the gap addressable in a cover letter or is it a hard filter?
3. Realistic callback probability based on profile strength
4. Work-life balance signals in JD (red flags: "fast-paced", "wear many hats", "24/7")
5. Salary alignment with market data for this role + experience level

Default threshold for "apply" is 80% match. Adjustable via recalibration.

Output JSON:
{
  "verdict": "apply" | "skip" | "caution",
  "match_score": 0-100,
  "key_gaps": ["array of specific gaps"],
  "work_life_flags": ["array of any WLB red flags detected"],
  "reasoning": "2-3 sentences",
  "key_argument": "one-line for the debate summary"
}
```

### 6.3 RISK AGENT (Debate)

**Mandate:** Protect from bad companies and bad decisions. Uses Exa.

**Evaluates (via Exa search):**
- Company financial health
- Recent layoffs or hiring freezes
- Glassdoor sentiment + work-life balance rating
- Culture red flags
- Contract vs perm signals
- Scam indicators
- For foreigners: EP sponsorship track record

**System prompt:**
```
You are the Risk Agent in WORKSIGNAL.

Your mandate: protect the user from companies with red flags.
Your bias: skeptical. Assume there's a reason every role is open.

Use Exa to research:
1. Company financial health (funding, profitability, news)
2. Recent layoffs/hiring freezes ("[company] layoffs 2025 2026 Singapore")
3. Glassdoor reputation and work-life balance score ("[company] glassdoor reviews")
4. Workplace culture issues ("[company] workplace culture")
5. Contract role disguised as permanent signals
6. If user needs work pass: "[company] employment pass sponsorship Singapore"

If Risk score > 70 (high risk): verdict = "avoid" which triggers Master veto override.

Output JSON:
{
  "verdict": "safe" | "caution" | "avoid",
  "risk_score": 0-100,
  "red_flags": [{"flag": "string", "source": "Exa URL", "severity": "high|medium|low"}],
  "glassdoor_score": number or null,
  "reasoning": "2-3 sentences",
  "key_argument": "one-line for the debate summary"
}
```

### 6.4 OPPORTUNITY AGENT (Debate)

**Mandate:** Detect timing advantages and urgency.

**Evaluates (via Exa):**
- Posting age
- Typical fill speed for this company/role type
- Market signals (funding, expansion = hiring surge)
- First-mover advantage
- For foreigners: how long the FCF listing has been up (14-day requirement)

**System prompt:**
```
You are the Opportunity Agent in WORKSIGNAL.

Your mandate: detect when timing matters. Push to act fast on time-sensitive roles.
Your bias: action-oriented. First qualified applicant often wins.

Evaluate:
1. Posting age (hours/days)
2. Company hiring speed signals (size, industry norms)
3. Exa: recent company news (funding, expansion, exec changes) signalling urgency
4. First-mover advantage available?
5. If user needs work pass: how long has this role been on MyCareersFuture? (FCF 14-day rule)

Output JSON:
{
  "verdict": "act_now" | "monitor" | "no_advantage",
  "urgency_score": 0-100,
  "timing_factors": ["array of specific factors"],
  "reasoning": "2-3 sentences",
  "key_argument": "one-line for the debate summary"
}
```

### 6.5 GROWTH AGENT (Background)

**Mandate:** When skill gaps are flagged repeatedly, build upskilling roadmaps.

**Trigger:** Realism Agent flags the same skill gap 3+ times across different jobs.

**Actions via Exa:**
- Search SkillsFuture course listings
- Find free courses (Coursera, YouTube, freeCodeCamp)
- Find portfolio project templates on GitHub
- Find relevant Singapore events/meetups/workshops
- Estimate time investment and projected match score improvement

**System prompt:**
```
You are the Growth Agent in WORKSIGNAL.

Your mandate: help the user become more employable over time.
You activate when Realism Agent flags the same skill gap 3+ times.

Search Exa for:
1. SkillsFuture courses for the skill (prioritise subsidised)
2. Free online courses (Coursera, YouTube, freeCodeCamp)
3. Portfolio project ideas for the skill
4. Singapore meetups/workshops/events related to the skill
5. Relevant certifications

Build a realistic 4-week roadmap. Estimate time per week.
Project the match score improvement after completion.

Output JSON:
{
  "skill_gap": "string",
  "frequency_flagged": number,
  "current_impact": "appears in X% of target roles",
  "roadmap": [
    {
      "week": number,
      "action": "string",
      "resource_url": "string",
      "cost": "string (e.g. '$0 SkillsFuture' or 'Free')",
      "time_hours": number,
      "type": "course" | "project" | "event" | "certification"
    }
  ],
  "projected_match_improvement": "74% → 89%",
  "networking_opportunities": [
    { "name": "string", "date": "string", "url": "string", "type": "event" }
  ]
}
```

### 6.6 NETWORK AGENT (Background)

**Mandate:** Find relevant people for career guidance, referrals, coffee chats.

**Trigger:** User applies to 2+ roles at the same company, or callback rate is low after 2 weeks.

**Actions via Exa:**
- Find people at target companies (LinkedIn profiles via Exa)
- Find alumni from user's university at target companies
- Find community members (speakers, blog authors) in target field
- Find upcoming networking events in Singapore
- Draft personalised coffee chat outreach messages

**System prompt:**
```
You are the Network Agent in WORKSIGNAL.

Your mandate: build strategic connections that increase interview chances.
You activate when user shows strong interest in a company (2+ applications)
or when callback rate is below industry average after 2 weeks.

Use Exa to find:
1. People at target companies in relevant roles
2. Alumni from user's university at target companies
3. Community members (conference speakers, blog authors, podcast guests)
4. Upcoming Singapore networking events, meetups, conferences
5. Draft personalised, non-generic outreach messages

Prioritise: alumni > community members > cold contacts
Max 3 suggestions per week. Never be spammy.

Output JSON:
{
  "target_company": "string",
  "connections": [
    {
      "name": "string",
      "role": "string",
      "connection_type": "alumni" | "community" | "cold",
      "source": "Exa URL",
      "relevance": "why worth connecting"
    }
  ],
  "events": [
    { "name": "string", "date": "string", "url": "string", "relevance": "string" }
  ],
  "outreach_draft": "personalised message"
}
```

---

## 7. Master Orchestrator

### Resolution Logic

```
INPUTS: 4 agent verdicts (Ambition, Realism, Risk, Opportunity)

OVERRIDE RULES (checked first):
- Risk Agent verdict = "avoid" → VETO. Never apply. No override possible.
- Realism Agent match_score < 50 → require explicit user override.

DECISION TREE:
1. All 4 apply     → CONSENSUS APPLY → generate app → queue for approval
2. 3 apply, 1 skip → APPLY WITH CAVEAT → note dissent → queue for approval
3. 2 apply, 2 skip → DEADLOCK → show debate to user → user decides
4. 1 apply, 3 skip → SKIP WITH NOTE → discard, log for recalibration
5. All 4 skip      → CONSENSUS SKIP → silently discard

FAST-TRACK:
- Opportunity "act_now" + 2+ other agents agree → top of approval queue

ADDITIONAL CONTEXT:
- Master considers user's priority ranking (money/growth/balance/etc.)
- If user is a career switcher → weight transferable skills more heavily
- If user is fresh grad → lower experience gap penalty
- If user needs EP → verify salary meets minimum threshold
```

**System prompt:**
```
You are the Master Orchestrator in WORKSIGNAL.

You receive 4 verdicts in JSON from Ambition, Realism, Risk, and Opportunity agents.

Your job:
1. Check override rules (Risk avoid = veto, Realism <50 = require override)
2. Count verdicts and apply decision tree
3. If applying: draft resume customisation instructions + cover letter angle
4. If deadlocking: summarise both sides clearly for the user
5. Always explain your reasoning in 2-3 sentences

Consider the user's priority ranking and career context.

Output JSON:
{
  "decision": "apply_consensus" | "apply_with_caveat" | "skip_consensus" | "deadlock_escalate" | "veto_skip",
  "summary": "2-sentence summary for user",
  "resume_instructions": "what to emphasise in customised resume",
  "cover_letter_angle": "specific angle for cover letter",
  "agents_for": ["agent names"],
  "agents_against": ["agent names"],
  "dissent_note": "what the dissenting agent(s) flagged",
  "user_action_required": boolean
}
```

---

## 8. Tech Stack (AWS-Native)

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | Next.js 14 + Tailwind CSS | Web app dashboard |
| Deployment | Vercel | Frontend hosting |
| Auth | Google OAuth (NextAuth.js) | Gmail access + identity |
| Agent orchestration | AWS Step Functions | Multi-agent workflow: parallel fan-out, consensus logic, error handling |
| Agent reasoning | AWS Bedrock (Claude Sonnet) | All 6 agents + orchestrator LLM calls |
| Job discovery | MyCareersFuture API (public) | 80,000+ live SG jobs |
| Real-time research | Exa API | Company research, courses, people, market signals |
| Scheduling | AWS EventBridge | Trigger agent runs every 3hrs |
| Data storage | AWS DynamoDB | Users, jobs, verdicts, applications, recalibration |
| Email sending | AWS SES | Send application emails |
| Email reading | Gmail API (OAuth) | Detect callbacks and rejections |
| File storage | AWS S3 | Store resumes, generated PDFs |
| Compute | AWS Lambda | API handlers, agent glue logic |

### Why Step Functions over Dify

Step Functions provides:
- **Native parallel execution** for the 4-agent debate (Map state)
- **Choice states** for Master Orchestrator logic
- **Error handling** with retry and catch built in
- **Visual workflow diagram** judges can see (like Dify but AWS-native)
- **Direct Bedrock integration** via AWS SDK
- **EventBridge trigger** native integration
- Sponsor alignment: 100% AWS

---

## 9. Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    USER (Next.js Web App)                │
│  Dashboard | Job Detail | Pipeline | Growth | Network   │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              NEXT.JS API ROUTES (Vercel)                 │
│  NextAuth (Google OAuth) | REST endpoints               │
└────────────────────┬────────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        ▼                         ▼
┌───────────────┐       ┌────────────────────────────────┐
│  AWS Lambda   │       │   AWS STEP FUNCTIONS           │
│  (API glue)   │       │   "WorkSignal-Debate-Machine"  │
│               │       │                                │
│  Handles:     │       │  ┌──────────────────────┐      │
│  - Resume     │       │  │ EventBridge Trigger   │      │
│    upload     │       │  │ (every 3 hours)       │      │
│  - Profile    │       │  └──────────┬───────────┘      │
│    CRUD       │       │             ▼                  │
│  - Gmail      │       │  ┌──────────────────────┐      │
│    polling    │       │  │ Opportunity Agent     │      │
│               │       │  │ (Lambda: MCF API +   │      │
│               │       │  │  Exa search)          │      │
│               │       │  └──────────┬───────────┘      │
│               │       │             ▼                  │
│               │       │  ┌──────────────────────┐      │
│               │       │  │ NON-NEGOTIABLE FILTER│      │
│               │       │  │ (Lambda: hard filter) │      │
│               │       │  └──────────┬───────────┘      │
│               │       │             ▼                  │
│               │       │  ┌──────── MAP STATE ────────┐ │
│               │       │  │  (for each valid job)     │ │
│               │       │  │                           │ │
│               │       │  │  ┌─── PARALLEL ────────┐  │ │
│               │       │  │  │ Ambition  (Bedrock) │  │ │
│               │       │  │  │ Realism   (Bedrock) │  │ │
│               │       │  │  │ Risk      (Bedrock  │  │ │
│               │       │  │  │           + Exa)    │  │ │
│               │       │  │  │ Opportunity(Bedrock │  │ │
│               │       │  │  │           + Exa)    │  │ │
│               │       │  │  └─────────────────────┘  │ │
│               │       │  │           ▼               │ │
│               │       │  │  ┌─────────────────────┐  │ │
│               │       │  │  │ Master Orchestrator │  │ │
│               │       │  │  │ (Bedrock)           │  │ │
│               │       │  │  └────────┬────────────┘  │ │
│               │       │  │           ▼               │ │
│               │       │  │  ┌─────────────────────┐  │ │
│               │       │  │  │ CHOICE STATE        │  │ │
│               │       │  │  │ apply → Gen Resume  │  │ │
│               │       │  │  │ skip  → Log only    │  │ │
│               │       │  │  │ deadlock → Notify   │  │ │
│               │       │  │  └─────────────────────┘  │ │
│               │       │  └───────────────────────────┘ │
│               │       └────────────────────────────────┘
└───────────────┘
                     │
       ┌─────────────┼──────────────┐
       ▼             ▼              ▼
┌──────────┐  ┌──────────┐   ┌──────────┐
│ DynamoDB │  │ S3       │   │ SES      │
│ (data)   │  │ (resumes)│   │ (send)   │
└──────────┘  └──────────┘   └──────────┘

BACKGROUND PROCESSES (separate Step Functions / Lambda):

┌──────────────────────────────────────────┐
│ Gmail Monitor (Lambda, every 30 mins)    │
│ → Detect callbacks/rejections/ghosts     │
│ → Update Applications table              │
│ → Feed into Recalibration Engine         │
└──────────────────────────────────────────┘

┌──────────────────────────────────────────┐
│ Growth Agent (Lambda, triggered by       │
│   Realism Agent flagging same gap 3x)    │
│ → Exa: courses, events, projects         │
│ → Output: roadmap to DynamoDB            │
└──────────────────────────────────────────┘

┌──────────────────────────────────────────┐
│ Network Agent (Lambda, triggered by      │
│   2+ applications to same company)       │
│ → Exa: people, events, communities       │
│ → Output: suggestions to DynamoDB        │
└──────────────────────────────────────────┘

┌──────────────────────────────────────────┐
│ Recalibration Engine (Lambda, weekly)    │
│ → Analyse agent accuracy vs outcomes     │
│ → Adjust agent thresholds                │
│ → Generate weekly brief                  │
└──────────────────────────────────────────┘
```

---

## 10. Guardrails

### 10.1 Geographic: Singapore-Only

- MyCareersFuture API: already SG-only
- Exa searches: always append "Singapore" to queries
- Jobs without SG location → auto-filtered in pre-filter
- Remote roles: include only if SG-based company or SG timezone specified

### 10.2 Non-Negotiable Pre-Filter

Runs BEFORE the 4-agent debate. If a job violates ANY non-negotiable, it is silently discarded. No agent debate, no notification, no record shown to user.

```
Pre-filter checks:
1. Salary ≥ user's minimum floor
2. Employment type matches user's selection (perm/contract/part-time)
3. Work arrangement matches (office/hybrid/remote)
4. Location = Singapore
5. Custom dealbreakers (no night shifts, no travel, etc.)
6. For foreigners: salary ≥ EP minimum ($5,600 or $6,200 for finance)
7. For foreigners: role appears to offer EP sponsorship
```

### 10.3 Work Pass Guardrails

If user selects "Need work pass sponsorship" during onboarding:
- Auto-set salary floor to $5,600/month ($6,200 for financial services)
- Risk Agent adds EP sponsorship check via Exa: "[company] employment pass sponsorship"
- Opportunity Agent notes FCF listing duration (employers must advertise 14 days on MCF before hiring foreigners)
- Cover letter auto-includes work authorisation status
- Dashboard shows EP eligibility indicator per job

---

## 11. Edge Cases

### 11.1 Fresh Grad (No Experience)

**Detection:** User selects "Fresh graduate" during onboarding.

**Agent adjustments:**
- Ambition: lower bar — a first job IS the stretch
- Realism: don't penalise for "3 years required" on grad scheme roles. Reduce match threshold to 70%
- Risk: prioritise company L&D investment, graduate programme quality
- Opportunity: flag graduate scheme deadlines (hard cutoffs)
- Growth: activate immediately — suggest portfolio projects, certifications
- Network: find alumni at target companies proactively

**Salary benchmark:** SG fresh grad median ~$4,000-$4,800/month

### 11.2 Experienced Professional (10+ years)

**Detection:** User selects "Senior (8+ years)" during onboarding.

**Agent adjustments:**
- Ambition: focus on title, team size, P&L responsibility
- Realism: raise match threshold to 85% — wrong moves cost more
- Risk: deeper management team research, company strategy alignment
- Opportunity: emphasise Network Agent — senior roles fill via referrals
- Network: most aggressive — find decision-makers, board connections
- Growth: leadership skills, not technical

### 11.3 Foreigner Needing Work Pass

**Detection:** User selects "Need work pass sponsorship" during onboarding.

**Agent adjustments:**
- All non-negotiable guardrails from Section 10.3 applied
- Risk: check employer EP sponsorship history
- Opportunity: monitor FCF listing duration
- Realism: factor COMPASS scoring likelihood

### 11.4 Career Switcher

**Detection:** User selects "Career switcher" during onboarding → additional question: "Switching from what to what?"

**Agent adjustments:**
- Ambition: aggressive on transferable skills framing
- Realism: separate evaluation of technical vs transferable skills. Lower threshold for new-field technical skills
- Growth: most active — build transition roadmap
- Network: find people who made the same switch
- Resume customisation: full narrative reframe, not just tailoring

---

## 12. UI/UX Specification

### 12.1 Design System

```css
/* Typography */
--font-primary: 'Inter', sans-serif;
--font-mono: 'JetBrains Mono', monospace;

/* Backgrounds */
--bg-primary: #FAFAFA;
--bg-card: #FFFFFF;
--bg-section: #F5F5F5;

/* Text */
--text-primary: #111827;
--text-secondary: #6B7280;

/* Brand */
--brand-primary: #4F46E5;    /* indigo-600 */
--brand-light: #EEF2FF;

/* Agent colours */
--agent-ambition: #DC2626;   /* red */
--agent-realism: #2563EB;    /* blue */
--agent-risk: #D97706;       /* amber */
--agent-opportunity: #059669; /* emerald */
--agent-growth: #7C3AED;     /* violet */
--agent-network: #0891B2;    /* cyan */

/* Status */
--status-callback: #10B981;
--status-rejected: #EF4444;
--status-waiting: #6B7280;
--status-ghosted: #94A3B8;
```

### 12.2 Screens

**1. Onboarding (4 screens):**
- Sign in with Google
- Upload resume
- About you (career stage + residency)
- Targets + Non-negotiables

**2. Main Dashboard:**
- Agent status banner (scanning activity)
- Action needed cards (jobs awaiting review)
- Pipeline summary
- Growth card (skill gaps detected)
- Network card (connection suggestions)
- Intelligence card (callback rate, recalibration)

**3. Job Detail View — THE HERO SCREEN:**
- Job header (company, role, salary, posted)
- 4 agent debate cards (each in agent colour)
- Master Orchestrator decision summary
- Customised resume preview
- Cover letter preview (editable)
- Action bar: Send | Skip | Save

**4. Pipeline View:**
- Table: Company | Role | Sent | Status
- Status badges: Callback / Opened / Waiting / Rejected / Ghosted
- Click row → see original debate + application

**5. Growth Roadmap View:**
- Skill gap identified
- 4-week learning plan with linked resources
- Projected match score improvement
- Related events/meetups

**6. Network Suggestions View:**
- Target company + application count
- Connection cards (alumni, community, cold)
- Draft outreach messages
- Relevant upcoming events

**7. Weekly Brief / Recalibration View:**
- Numbers: applied, callbacks, rate vs industry avg
- Agent accuracy breakdown
- Threshold adjustments made
- Market signals detected

---

## 13. Database Schema (DynamoDB)

### Table: Users
```json
{
  "user_id": "string (Google OAuth sub)",
  "email": "string",
  "name": "string",
  "resume_s3_key": "string",
  "career_stage": "fresh_grad | early_career | mid_career | senior | career_switcher",
  "residency_status": "citizen | pr | ep_holder | need_sponsorship",
  "career_switch_context": { "from": "string", "to": "string" },
  "profile": {
    "current_role": "string",
    "years_experience": "number",
    "skills": ["string"],
    "education": "string",
    "university": "string",
    "target_roles": ["string"],
    "target_industries": ["string"],
    "dream_companies": ["string"],
    "priority_ranking": ["salary", "growth", "balance", "brand", "purpose", "stability"]
  },
  "non_negotiables": {
    "min_salary": "number",
    "employment_type": ["full_time", "contract", "part_time"],
    "work_arrangement": "any | hybrid_remote | fully_remote",
    "custom": ["string"],
    "ep_sponsorship_required": "boolean"
  },
  "agent_weights": {
    "ambition_threshold": "number (default 70)",
    "realism_threshold": "number (default 80)",
    "risk_max_acceptable": "number (default 70)",
    "opportunity_urgency_boost": "boolean (default true)"
  },
  "gmail_oauth_token": "encrypted_string",
  "created_at": "timestamp",
  "last_scan_at": "timestamp"
}
```

### Table: Jobs
```json
{
  "job_id": "string",
  "user_id": "string",
  "company": "string",
  "role_title": "string",
  "salary_min": "number",
  "salary_max": "number",
  "jd_text": "string",
  "posted_at": "timestamp",
  "source_url": "string",
  "employer_email": "string",
  "scanned_at": "timestamp"
}
```

### Table: AgentVerdicts
```json
{
  "verdict_id": "string",
  "job_id": "string",
  "user_id": "string",
  "ambition": { "verdict": "", "score": 0, "reasoning": "", "key_argument": "" },
  "realism": { "verdict": "", "score": 0, "reasoning": "", "key_argument": "", "gaps": [], "wlb_flags": [] },
  "risk": { "verdict": "", "score": 0, "reasoning": "", "key_argument": "", "red_flags": [], "glassdoor_score": null },
  "opportunity": { "verdict": "", "score": 0, "reasoning": "", "key_argument": "", "timing_factors": [] },
  "master_decision": { "decision": "", "summary": "", "agents_for": [], "agents_against": [], "dissent_note": "" },
  "created_at": "timestamp"
}
```

### Table: Applications
```json
{
  "application_id": "string",
  "user_id": "string",
  "job_id": "string",
  "verdict_id": "string",
  "customised_resume_s3_key": "string",
  "cover_letter_text": "string",
  "sent_at": "timestamp",
  "recipient_email": "string",
  "email_thread_id": "string",
  "status": "sent | opened | callback | rejected | ghosted",
  "status_updated_at": "timestamp",
  "classification_confidence": "number"
}
```

### Table: SkillGaps
```json
{
  "user_id": "string",
  "skill": "string",
  "times_flagged": "number",
  "first_flagged_at": "timestamp",
  "roadmap": {},
  "status": "identified | roadmap_created | in_progress | completed"
}
```

### Table: RecalibrationLog
```json
{
  "recalibration_id": "string",
  "user_id": "string",
  "week_of": "date",
  "metrics": {
    "applications_sent": "number",
    "callbacks": "number",
    "rejections": "number",
    "ghosted": "number",
    "callback_rate": "number"
  },
  "agent_performance": {
    "ambition": { "correct": "number", "incorrect": "number" },
    "realism": { "correct": "number", "incorrect": "number" },
    "risk": { "correct": "number", "incorrect": "number" },
    "opportunity": { "correct": "number", "incorrect": "number" }
  },
  "adjustments_made": [
    { "agent": "string", "parameter": "string", "old_value": "", "new_value": "", "reason": "string" }
  ],
  "brief_text": "string",
  "created_at": "timestamp"
}
```

---

## 14. API Integration Details

### 14.1 MyCareersFuture API
```
Endpoint: https://api.mycareersfuture.gov.sg/v2/jobs
Auth: None required (public)
Fields used: uuid, title, description, minimumYearsExperience, skills[],
             salary (min/max), newPostingDate, employer.name, employer.uen,
             contactEmail, categories[], employmentTypes[]
Filter by: search keywords, salary range, employment type, seniority
```

### 14.2 Exa API
```
Uses:
- Risk Agent: "[company] layoffs OR hiring freeze Singapore 2026"
- Risk Agent: "[company] glassdoor reviews"
- Risk Agent: "[company] employment pass sponsorship Singapore"
- Opportunity Agent: "[company] funding round OR expansion 2026"
- Growth Agent: "[skill] course SkillsFuture Singapore 2026"
- Growth Agent: "[skill] free course tutorial"
- Growth Agent: "[skill] meetup workshop Singapore"
- Network Agent: "[company] product manager Singapore LinkedIn"
- Network Agent: "[university] alumni [company]"
```

### 14.3 Gmail API
```
Scopes: gmail.readonly
Polling: every 30 mins via EventBridge → Lambda
Query: search for replies from applied companies
Classification via Bedrock: acknowledgement | callback | rejection | other
```

### 14.4 AWS Bedrock
```
Model: anthropic.claude-sonnet-4-20250514 (or latest in ap-southeast-1)
Uses: 6 agents + orchestrator + resume/cover letter gen + email classification
Region: ap-southeast-1 (Singapore)
```

### 14.5 AWS SES
```
Verified sending domain
From: user's name
Reply-to: user's email
Attachment: customised resume PDF
Cc: user (for records)
```

---

## 15. Failure Handling

| Failure | Detection | Recovery |
|---|---|---|
| MCF API down | HTTP error/timeout | Fall back to Exa-only job search |
| Exa returns nothing | Empty response | Risk Agent: "insufficient data, proceed with caution" |
| Bedrock rate limit | 429 response | Retry with exponential backoff, max 3 |
| Step Functions timeout | Execution timeout | Alert, retry with smaller job batch |
| Resume customisation fails | Bedrock error | Fall back to base resume |
| 4 agents deadlock | 2-2 split | Escalate to user with debate visible |
| Gmail token expired | OAuth error | Trigger re-auth, queue retry |
| Email classification <60% confidence | Low confidence | Default to "needs review" status |
| SES bounce | Bounce notification | Mark "delivery_failed", notify user |
| Callback rate 0% for 3 weeks | Analytics check | Emergency recalibration + user alert |
| Non-negotiable filter removes ALL jobs | Zero pass-through | Notify user: "Your filters may be too strict" |

---

## 16. Self-Recalibration Engine

**Trigger:** Weekly via EventBridge (Sunday 9am SGT)

**Logic:**
```
1. Fetch all applications sent in last 7 days
2. Check current status (callback/rejected/ghosted/waiting)
3. For each application:
   - If callback: agents who voted "apply" were RIGHT
   - If rejected: agents who voted "apply" were WRONG
     (unless Realism flagged caution — then Realism was RIGHT)
   - If ghosted after 14 days: ambiguous, weight 0.5
4. Calculate per-agent accuracy
5. Identify patterns:
   - Ambition pushing too many stretches with 0% callback?
   - Realism filtering roles that would have gotten callbacks?
6. Adjust thresholds (e.g. Ambition threshold 70% → 82%)
7. Generate brief text via Bedrock
8. Save to RecalibrationLog
9. Update User.agent_weights
10. Notify user: "Weekly brief ready"
```

**For hackathon MVP:** Build the logic, pre-populate with mock data for demo. Show it working with one real data point if time allows.

---

## 17. Demo Script (5 minutes)

```
[0:00-0:30] THE HOOK
"In 2026, Singapore has more jobs than jobseekers.
But only 51.9% of fresh grads found work by mid-year.
60% describe their search as 'difficult.'
The problem isn't supply. It's matching."

[0:30-1:00] WHY EXISTING TOOLS FAIL
"Tools like JobCopilot and Sonara promise 50 applications
a day. But their users report scam jobs, irrelevant
matches, and zero learning. One user said: 'I'm an IT
professional and got recommended Doctor and Clerk roles.'
More applications does not equal more interviews."

[1:00-1:30] WORKSIGNAL
"We built WORKSIGNAL — 6 AI agents that debate, research,
upskill, and connect you. They argue about every job
before you see it. They learn from what works. And they
make you more employable over time."

[1:30-3:30] LIVE DEMO
- Show dashboard: "847 jobs scanned, 3 surfaced"
- Click into Grab PM role → show 4-agent debate live
- Highlight Risk Agent's Exa company research
- Show Master Orchestrator resolving with reasoning
- Show customised resume + cover letter
- One tap → application sent
- Switch to Growth Agent: "SQL flagged 5 times — 
  here's your 4-week roadmap"
- Switch to Network Agent: "2 NUS alumni at Grab found"
- Show pipeline: callbacks tracked via Gmail

[3:30-4:15] THE AGENTIC WOW
"Every week, our agents review their own performance.
They learn which sub-agent was wrong. They recalibrate.
This agent gets smarter the longer you use it."
Show weekly brief with recalibration data.

[4:15-4:45] ARCHITECTURE
Show Step Functions workflow diagram:
6 agents, parallel debate, pre-filter, recalibration loop

[4:45-5:00] CLOSE
"We built this because we ARE this user.
Early career. Trying to figure it out.
This is the agent we wished we had. Thank you."
```

---

## 18. 36-Hour Build Timeline

| Hours | Yeo Shi (PM + Frontend + Pitch) | Rose (Backend + AWS + QA) |
|---|---|---|
| 0-2 | Lock PRD, set up repo in Kiro | AWS account setup, Step Functions scaffold, Bedrock access |
| 2-4 | Onboarding UI (4 screens) | MCF API integration + Exa account setup |
| 4-6 | Dashboard skeleton | Non-negotiable pre-filter Lambda |
| 6-10 | Job Detail hero screen (debate UI) | Step Functions workflow: 4 agents parallel + orchestrator |
| 10-14 | Connect frontend ↔ backend via API routes | End-to-end test: job → debate → verdict |
| 14-18 | Polish debate UI — must be beautiful | Resume customisation + cover letter via Bedrock |
| 18-20 | Pipeline view + send button | Gmail OAuth + callback classification Lambda |
| 20-22 | Growth roadmap screen | Growth Agent Lambda + Network Agent Lambda |
| 22-24 | Network suggestions screen | EventBridge scheduling + edge case handling |
| 24-26 | Weekly Brief mockup (hardcoded data ok) | Bug fixes + demo data pre-caching |
| 26-28 | End-to-end run-through | Final QA |
| 28-30 | Backup demo video | Pre-cache 3 demo job verdicts for reliability |
| 30-33 | Pitch deck (5 slides max) | Standby |
| 33-36 | Pitch rehearsal x3 | Demo support |

---

## 19. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Step Functions workflow too complex | Medium | High | Rose starts at hour 2. Simplify to sequential if parallel fails. |
| Bedrock rate limits during demo | Low | Critical | Pre-cache 3 demo verdicts in DynamoDB |
| Gmail OAuth breaks live | Medium | Medium | Use mocked email replies for demo |
| MCF API changes mid-hackathon | Low | High | Cache 50 real jobs at hour 4 |
| 4-agent debate >10s latency | Medium | High | Parallel execution in Step Functions, 5s max per agent |
| Exa research returns poor results | Medium | Medium | Fallback to "insufficient data" messaging |
| Demo fails live | Medium | Critical | Backup video recorded at hour 28 |
| Pitch goes over 5 minutes | High | Medium | Rehearse x3, time each section |

---

## 20. Kiro Prompt

Paste this into Kiro to generate the initial spec-driven project:

```
Build a Next.js 14 web application called WORKSIGNAL — an AI-powered
multi-agent job search platform for early-career Singaporeans.

CORE ARCHITECTURE:
- Frontend: Next.js 14 with App Router, Tailwind CSS, TypeScript
- Auth: NextAuth.js with Google OAuth (request gmail.readonly scope)
- Backend: AWS Lambda functions behind API Gateway
- Agent orchestration: AWS Step Functions
- LLM: AWS Bedrock (Claude Sonnet)
- Database: AWS DynamoDB (tables: Users, Jobs, AgentVerdicts, Applications, SkillGaps, RecalibrationLog)
- File storage: AWS S3 (resumes)
- Job discovery: MyCareersFuture public API (api.mycareersfuture.gov.sg/v2/jobs)
- Real-time research: Exa API
- Email sending: AWS SES
- Email reading: Gmail API
- Scheduling: AWS EventBridge (every 3 hours)
- Deployment: Vercel (frontend), AWS (backend)

FEATURES TO BUILD (in priority order):

1. ONBOARDING FLOW
- Google OAuth sign in (grants Gmail read access)
- Resume upload (PDF → S3 → parse with Bedrock to extract skills/experience)
- Career stage selector (fresh_grad | early_career | mid_career | senior | career_switcher)
- Residency status (citizen | pr | ep_holder | need_sponsorship)
- Target roles, industries, dream companies input
- Priority ranking (drag-and-drop: salary, growth, balance, brand, purpose, stability)
- Non-negotiables: minimum salary, employment type, work arrangement, custom dealbreakers
- Auto-adjustments based on career stage and residency (see PRD edge cases)

2. AGENT DEBATE ENGINE (AWS Step Functions)
- EventBridge triggers Step Function every 3 hours
- Step 1: Opportunity Agent Lambda — queries MCF API + Exa for new jobs matching user targets
- Step 2: Non-negotiable pre-filter Lambda — hard filter, silently discard violations
- Step 3: Parallel state — 4 Lambdas run simultaneously for each valid job:
  a. Ambition Agent (Bedrock call with system prompt)
  b. Realism Agent (Bedrock call with system prompt)
  c. Risk Agent (Bedrock + Exa calls for company research)
  d. Opportunity Agent timing eval (Bedrock + Exa)
- Step 4: Master Orchestrator Lambda — reads 4 verdicts, applies decision tree, outputs decision
- Step 5: Choice state:
  - apply_consensus → Generate customised resume + cover letter (Bedrock), save to DynamoDB, push notification
  - skip_consensus → Log to DynamoDB only
  - deadlock → Save debate, push notification asking user to decide
  - veto_skip → Log, never surface

3. JOB DETAIL VIEW (Hero Screen)
- Job header: company, role, salary, posted time
- 4 agent debate cards with colour-coded borders:
  Ambition (red), Realism (blue), Risk (amber), Opportunity (emerald)
- Each card: verdict badge, score, reasoning, key argument
- Master Orchestrator decision summary in highlighted box
- Customised resume preview (PDF viewer or rendered)
- Cover letter preview (editable textarea)
- Action bar: [Send Application] [Skip] [Save for later]
- Staggered card entrance animation (100ms delay per card)

4. APPLICATION PIPELINE
- Table: Company | Role | Sent date | Status
- Status badges: Callback (green) | Opened | Waiting (grey) | Rejected (red) | Ghosted (light grey)
- Gmail API polling Lambda (every 30 mins via EventBridge)
- Bedrock classifies replies: callback | rejection | acknowledgement | other

5. GROWTH AGENT
- Triggered when Realism Agent flags same skill gap 3+ times
- Lambda: Exa search for courses, events, projects
- Growth roadmap view: 4-week plan with linked resources
- Cards for each week: action, resource link, cost, time estimate

6. NETWORK AGENT  
- Triggered when user applies to 2+ roles at same company
- Lambda: Exa search for people, alumni, events
- Network suggestions view: connection cards + draft outreach messages

7. WEEKLY BRIEF / RECALIBRATION
- Lambda triggered weekly via EventBridge
- Analyses callback rates vs agent recommendations
- Adjusts agent thresholds in User table
- Generates brief text via Bedrock
- Brief view: numbers, agent accuracy, adjustments made

DESIGN SYSTEM:
- Font: Inter (400/500/600/700), JetBrains Mono for data
- Brand colour: Indigo-600 (#4F46E5)
- Agent colours: Ambition=#DC2626, Realism=#2563EB, Risk=#D97706, Opportunity=#059669
- Background: #FAFAFA, Cards: #FFFFFF
- Clean, professional, Linear/Notion aesthetic
- Stagger animations on card entrance

AWS CONFIGURATION:
- Region: ap-southeast-1 (Singapore)
- Bedrock model: anthropic.claude-sonnet-4-20250514
- DynamoDB: on-demand billing mode
- S3: private bucket for resumes
- SES: verified sending domain
- EventBridge: rules for 3-hourly scan + 30-min Gmail poll + weekly recalibration
```

---

*WORKSIGNAL Full PRD v1.0*
*SuperAI NEXT Hackathon 2026*
*Last updated: 9 June 2026*
