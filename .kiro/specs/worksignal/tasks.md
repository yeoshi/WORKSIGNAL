# Implementation Plan: WORKSIGNAL

## Overview

This plan implements WORKSIGNAL incrementally in **TypeScript** (Next.js 14 App Router frontend on Vercel; TypeScript Lambda/BFF glue; AWS Step Functions, Bedrock, DynamoDB, S3, SES, EventBridge; MCF/Exa/Gmail integrations), as specified in the design document.

Build order follows the design's layering:

1. **Foundation** — project scaffold, shared TypeScript types from the design contracts, DynamoDB table and S3/EventBridge infrastructure definitions, shared utilities.
2. **Pure logic** (property-testable) — priority-ranking validator, calibration derivation, Pre_Filter, relaxation logic, onboarding source-of-truth, verdict-schema validator, Master Orchestrator decision tree, reply-status progression, role disambiguation, background-agent triggers, recalibration logic.
3. **Integration / infrastructure** — Auth/OAuth, Resume_Parser + Bedrock, Opportunity_Scanner + MCF/Exa, debate agents, Step Functions debate machine, Application_Sender + SES, Application_Tracker, Gmail_Monitor + Gmail API, background flows, EventBridge schedules.
4. **Frontend** — onboarding flow, dashboard, job detail hero screen, pipeline, growth, network, weekly brief.

Property-based tests use **fast-check**, run a **minimum of 100 iterations**, and each is tagged `Feature: worksignal, Property {number}: {property_text}`. Each of the 22 correctness properties maps to exactly one property-based test task. Safety-critical properties (5, 9, 10, 22) are prioritised within their components.

## Tasks

- [x] 1. Project scaffold and shared foundation
  - [x] 1.1 Scaffold the monorepo project structure and tooling
    - Create the Next.js 14 (App Router) + TypeScript + Tailwind frontend workspace, the TypeScript Lambda/BFF workspace, and an infrastructure-as-code workspace targeting AWS `ap-southeast-1`
    - Configure TypeScript, ESLint/Prettier, the test runner (Vitest/Jest), and add **fast-check** as a dev dependency for property-based testing
    - _Requirements: foundational for all_

  - [x] 1.2 Define shared TypeScript types and interfaces from the design contracts
    - Encode `CareerStage`, `ResidencyStatus`, `PriorityFactor`, `NonNegotiables`, `OnboardingState`, `UserConfig`, `DiscoveredJob`/`Job`, `FilterResult`, `AmbitionVerdict`, `RealismVerdict`, `RiskVerdict`, `OpportunityVerdict`, `VerdictSet`, `Decision`, `MasterDecision`, `Application`, `ApplicationStatus`, `ReplyLabel`, `MatchResult`, `Classification`, `SkillGapRoadmap`, `NetworkSuggestionSet`, `RecalibrationLogEntry`, and `Filter_Relaxation_Suggestion`
    - Define the service interfaces (`OnboardingService`, `AuthService`, `ResumeParser`, `OpportunityScanner`, `PreFilter`, `DebateEngine`, `MasterOrchestrator`, `GrowthAgent`, `NetworkAgent`, `RecalibrationEngine`, `ApplicationSender`, `ApplicationTracker`, `GmailMonitor`)
    - _Requirements: 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 18, 19, 20, 21, 22_

  - [x] 1.3 Define DynamoDB table infrastructure
    - Define on-demand tables `Users`, `Jobs` (GSI on `user_id`), `AgentVerdicts` (GSI on `(job_id, user_id)`), `Applications` (GSI on `(user_id, company)`), `SkillGaps` (PK `(user_id, skill)`), `RecalibrationLog` (GSI on `(user_id, week_of)`) matching the design schemas, including NEW attributes (`inbox_monitoring_available`, `onboarding_version`, `ep_sponsorship_signal`, `mcf_listing_days`, `customisation_applied`, `redirect_source_url`, `agent_failures`, `emergency`)
    - _Requirements: 1.2, 5.5, 7.2, 8, 9, 10.6, 12.8, 14, 16, 18, 19.4, 21.4_

  - [x] 1.4 Define private S3 bucket and EventBridge schedule skeletons
    - Define the private S3 bucket for resumes and generated documents (no public access) with a pre-signed-URL access pattern
    - Stub the three EventBridge schedule rules (3-hourly debate, 30-minute Gmail poll, weekly recalibration) to be wired to targets later
    - _Requirements: 2.1, 7.1, 18.1, 21.1_

  - [x] 1.5 Implement shared utilities
    - DynamoDB client wrapper, S3 put/get + pre-signed URL helper, symmetric encryption/decryption helper for OAuth tokens, typed error classes (`RejectError`, `RankingError`, `ValidationError`, `ParseFailure`, `InvalidVerdict`), and a structured logger
    - _Requirements: 1.4, 2.1, 9.2, 11.4_

