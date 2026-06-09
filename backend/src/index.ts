/**
 * @worksignal/backend
 *
 * TypeScript Lambda / Backend-for-Frontend (BFF) glue for WORKSIGNAL.
 * Houses the pure-logic modules (Pre_Filter, Master_Orchestrator decision
 * tree, validators, etc.), service implementations, and Lambda handlers
 * built in subsequent tasks.
 */
import { AWS_REGION } from '@worksignal/shared';

/** The AWS region all backend resources are deployed to. */
export const BACKEND_REGION = AWS_REGION;

// --- Onboarding pure-logic modules ---
export * from './onboarding/versioning.js';

// --- Application pure-logic modules ---
export * from './applications/statusMachine.js';
export * from './applications/replyProgression.js';

// --- Discovery pure-logic modules ---
export * from './discovery/exaQuery.js';

// --- Master_Orchestrator pure-logic modules ---
export * from './orchestrator/decisionTree.js';

// --- Debate pure-logic modules ---
export * from './debate/verdictValidator.js';

// --- Pre_Filter logic ---
export * from './preFilter/preFilter.js';
export * from './preFilter/relaxation.js';

// --- Inbox monitoring pure-logic modules ---
export * from './inbox/roleDisambiguation.js';

// --- Growth_Agent background-trigger logic ---
export * from './growth/trigger.js';

// --- Growth_Agent pure-logic modules ---
export * from './growth/roadmap.js';

// --- Network_Agent trigger logic ---
export * from './network/trigger.js';

// --- Recalibration_Engine emergency-detection logic ---
export * from './recalibration/emergency.js';

// --- Bedrock invocation wrapper ---
export * from './bedrock/invoke.js';

// --- Network_Agent suggestion cap/ordering logic ---
export * from './network/suggestions.js';

// --- Recalibration_Engine pure-logic modules ---
export * from './recalibration/accuracy.js';

// --- Master_Orchestrator apply-output gating & fast-track ordering ---
export * from './orchestrator/fastTrack.js';

// --- Master_Orchestrator degraded resolution (Req 22.4, 22.5) ---
export * from './orchestrator/degradedResolution.js';

// --- Onboarding resume upload (PDF validation + S3 storage) ---
export * from './onboarding/resumeUpload.js';

// --- Resume_Parser Bedrock extraction (Req 2.2, 2.4) ---
export * from './onboarding/resumeParser.js';

// --- Auth_Service (NextAuth Google OAuth, Req 1) ---
export * from './auth/errors.js';
export * from './auth/authService.js';

// --- Opportunity_Scanner MCF discovery & persistence (task 12.1) ---
export * from './discovery/opportunityScanner.js';

// --- The four Bedrock debate agents (task 13.1) ---
export * from './debate/agents/index.js';

// --- Application_Sender (SES send, redirect, bounce — task 16.1) ---
export * from './applications/applicationSender.js';

// --- Verdict validation + AgentVerdicts persistence (task 13.2) ---
export * from './debate/verdictPersistence.js';

// --- Onboarding_Service persistence APIs (task 11.6) ---
export * from './onboarding/onboardingService.js';

// --- Application_Tracker (Req 16.5/16.7, 17, 18.5-18.9; task 16.3) ---
export * from './applications/applicationTracker.js';

// --- Gmail_Monitor (inbox polling, matching, classification; Req 18) ---
export * from './inbox/gmailMonitor.js';

// --- Opportunity_Scanner Exa fallback discovery (task 12.2) ---
export * from './discovery/exaFallback.js';

// --- Recalibration_Engine weekly flow (Req 21; task 18.3) ---
export * from './recalibration/recalibrationEngine.js';

// --- Network_Agent background flow (Req 20; task 18.2) ---
export * from './network/networkAgent.js';

// --- Growth_Agent background flow (Req 19.1-19.4; task 18.1) ---
export * from './growth/growthAgent.js';

// --- WorkSignal-Debate-Machine in-process orchestration driver (task 14.1) ---
export * from './debate/debateMachine.js';

// --- Application material generation (Req 14; task 14.2) ---
export * from './debate/materialGeneration.js';
