/**
 * Service interface contracts for the BFF / Lambda boundary.
 *
 * These mirror the "Components and Interfaces" section of the design
 * document. Method signatures use camelCase as written in the design;
 * persisted data shapes (imported here) use snake_case.
 *
 * NOTE: The error/result shapes below (`RejectError`, `RankingError`,
 * `ValidationError`, `ParseFailure`) describe the structural contract used
 * by these interfaces. Task 1.5 implements concrete error classes that
 * satisfy these shapes.
 */

import type { AgentName, CareerStage, PriorityFactor, ResidencyStatus } from './enums';
import type {
  AmbitionVerdict,
  MasterDecision,
  OpportunityVerdict,
  RealismVerdict,
  RiskVerdict,
  Verdict,
  VerdictSet,
} from './verdicts';
import type {
  NonNegotiables,
  OnboardingState,
  ParsedProfile,
  UserConfig,
} from './user';
import type { DiscoveredJob, FilterResult, Job } from './job';
import type {
  Application,
  Classification,
  MatchResult,
  NewApplication,
} from './application';
import type { Filter_Relaxation_Suggestion } from './relaxation';
import type { SkillGapRoadmap, NetworkSuggestionSet } from './growth';
import type { RecalibrationLogEntry } from './recalibration';
import type {
  InvalidVerdict,
  ParseFailure,
  RankingError,
  RejectError,
  ValidationError,
} from './errors';

/* ------------------------------------------------------------------ *
 * Shared supporting input shapes
 *
 * The typed error classes referenced by these contracts (`RejectError`,
 * `RankingError`, `ValidationError`, `ParseFailure`, `InvalidVerdict`) are
 * the canonical classes defined in `../errors` (task 1.5).
 * ------------------------------------------------------------------ */

/** An uploaded PDF resume file (Req 2.1). */
export interface PdfFile {
  filename: string;
  contentType: string;
  /** Raw file bytes. */
  bytes: Uint8Array;
}

/* ------------------------------------------------------------------ *
 * Onboarding_Service (Req 2 storage, 3, 4, 5, 6 writes)
 * ------------------------------------------------------------------ */

export interface OnboardingService {
  uploadResume(
    userId: string,
    file: PdfFile,
  ): Promise<{ s3Key: string } | RejectError>;
  setCareerProfile(
    userId: string,
    stage: CareerStage,
    residency: ResidencyStatus,
    switchContext?: { from: string; to: string },
  ): Promise<void>;
  setTargets(
    userId: string,
    roles: string[],
    industries: string[],
    dreamCompanies: string[],
  ): Promise<void>;
  setPriorityRanking(
    userId: string,
    ranking: PriorityFactor[],
  ): Promise<void | RankingError>;
  setNonNegotiables(
    userId: string,
    nn: NonNegotiables,
  ): Promise<void | ValidationError>;
  editOnboarding(
    userId: string,
    patch: Partial<OnboardingState>,
  ): Promise<OnboardingState>;
}

/* ------------------------------------------------------------------ *
 * Auth_Service (Req 1)
 * ------------------------------------------------------------------ */

/** Redirect descriptor returned to begin the OAuth flow (Req 1.1). */
export interface OAuthRedirect {
  url: string;
  scopes: string[];
}

/** Google profile returned from the OAuth callback (Req 1.2, 1.3). */
export interface GoogleProfile {
  sub: string;
  email: string;
  name: string;
}

/** OAuth tokens returned from the callback (Req 1.4). */
export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  /** Whether the gmail.readonly scope was granted (Req 1.5). */
  gmailScopeGranted: boolean;
}

/** The authenticated session user (Req 1.2). */
export interface SessionUser {
  userId: string;
  email: string;
  name: string;
  inboxMonitoringAvailable: boolean;
}

export interface AuthService {
  beginSignIn(): OAuthRedirect;
  onCallback(profile: GoogleProfile, tokens: OAuthTokens): Promise<SessionUser>;
}

/* ------------------------------------------------------------------ *
 * Resume_Parser (Req 2 parse)
 * ------------------------------------------------------------------ */

export interface ResumeParser {
  parse(s3Key: string): Promise<ParsedProfile | ParseFailure>;
}

/* ------------------------------------------------------------------ *
 * Opportunity_Scanner (Req 7, 8.3)
 * ------------------------------------------------------------------ */

export interface OpportunityScanner {
  scan(userId: string): Promise<DiscoveredJob[]>;
}

/* ------------------------------------------------------------------ *
 * Pre_Filter (Req 8, 9) — pure function
 * ------------------------------------------------------------------ */