- [x] 2. Onboarding pure-logic validators and calibration
  - [x] 2.1 Implement the priority-ranking validator
    - Accept a submitted list only if it is a permutation of exactly `{salary, growth, balance, brand, purpose, stability}`; reject omissions/duplicates with a message naming offending factors and persist nothing on rejection
    - _Requirements: 4.2, 4.3, 4.4_

  - [x] 2.2 Write property test for the priority-ranking validator
    - **Property 1: Priority ranking accepted iff exact permutation**
    - **Validates: Requirements 4.3, 4.4**
    - Tag: `Feature: worksignal, Property 1`; fast-check, ≥100 iterations; generators cover omissions and duplicates

  - [x] 2.3 Implement calibration derivation
    - Derive `realism_threshold` (70 fresh_grad, 85 senior, else default 80), EP salary floor (5600 general / 6200 financial-services when `need_sponsorship`), record `career_switcher`, and keep the higher of user min-salary vs EP floor
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 2.4 Write property test for calibration derivation
    - **Property 2: Calibration derivation is correct**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4**
    - Tag: `Feature: worksignal, Property 2`; fast-check, ≥100 iterations

  - [x] 2.5 Implement minimum-salary validation
    - Accept and persist a minimum monthly salary iff it is a positive number; reject non-positive values
    - _Requirements: 5.1, 5.3_

  - [x] 2.6 Write property test for minimum-salary validation
    - **Property 3: Minimum salary must be positive**
    - **Validates: Requirements 5.3**
    - Tag: `Feature: worksignal, Property 3`; fast-check, ≥100 iterations including zero/negative/fractional inputs

  - [x] 2.7 Implement onboarding versioning source-of-truth read
    - Stamp `onboarding_version`/`updated_at` on save and provide a read function that always returns the most recently saved version for Pre_Filter and agent evaluations
    - _Requirements: 5.4, 5.5_

  - [x] 2.8 Write property test for onboarding source-of-truth
    - **Property 4: Onboarding edits are the source of truth**
    - **Validates: Requirements 5.4, 5.5**
    - Tag: `Feature: worksignal, Property 4`; fast-check, ≥100 iterations over sequences of saved versions