export interface PreFilter {
  evaluate(job: DiscoveredJob, user: UserConfig): FilterResult;
}

/* ------------------------------------------------------------------ *
 * Debate_Engine (Req 10, 11, 13, 14, 22)
 * ------------------------------------------------------------------ */

/** Outcome of running the four-agent debate for a job (Req 10.1, 10.6). */
export interface DebateResult {
  job_id: string;
  user_id: string;
  verdict_id: string;
  verdicts: VerdictSet;
  master_decision: MasterDecision;
  /** Agents whose verdicts were unavailable (Req 11.3, 22.4). */
  agent_failures: AgentName[];
}

/** Context threaded through the routing step (Req 13). */
export interface DebateContext {
  job: Job;
  user: UserConfig;
  result: DebateResult;
}

/** Generated application materials (Req 14). */
export interface Materials {
  resume_s3_key: string;
  cover_letter_text: string;
  /** False when a base-resume fallback was used (Req 14.4, 14.5). */
  customisation_applied: boolean;
}

export interface DebateEngine {
  runDebate(job: Job, user: UserConfig): Promise<DebateResult>;
  validateVerdict(raw: unknown, agent: AgentName): Verdict | InvalidVerdict;
  route(decision: MasterDecision['decision'], ctx: DebateContext): Promise<void>;
  generateMaterials(job: Job, instructions: MasterDecision): Promise<Materials>;
}

/* ------------------------------------------------------------------ *
 * Master_Orchestrator (Req 12, 6.5)
 * ------------------------------------------------------------------ */

export interface MasterOrchestrator {
  resolve(verdicts: VerdictSet, user: UserConfig): MasterDecision;
}

/** Convenience tuple of all four agent verdicts (full, non-degraded set). */
export interface FullVerdictSet {
  ambition: AmbitionVerdict;
  realism: RealismVerdict;
  risk: RiskVerdict;
  opportunity: OpportunityVerdict;
}

/* ------------------------------------------------------------------ *
 * Growth_Agent (Req 19)
 * ------------------------------------------------------------------ */

export interface GrowthAgent {
  onSkillGapFlagged(userId: string, skill: string): Promise<void>;
  buildRoadmap(userId: string, skill: string): Promise<SkillGapRoadmap>;
}

/* ------------------------------------------------------------------ *
 * Network_Agent (Req 20)
 * ------------------------------------------------------------------ */

export interface NetworkAgent {
  onCompanyInterest(userId: string, company: string): Promise<void>;
  buildSuggestions(
    userId: string,
    company: string,
  ): Promise<NetworkSuggestionSet>;
}

/* ------------------------------------------------------------------ *
 * Recalibration_Engine (Req 21)
 * ------------------------------------------------------------------ */

export interface RecalibrationEngine {
  runWeekly(userId: string): Promise<RecalibrationLogEntry>;
}

/* ------------------------------------------------------------------ *
 * Application_Sender (Req 16)
 * ------------------------------------------------------------------ */

/** Result of attempting to send / redirect an application (Req 16). */
export type SendResult =
  | { sent: true; applicationId: string; threadId: string | null }
  | { sent: false; redirected: true; sourceUrl: string }
  | { sent: false; redirected: false; reason: 'delivery_failed' };

export interface ApplicationSender {
  send(applicationId: string, editedCoverLetter?: string): Promise<SendResult>;
}

/* ------------------------------------------------------------------ *
 * Application_Tracker (Req 16.5/16.7/16.8, 17)
 * ------------------------------------------------------------------ */

export interface ApplicationTracker {
  create(record: NewApplication): Promise<Application>;
  list(userId: string): Promise<Application[]>;
  getDebate(applicationId: string): Promise<DebateResult>;
  applyClassification(
    applicationId: string,
    c: Classification,
  ): Promise<void>;
}

/* ------------------------------------------------------------------ *
 * Gmail_Monitor (Req 18)
 * ------------------------------------------------------------------ */

/** An inbound email observed during a Gmail poll (Req 18.2). */
export interface InboundEmail {
  message_id: string;
  thread_id: string;
  sender_email: string;
  sender_domain: string;
  subject: string;
  body: string;
  received_at: string;
}

export interface GmailMonitor {
  poll(userId: string): Promise<void>;
  matchApplication(email: InboundEmail, apps: Application[]): MatchResult;
  classify(
    email: InboundEmail,
  ): Promise<{ label: Classification['label']; confidence: number }>;
}

/** Re-export of the relaxation-suggestion contract for consumers. */
export type { Filter_Relaxation_Suggestion };