- [x] 3. Pre_Filter, discovery query, and relaxation logic
  - [x] 3.1 Implement the Pre_Filter pure function
    - Deterministic checks: salary, employment type, work arrangement, Singapore location (with fully-remote SG-employer/SG-timezone exception), custom dealbreakers, and for `need_sponsorship` the EP salary floor and EP-sponsorship availability; pass only when no non-negotiable is violated; discard with no user-visible record (internal analytics log permitted)
    - _Requirements: 8.1, 8.2, 9.1, 9.2, 9.3, 9.4_

  - [x] 3.2 Write property test for the Pre_Filter (safety-critical)
    - **Property 5: Pre_Filter never passes a non-negotiable violation**
    - **Validates: Requirements 8.1, 8.2, 9.1, 9.2, 9.3, 9.4**
    - Tag: `Feature: worksignal, Property 5`; fast-check, ≥100 iterations; generators include salary exactly at the EP floor boundary

  - [x] 3.3 Implement the Exa Singapore-scoped query builder
    - Build research query strings that always append the term `Singapore`
    - _Requirements: 8.3_

  - [x] 3.4 Write property test for Exa query scoping
    - **Property 6: Exa queries are Singapore-scoped**
    - **Validates: Requirements 8.3**
    - Tag: `Feature: worksignal, Property 6`; fast-check, ≥100 iterations over arbitrary query inputs

  - [x] 3.5 Implement Filter_Relaxation_Suggestion derivation and lifecycle
    - Detect when a run discarded every job, derive a concrete suggestion from scanned jobs with rationale and evidence job ids, and manage `pending → approved/rejected/expired` such that non-negotiables mutate only on explicit approval and remain unchanged while pending
    - _Requirements: 9.5, 9.6, 9.7, 9.8_

  - [x] 3.6 Write property test for relaxation approval semantics
    - **Property 7: Non-negotiables change only on explicit approval**
    - **Validates: Requirements 9.7, 9.8**
    - Tag: `Feature: worksignal, Property 7`; fast-check, ≥100 iterations over lifecycle event sequences

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Verdict validation and Master Orchestrator
  - [x] 5.1 Implement the verdict-schema validator
    - Accept a raw agent output as a valid `Verdict` iff it is valid JSON conforming to that agent's schema and every numeric score is within 0–100 inclusive; otherwise mark the agent's evaluation as failed; log invalid output detected after completion while preserving completed status
    - _Requirements: 10.2, 10.3, 10.4, 10.5, 11.1, 11.2, 11.3, 11.4_

  - [x] 5.2 Write property test for verdict validation
    - **Property 8: Verdict accepted iff schema-conformant with scores in range**
    - **Validates: Requirements 10.2, 10.3, 10.4, 10.5, 11.1, 11.2, 11.3**
    - Tag: `Feature: worksignal, Property 8`; fast-check, ≥100 iterations; generators include out-of-range and malformed scores

  - [x] 5.3 Implement the apply-equivalent mapping and decision tree
    - Encode the single-source-of-truth apply-equivalent mapping (Ambition `apply`; Realism `apply`; Risk `safe`; Opportunity `act_now`/`monitor`) and the deterministic decision tree: Risk `avoid` → `veto_skip`; otherwise `n==4`→`apply_consensus`, `n==3`→`apply_with_caveat` (record dissenter), `n==2`→`deadlock_escalate`, `n<=1`→`skip_consensus`; persist decision, summary, supporting/opposing agents, dissent note
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.8_

  - [x] 5.4 Write property test for the Risk veto (safety-critical)
    - **Property 9: Risk "avoid" is an absolute veto**
    - **Validates: Requirements 12.1**
    - Tag: `Feature: worksignal, Property 9`; fast-check, ≥100 iterations across all combinations of the other three verdicts

  - [x] 5.5 Write property test for decision-tree totality and determinism (safety-critical)
    - **Property 10: Decision is a total, deterministic function of the apply-equivalent count**
    - **Validates: Requirements 12.2, 12.3, 12.4, 12.5**
    - Tag: `Feature: worksignal, Property 10`; fast-check, ≥100 iterations; generators exercise apply-equivalent counts at every value 0–4

  - [x] 5.6 Implement the Realism floor confirmation rule
    - When Realism `match_score < 50` and the resolved decision is apply-equivalent, set `user_action_required = true`
    - _Requirements: 12.6_

  - [x] 5.7 Write property test for the Realism floor rule
    - **Property 11: Low realism forces user confirmation on apply decisions**
    - **Validates: Requirements 12.6**
    - Tag: `Feature: worksignal, Property 11`; fast-check, ≥100 iterations; generators include match score exactly 50

  - [x] 5.8 Implement apply-output generation gating and fast-track ordering
    - For any apply-equivalent decision, emit resume instructions + cover-letter angle; when Opportunity = `act_now` and ≥2 other agents are apply-equivalent, mark the queued application for top-of-queue placement
    - _Requirements: 12.7, 13.5_

  - [x] 5.9 Write property test for fast-track ordering
    - **Property 12: Fast-track ordering for act_now**
    - **Validates: Requirements 13.5**
    - Tag: `Feature: worksignal, Property 12`; fast-check, ≥100 iterations

  - [x] 5.10 Implement degraded resolution with partial verdicts
    - Resolve from any non-empty subset of valid verdicts, recording unavailable agents in `agent_failures`; preserve the Risk-`avoid` veto in degraded mode; produce no Decision and log failure when no valid verdict exists
    - _Requirements: 22.4, 22.5_

  - [x] 5.11 Write property test for degraded resolution (safety-critical)
    - **Property 22: Degraded resolution with partial verdicts**
    - **Validates: Requirements 22.4, 22.5**
    - Tag: `Feature: worksignal, Property 22`; fast-check, ≥100 iterations; generators include empty sets and subsets containing Risk `avoid`

- [x] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Reply tracking and disambiguation logic
  - [x] 7.1 Implement the application status enum and creation-path state machine
    - Constrain status to `{sent, opened, callback, rejected, ghosted, redirected_external, needs_review, delivery_failed}`; set initial status by creation path (employer email → `sent`, no employer email → `redirected_external`, bounce → `delivery_failed`)
    - _Requirements: 16.5, 16.7, 16.8, 17.3_

  - [x] 7.2 Write property test for application status validity
    - **Property 13: Application status is always a single valid enum value**
    - **Validates: Requirements 16.5, 16.7, 16.8, 17.3**
    - Tag: `Feature: worksignal, Property 13`; fast-check, ≥100 iterations across all send paths and update sequences

  - [x] 7.3 Implement reply-status progression by confidence
    - Status after processing equals the classification of the most recent reply with confidence ≥ 60; a most-recent reply < 60 yields `needs_review`; any later ≥60 reply overrides prior classifications
    - _Requirements: 18.5, 18.6, 18.7_

  - [x] 7.4 Write property test for reply-status progression
    - **Property 14: Reply-status progression follows confidence rules**
    - **Validates: Requirements 18.5, 18.6, 18.7**
    - Tag: `Feature: worksignal, Property 14`; fast-check, ≥100 iterations; generators include confidence exactly 60

  - [x] 7.5 Implement reply role disambiguation
    - For multiple applications to the same company differing by role title, attribute a reply to the application whose role title the reply references, using role title, thread id, and application thread
    - _Requirements: 18.3_

  - [x] 7.6 Write property test for role disambiguation
    - **Property 15: Reply role disambiguation is correct**
    - **Validates: Requirements 18.3**
    - Tag: `Feature: worksignal, Property 15`; fast-check, ≥100 iterations

- [x] 8. Background-agent triggers and structures
  - [x] 8.1 Implement the Growth_Agent distinct-job trigger
    - Trigger for a skill iff it has been flagged across ≥3 distinct jobs, counting distinct `flagged_job_ids` only
    - _Requirements: 19.1_

  - [x] 8.2 Write property test for the Growth trigger
    - **Property 16: Growth_Agent triggers on three distinct jobs**
    - **Validates: Requirements 19.1**
    - Tag: `Feature: worksignal, Property 16`; fast-check, ≥100 iterations; generators include repeated flags of the same job id

  - [x] 8.3 Implement the roadmap structure builder/validator
    - Produce/validate a four-week roadmap where each week has an action, resource URL, cost, time estimate, and resource type
    - _Requirements: 19.3_

  - [x] 8.4 Write property test for roadmap structure
    - **Property 17: Growth roadmap structure is well-formed**
    - **Validates: Requirements 19.3**
    - Tag: `Feature: worksignal, Property 17`; fast-check, ≥100 iterations

  - [x] 8.5 Implement the Network_Agent application-count trigger
    - Trigger for a company iff the user has sent ≥2 applications to that company
    - _Requirements: 20.1_

  - [x] 8.6 Write property test for the Network trigger
    - **Property 19: Network_Agent triggers on two applications**
    - **Validates: Requirements 20.1**
    - Tag: `Feature: worksignal, Property 19`; fast-check, ≥100 iterations; generators exercise the 2-application boundary

  - [x] 8.7 Implement network suggestion cap and ordering
    - Return at most three suggestions ordered alumni → community → cold
    - _Requirements: 20.3_

  - [x] 8.8 Write property test for network cap and ordering
    - **Property 18: Network_Agent suggestion cap and ordering**
    - **Validates: Requirements 20.3**
    - Tag: `Feature: worksignal, Property 18`; fast-check, ≥100 iterations over arbitrary candidate sets

  - [x] 8.9 Implement recalibration per-agent accuracy and threshold computation
    - Compute per-agent accuracy from verdicts vs resulting statuses and produce warranted threshold adjustments recording prior value, new value, and reason
    - _Requirements: 21.2, 21.3_

  - [x] 8.10 Implement emergency-recalibration detection
    - Flag emergency recalibration iff the three most recent recalibrations each recorded zero callbacks
    - _Requirements: 21.6_

  - [x] 8.11 Write property test for emergency recalibration
    - **Property 20: Emergency recalibration on three zero-callback weeks**
    - **Validates: Requirements 21.6**
    - Tag: `Feature: worksignal, Property 20`; fast-check, ≥100 iterations over recalibration histories

- [x] 9. Checkpoint - Ensure all pure-logic property tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Bedrock invocation wrapper
  - [x] 10.1 Implement the bounded-retry Bedrock invocation wrapper
    - Wrap Bedrock calls with exponential backoff and a hard cap of three retry attempts per invocation on rate-limit responses
    - _Requirements: 22.1_

  - [x] 10.2 Write property test for bounded retries
    - **Property 21: Bedrock retries are bounded**
    - **Validates: Requirements 22.1**
    - Tag: `Feature: worksignal, Property 21`; fast-check, ≥100 iterations over sequences of rate-limit responses

- [x] 11. Authentication and onboarding services
  - [x] 11.1 Implement NextAuth Google OAuth and Users record creation
    - Request `openid email profile gmail.readonly`; create/retrieve the Users record by Google `sub`, store email + display name; encrypt and store the Gmail token; set `inbox_monitoring_available = false` when Gmail scope declined; create no record on OAuth failure
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [x] 11.2 Write unit tests for auth branches
    - Gmail scope granted vs declined, OAuth failure creating no record, token-encryption round-trip
    - _Requirements: 1.4, 1.5, 1.6_

  - [x] 11.3 Implement resume upload (PDF validation and S3 storage)
    - Store PDF uploads in the private S3 bucket and record the S3 key; reject non-PDF uploads with the PDF-only message
    - _Requirements: 2.1, 2.3_

  - [x] 11.4 Implement Resume_Parser Bedrock extraction
    - Read the PDF from S3, call Bedrock to extract current role, years of experience, skills, education, and university, and validate the returned JSON; return `ParseFailure` on failure
    - _Requirements: 2.2, 2.4_

  - [x] 11.5 Write unit tests for resume handling
    - Non-PDF rejection and parse-failure manual-entry fallback
    - _Requirements: 2.3, 2.4_

  - [x] 11.6 Wire Onboarding_Service persistence APIs
    - Implement `setCareerProfile`, `setTargets`, `setPriorityRanking`, `setNonNegotiables`, and `editOnboarding`, integrating the priority-ranking validator, calibration derivation, min-salary validation, and version stamping; require career_switcher from/to fields
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 4.1, 5.1, 5.2, 5.4, 5.5, 6.1, 6.2, 6.3, 6.4_

- [x] 12. Job discovery
  - [x] 12.1 Implement Opportunity_Scanner MCF discovery and persistence
    - Query the MCF API by target roles/industries once 3 hours have elapsed since `last_scan_at`; persist company, role title, salary range, description, posting date, source URL, employer contact email (plus filtering fields); update `last_scan_at` on completion
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 12.2 Implement Exa fallback discovery with Singapore scoping
    - On MCF error/timeout, fall back to Exa-based discovery for that scan using the Singapore-scoped query builder
    - _Requirements: 7.4, 8.3_

  - [x] 12.3 Write integration tests for the scanner
    - Mocked MCF success path and error→Exa fallback, verifying stored fields and `last_scan_at`
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 13. Debate agents and verdict persistence
  - [x] 13.1 Implement the four Bedrock debate agents
    - Ambition, Realism (per-user match threshold + gap/WLB flags), Risk (Exa research + red flags with sources + Glassdoor; `caution` on empty Exa results), and Opportunity (FCF listing-duration timing factor for `need_sponsorship`), each with fixed system prompt and strict JSON output via the bounded-retry wrapper
    - _Requirements: 10.2, 10.3, 10.4, 10.5, 10.7, 22.2_

  - [x] 13.2 Integrate verdict validation and AgentVerdicts persistence
    - Validate each agent's output with the verdict-schema validator, mark failures, and store all four verdicts in AgentVerdicts keyed by `(job_id, user_id)`
    - _Requirements: 10.6, 11.1, 11.2, 11.3, 11.4_

  - [x] 13.3 Write integration tests for parallel fan-out and persistence
    - Verify parallel invocation of the four agents and verdict persistence shape
    - _Requirements: 10.1, 10.6_

- [x] 14. Debate state machine and material generation
  - [x] 14.1 Define and wire the WorkSignal-Debate-Machine Step Functions workflow
    - Scan → PreFilter Map → "all filtered" Choice (relaxation-suggestion branch) → Debate Map → Parallel (four agents) → ValidateVerdicts → Master_Orchestrator → RouteChoice mapping decisions to generate-materials / escalate / log-only / veto-log; include Bedrock Retry/Catch (max 3) and degraded resolution; place `act_now` fast-track applications at top of queue
    - _Requirements: 9.5, 9.6, 10.1, 12.x, 13.1, 13.2, 13.3, 13.4, 13.5, 22.1, 22.3, 22.4, 22.5_

  - [x] 14.2 Implement application material generation
    - Apply the Master's resume instructions and store the resume in S3; apply the cover-letter angle and store text with the application record; inject work-authorisation status for `need_sponsorship`; fall back to the base resume on customisation/S3 failure (record `customisation_applied = false`); still queue for review on any generation failure
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6_

  - [x] 14.3 Write unit tests for material-generation fallbacks
    - Customisation failure, S3 failure, and still-queue-on-failure behaviours
    - _Requirements: 14.4, 14.5, 14.6_

  - [x] 14.4 Write integration test for the debate machine
    - End-to-end run with mocked Bedrock/MCF/Exa exercising filter → debate → route → materials
    - _Requirements: 10.1, 13.1, 13.5_

- [x] 15. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 16. Sending and pipeline tracking
  - [x] 16.1 Implement Application_Sender (SES send, redirect, bounce)
    - Send via SES with customised resume attached and cover-letter body when an employer email exists (recipient = employer, reply-to = user, user CC'd); send regardless of decision class or current state; use edited cover-letter text verbatim; on no employer email expose redirect link + materials; record bounce as `delivery_failed` and notify the user
    - _Requirements: 15.6, 16.1, 16.2, 16.3, 16.4, 16.6, 16.8_

  - [x] 16.2 Write integration tests for the send path
    - SES recipient/reply-to/CC/attachment headers, bounce→`delivery_failed`, and the no-employer redirect path
    - _Requirements: 16.1, 16.4, 16.6, 16.8_

  - [x] 16.3 Implement Application_Tracker
    - `create` records (status/recipient/timestamp/thread id for sent; source URL/timestamp for redirected_external), `list` with silent background retry on load failure, `getDebate`, `applyClassification` integrating reply-status progression, and the 14-day ghosting timer
    - _Requirements: 16.5, 16.7, 17.1, 17.2, 17.4, 18.5, 18.6, 18.7, 18.9_

  - [x] 16.4 Write unit tests for the tracker
    - Classification-driven status updates (≥60 / <60 / later-override) and ghosting after 14 days
    - _Requirements: 18.5, 18.6, 18.7, 18.9_

- [x] 17. Inbox monitoring
  - [x] 17.1 Implement Gmail_Monitor
    - Poll every 30 minutes; fuzzy company matching across sender domain, company name, and thread id; role disambiguation; Bedrock classification into one of four labels with confidence; apply status updates via Application_Tracker; on expired token prompt re-authorisation and queue the poll for retry
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.8_

  - [x] 17.2 Write integration tests for inbox monitoring
    - Poll + fuzzy company-match scoring and Bedrock classification call shape against a mocked inbox
    - _Requirements: 18.1, 18.2, 18.4_

- [x] 18. Background agent flows
  - [x] 18.1 Implement the Growth_Agent flow
    - On the distinct-job trigger, search Exa for courses/projects/certifications/SG events, build the four-week roadmap with projected match improvement, and store it in SkillGaps with skill and times flagged
    - _Requirements: 19.1, 19.2, 19.3, 19.4_

  - [x] 18.2 Implement the Network_Agent flow
    - On the two-application trigger, search Exa for people/alumni/community/SG events, return at most three ordered suggestions each with a personalised outreach draft
    - _Requirements: 20.1, 20.2, 20.3, 20.4_

  - [x] 18.3 Implement the Recalibration_Engine weekly flow
    - Fetch the previous 7 days' applications and statuses, compute per-agent accuracy, update warranted thresholds, store metrics/performance/adjustments and the generated brief in RecalibrationLog, and run emergency recalibration + alert on three zero-callback weeks
    - _Requirements: 21.1, 21.2, 21.3, 21.4, 21.6_

  - [x] 18.4 Write integration tests for recalibration
    - Weekly fetch/compute/store path against mocked data
    - _Requirements: 21.1, 21.2, 21.3, 21.4_

- [x] 19. Scheduling
  - [x] 19.1 Wire EventBridge schedules to their targets
    - 3-hourly debate machine, 30-minute Gmail_Monitor, and weekly (Sun 09:00 SGT) recalibration, each scoped per user against elapsed-time semantics
    - _Requirements: 7.1, 18.1, 21.1_

- [x] 20. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 21. Frontend onboarding and dashboard
  - [-] 21.1 Build the onboarding flow (4 screens)
    - Sign in with Google → Upload resume → About you (career stage + residency, career_switcher from/to) → Targets + Non-negotiables, wired to Auth and Onboarding_Service APIs
    - _Requirements: 1.1, 2.1, 2.4, 3.1, 3.2, 3.3, 4.1, 4.2, 5.1_

  - [x] 21.2 Write component tests for onboarding
    - Validation messaging for ranking and salary, and career_switcher field requirement
    - _Requirements: 4.4, 5.3, 3.3_

  - [-] 21.3 Build the main dashboard
    - Agent status banner, action-needed cards, pipeline summary, Growth/Network/intelligence cards, and surfaced Filter_Relaxation_Suggestion approval prompts
    - _Requirements: 9.5, 9.6, 9.7, 13.2_

  - [x] 21.4 Write component tests for the dashboard
    - Relaxation-suggestion prompt rendering and approve/reject interaction
    - _Requirements: 9.6, 9.7_

- [ ] 22. Job detail hero screen
  - [-] 22.1 Build the Job Detail view
    - Job header (company, role, salary, posting time); one debate card per agent (agent colours, staggered entrance animation) with verdict/score/reasoning/key argument; Master decision summary; customised resume preview; editable cover-letter field; action bar (Send/Skip/Save) wiring edited cover-letter text into Send
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 16.6_

  - [x] 22.2 Write component/snapshot tests for the Job Detail view
    - Debate cards, decision summary, previews, and action bar
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_

- [ ] 23. Pipeline and supporting views
  - [-] 23.1 Build the Pipeline view
    - Table of Company/Role/Sent/Status with status badges, silent background retry on load failure, and row click opening the original debate
    - _Requirements: 17.1, 17.2, 17.3, 17.4_

  - [x] 23.2 Write component tests for the Pipeline view
    - Rendering, status badges, and silent background retry
    - _Requirements: 17.1, 17.2_

  - [x] 23.3 Build the Growth Roadmap view
    - Identified skill gap, four-week plan with linked resources, and projected match-score improvement
    - _Requirements: 19.5_

  - [x] 23.4 Build the Network Suggestions view
    - Target company + application count, connection cards (alumni/community/cold), draft outreach messages, and upcoming events
    - _Requirements: 20.5_

  - [x] 23.5 Build the Weekly Brief view
    - Applications sent, callbacks, callback rate, per-agent accuracy, and threshold adjustments for the most recent recalibration
    - _Requirements: 21.5_

  - [x] 23.6 Write component tests for the Growth, Network, and Brief views
    - Rendering of roadmap, suggestion ordering, and brief metrics
    - _Requirements: 19.5, 20.5, 21.5_

- [x] 24. Final integration and wiring
  - [x] 24.1 Wire BFF/API routes connecting the frontend to all backend services
    - Authenticated Next.js API routes mapped to the NextAuth session/Google `sub`, fronting onboarding, debate review, send, pipeline, growth, network, and brief operations
    - _Requirements: 1.2, 5.5, 13, 15, 16, 17, 19.5, 20.5, 21.5_

  - [x] 24.2 Write end-to-end integration tests for key flows
    - Onboarding → scan/debate → review → send → reply classification → recalibration against mocked external services
    - _Requirements: 7, 10, 13, 16, 18, 21_

- [x] 25. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test tasks and can be skipped for a faster MVP, but the safety-critical property tests (Properties 5, 9, 10, 22 in tasks 3.2, 5.4, 5.5, 5.11) are strongly recommended.
- Implementation language is **TypeScript** throughout, per the design.
- Each property in the design's Correctness Properties section maps to exactly one property-based test task, using **fast-check** with a minimum of 100 iterations and the tag `Feature: worksignal, Property {number}: {property_text}`.
- Each task references the specific requirement clauses it satisfies for traceability.
- Checkpoints provide incremental validation; pure-logic and property tests come before the integration and frontend layers so safety invariants are locked in early.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4", "1.5"] },
    { "id": 2, "tasks": ["2.1", "2.3", "2.5", "2.7", "3.1", "3.3", "3.5", "5.1", "5.3", "7.1", "7.3", "7.5", "8.1", "8.3", "8.5", "8.7", "8.9", "8.10", "10.1"] },
    { "id": 3, "tasks": ["2.2", "2.4", "2.6", "2.8", "3.2", "3.4", "3.6", "5.2", "5.4", "5.5", "5.6", "7.2", "7.4", "7.6", "8.2", "8.4", "8.6", "8.8", "8.11", "10.2"] },
    { "id": 4, "tasks": ["5.7", "5.8"] },
    { "id": 5, "tasks": ["5.9", "5.10"] },
    { "id": 6, "tasks": ["5.11"] },
    { "id": 7, "tasks": ["11.1", "11.3", "11.4", "12.1", "13.1", "16.1", "16.3", "17.1"] },
    { "id": 8, "tasks": ["11.2", "11.5", "11.6", "12.2", "13.2", "16.2", "16.4"] },
    { "id": 9, "tasks": ["12.3", "13.3", "14.1", "17.2", "18.1", "18.2", "18.3"] },
    { "id": 10, "tasks": ["14.2", "18.4", "19.1"] },
    { "id": 11, "tasks": ["14.3", "14.4"] },
    { "id": 12, "tasks": ["21.1", "21.3", "22.1", "23.1", "23.3", "23.4", "23.5"] },
    { "id": 13, "tasks": ["21.2", "21.4", "22.2", "23.2", "23.6", "24.1"] },
    { "id": 14, "tasks": ["24.2"] }
  ]
}
```
