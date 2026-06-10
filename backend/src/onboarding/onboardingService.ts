/**
 * Onboarding_Service persistence APIs (Task 11.6).
 *
 * Wires the pure onboarding logic modules into a stateful service that reads
 * and writes the Users table. Implements the persistence side of the
 * {@link OnboardingService} contract from `@worksignal/shared` for:
 *
 *   - `setCareerProfile` — persist Career_Stage + Residency_Status, requiring a
 *     source/target field when the stage is `career_switcher` (Req 3.1-3.4).
 *   - `setTargets`       — persist target roles, industries, dream companies
 *     (Req 4.1).
 *   - `setPriorityRanking` — validate via {@link validatePriorityRanking} and
 *     persist only an exact permutation of the six factors (Req 4.2-4.4).
 *   - `setNonNegotiables` — validate the minimum salary via
 *     {@link validateMinSalary}, apply the calibration EP salary floor, and
 *     persist (Req 5.1-5.3).
 *   - `editOnboarding`   — apply a partial edit, recompute calibration, stamp a
 *     new `onboarding_version`/`updated_at`, and return the resulting state so
 *     the most recently saved onboarding is the source of truth (Req 5.4, 5.5).
 *
 * On every save the service re-derives calibration (Req 6.1-6.4): the
 * Realism_Agent threshold from the career stage, and the Employment Pass salary
 * floor from residency + target industries (kept as a *minimum* over the
 * user-entered salary). The `career_switcher` flag is preserved so the
 * Master_Orchestrator can weight transferable skills (Req 6.5).
 *
 * The pure-logic collaborators are IMPORTED (never modified) from the sibling
 * `onboarding/*` modules. DynamoDB access and the clock are injected through
 * the constructor so the service is unit-testable without real AWS access.
 */

import {
  DynamoDBWrapper,
  RankingError,
  ValidationError,
  type AgentWeights,
  type CareerStage,
  type CareerSwitchContext,
  type Logger,
  type NonNegotiables,
  PRIORITY_FACTORS,
  type OnboardingService,
  type OnboardingState,
  type ParsedProfile,
  type PriorityFactor,
  type Profile,
  type ResidencyStatus,
} from '@worksignal/shared';

import { validatePriorityRanking } from './priorityRanking.js';
import { validateMinSalary } from './minSalary.js';
import {
  applyEpSalaryFloor,
  deriveAgentWeights,
  DEFAULT_AGENT_WEIGHTS,
} from './calibration.js';
import { stampOnSave, type OnboardingContent } from './versioning.js';

/**
 * The Users table name (design.md → Data Models → Users). Kept module-local so
 * the backend barrel does not re-export a name already owned by Auth_Service.
 */
const USERS_TABLE = 'Users';

/**
 * User-facing message returned when a `career_switcher` profile is submitted
 * without both a source and target field (Req 3.3).
 */
export const CAREER_SWITCH_CONTEXT_REQUIRED_MESSAGE =
  'A career_switcher must provide both a source field and a target field for the intended career switch.';

/**
 * The subset of the persistence APIs this task owns. `uploadResume` (the sixth
 * member of {@link OnboardingService}) is implemented separately by the resume
 * upload module (Task 11.3); declaring the owned subset keeps this class scoped
 * to the persistence methods while still binding to the shared contract.
 */
export type OnboardingPersistenceApi = Pick<
  OnboardingService,
  | 'setCareerProfile'
  | 'setTargets'
  | 'setPriorityRanking'
  | 'setNonNegotiables'
  | 'editOnboarding'
>;

/**
 * The persisted Users record as seen by the Onboarding_Service. Fields are
 * optional because onboarding is populated incrementally across the setters;
 * the index signature lets the record satisfy the DynamoDB wrapper's
 * `DynamoItem` shape while preserving fields owned by other services
 * (Auth_Service, Resume_Parser) across saves.
 */
export interface OnboardingUserRecord {
  /** Google OAuth `sub` — the Users table partition key. */
  user_id: string;
  career_stage?: CareerStage;
  residency_status?: ResidencyStatus;
  career_switch_context?: CareerSwitchContext;
  profile?: Partial<Profile>;
  non_negotiables?: NonNegotiables;
  agent_weights?: AgentWeights;
  /** Monotonic source-of-truth version stamp (Req 5.5). */
  onboarding_version?: number;
  /** ISO-8601 timestamp of the most recent save (Req 5.5). */
  updated_at?: string;
  /** ISO-8601 creation timestamp, set once on first save. */
  created_at?: string;
  /** Other service-owned fields preserved verbatim across saves. */
  [key: string]: unknown;
}

/** Placeholder non-negotiables used only to shape an as-yet-unset state. */
const PLACEHOLDER_NON_NEGOTIABLES: NonNegotiables = {
  min_salary: 0,
  employment_type: [],
  work_arrangement: 'any',
  custom: [],
  ep_sponsorship_required: false,
};

/** Injectable dependencies for {@link OnboardingServiceImpl}. */
export interface OnboardingServiceDeps {
  /** DynamoDB wrapper used to read/write the Users record. */
  db: DynamoDBWrapper;
  /** Injectable clock for deterministic `updated_at` timestamps. Defaults to `Date`. */
  now?: () => Date;
  /** Optional structured logger. */
  logger?: Logger;
}

/**
 * Concrete Onboarding_Service persistence implementation.
 *
 * All side-effecting collaborators (the DynamoDB wrapper and the clock) are
 * injected, so tests can supply a fake DynamoDB wrapper and a fixed clock.
 */
export class OnboardingServiceImpl implements OnboardingPersistenceApi {
  private readonly db: DynamoDBWrapper;
  private readonly now: () => Date;
  private readonly logger?: Logger;

  constructor(deps: OnboardingServiceDeps) {
    this.db = deps.db;
    this.now = deps.now ?? (() => new Date());
    this.logger = deps.logger;
  }

  /**
   * Persist the user's Career_Stage and Residency_Status (Req 3.1, 3.2, 3.4).
   *
   * When the stage is `career_switcher`, both a source and a target field are
   * required and persisted as the {@link CareerSwitchContext} (Req 3.3); a
   * missing/blank field raises a {@link ValidationError} before any write.
   * Otherwise any previously stored switch context is cleared. Calibration is
   * recomputed from the new stage/residency on save (Req 6.1-6.4).
   */
  async setCareerProfile(
    userId: string,
    stage: CareerStage,
    residency: ResidencyStatus,
    switchContext?: { from: string; to: string },
  ): Promise<void> {
    const record = await this.loadRecord(userId);

    if (stage === 'career_switcher') {
      const from = switchContext?.from?.trim();
      const to = switchContext?.to?.trim();
      if (!from || !to) {
        throw new ValidationError(CAREER_SWITCH_CONTEXT_REQUIRED_MESSAGE, {
          field: 'career_switch_context',
          stage,
        });
      }
      record.career_switch_context = { from, to };
    } else {
      // A non-switcher stage carries no switch context.
      delete record.career_switch_context;
    }

    record.career_stage = stage;
    record.residency_status = residency;

    await this.commit(record);
  }

  /**
   * Persist the resume-derived profile fields after the user confirms them
   * (Req 2.2, 2.4).
   */
  async confirmResumeProfile(
    userId: string,
    profile: ParsedProfile,
    resumeS3Key?: string,
  ): Promise<void> {
    const record = await this.loadRecord(userId);

    record.profile = {
      current_role: profile.current_role,
      years_experience: profile.years_experience,
      skills: profile.skills,
      education: profile.education,
      university: profile.university,
      basic_info: profile.basic_info,
      education_history: profile.education_history ?? [],
      work_experience: profile.work_experience ?? [],
      internships: profile.internships ?? [],
      projects: profile.projects ?? [],
      work_samples: profile.work_samples ?? [],
      honors_awards: profile.honors_awards ?? [],
      languages: profile.languages ?? [],
      self_introduction: profile.self_introduction ?? '',
      sns_links: profile.sns_links ?? [],
      target_roles: record.profile?.target_roles ?? [],
      target_industries: record.profile?.target_industries ?? [],
      dream_companies: record.profile?.dream_companies ?? [],
      priority_ranking:
        record.profile?.priority_ranking ?? [...PRIORITY_FACTORS],
    };

    if (resumeS3Key) {
      record.resume_s3_key = resumeS3Key;
    }

    await this.commit(record);
  }

  /**
   * Persist an optional cover letter sample for tone matching (Req 14.2).
   */
  async setCoverLetterSample(
    userId: string,
    s3Key: string,
    sampleText: string,
  ): Promise<void> {
    const record = await this.loadRecord(userId);
    record.cover_letter_sample_s3_key = s3Key;
    record.cover_letter_sample_text = sampleText;
    await this.commit(record);
  }

  /**
   * Persist the user's target roles, target industries, and dream companies
   * (Req 4.1). Target industries feed the EP salary floor derivation, so
   * calibration is recomputed on save (Req 6.3, 6.4).
   */
  async setTargets(
    userId: string,
    roles: string[],
    industries: string[],
    dreamCompanies: string[],
  ): Promise<void> {
    const record = await this.loadRecord(userId);

    record.profile = {
      ...record.profile,
      target_roles: roles,
      target_industries: industries,
      dream_companies: dreamCompanies,
    };

    await this.commit(record);
  }

  /**
   * Validate and persist the user's priority ranking (Req 4.2-4.4).
   *
   * The submission must be an exact permutation of the six priority factors.
   * On rejection nothing is persisted and the {@link RankingError} (naming the
   * offending factors) is returned to the caller; on success the validated
   * ranking is persisted in the user's profile.
   */
  async setPriorityRanking(
    userId: string,
    ranking: PriorityFactor[],
  ): Promise<void | RankingError> {
    let validated: PriorityFactor[];
    try {
      validated = validatePriorityRanking(ranking);
    } catch (error) {
      if (error instanceof RankingError) {
        // Nothing is persisted on rejection (Req 4.4).
        return error;
      }
      throw error;
    }

    const record = await this.loadRecord(userId);
    record.profile = { ...record.profile, priority_ranking: validated };
    await this.commit(record);
  }

  /**
   * Validate and persist the user's Non_Negotiables (Req 5.1-5.3).
   *
   * The minimum monthly salary must be a positive number; on rejection nothing
   * is persisted and the {@link ValidationError} is returned. On success the
   * applicable Employment Pass salary floor is applied (keeping the higher of
   * the user-entered minimum and the floor — Req 6.3, 6.4) before persisting.
   */
  async setNonNegotiables(
    userId: string,
    nn: NonNegotiables,
  ): Promise<void | ValidationError> {
    let normalized: NonNegotiables;
    try {
      normalized = { ...nn, min_salary: Math.round(validateMinSalary(nn.min_salary)) };
    } catch (error) {
      if (error instanceof ValidationError) {
        // Nothing is persisted on rejection (Req 5.3).
        return error;
      }
      throw error;
    }

    const record = await this.loadRecord(userId);

    // Apply the EP salary floor against the latest known residency/industries.
    const residency = record.residency_status;
    const industries = record.profile?.target_industries ?? [];
    record.non_negotiables =
      residency === undefined
        ? normalized
        : applyEpSalaryFloor(normalized, residency, industries);

    await this.commit(record);
  }

  /**
   * Apply a partial edit to the user's onboarding and return the resulting,
   * fully-stamped {@link OnboardingState} (Req 5.4, 5.5).
   *
   * Any edited priority ranking and minimum salary are re-validated; calibration
   * is recomputed and a new `onboarding_version`/`updated_at` is stamped so the
   * most recently saved onboarding is the source of truth for all subsequent
   * agent evaluations and Pre_Filter filtering.
   *
   * @throws {RankingError}     when the patch contains an invalid priority ranking.
   * @throws {ValidationError}  when the patch contains a non-positive minimum
   *                            salary or a `career_switcher` stage without a
   *                            complete switch context.
   */
  async editOnboarding(
    userId: string,
    patch: Partial<OnboardingState>,
  ): Promise<OnboardingState> {
    const record = await this.loadRecord(userId);

    // Career stage / residency / switch context.
    const nextStage = patch.career_stage ?? record.career_stage;
    if (patch.career_stage !== undefined) {
      record.career_stage = patch.career_stage;
    }
    if (patch.residency_status !== undefined) {
      record.residency_status = patch.residency_status;
    }
    if (patch.career_switch_context !== undefined) {
      record.career_switch_context = patch.career_switch_context;
    }

    // A career_switcher must always carry a complete switch context (Req 3.3).
    if (nextStage === 'career_switcher') {
      const ctx = record.career_switch_context;
      const from = ctx?.from?.trim();
      const to = ctx?.to?.trim();
      if (!from || !to) {
        throw new ValidationError(CAREER_SWITCH_CONTEXT_REQUIRED_MESSAGE, {
          field: 'career_switch_context',
          stage: nextStage,
        });
      }
      record.career_switch_context = { from, to };
    } else if (patch.career_stage !== undefined) {
      // Stage edited away from career_switcher: drop the stale context.
      delete record.career_switch_context;
    }

    // Targets.
    const profilePatch: Partial<Profile> = { ...record.profile };
    if (patch.target_roles !== undefined) {
      profilePatch.target_roles = patch.target_roles;
    }
    if (patch.target_industries !== undefined) {
      profilePatch.target_industries = patch.target_industries;
    }
    if (patch.dream_companies !== undefined) {
      profilePatch.dream_companies = patch.dream_companies;
    }

    // Priority ranking (re-validated — Req 4.3, 4.4).
    if (patch.priority_ranking !== undefined) {
      profilePatch.priority_ranking = validatePriorityRanking(
        patch.priority_ranking,
      );
    }
    record.profile = profilePatch;

    // Non-negotiables (re-validate minimum salary — Req 5.3).
    if (patch.non_negotiables !== undefined) {
      record.non_negotiables = {
        ...patch.non_negotiables,
        min_salary: Math.round(validateMinSalary(patch.non_negotiables.min_salary)),
      };
    }

    return this.commit(record);
  }

  // --- Internal helpers -------------------------------------------------

  /**
   * Load the user's record, or initialise a minimal one (with `created_at`
   * stamped) when none exists yet.
   */
  private async loadRecord(userId: string): Promise<OnboardingUserRecord> {
    const existing = await this.db.get<OnboardingUserRecord>(USERS_TABLE, {
      user_id: userId,
    });
    if (existing) {
      return existing;
    }
    return { user_id: userId, created_at: this.now().toISOString() };
  }

  /**
   * Re-derive calibration, stamp a new version + `updated_at`, persist the
   * record, and return the resulting {@link OnboardingState}.
   *
   * Recalibration (Req 6): the Realism threshold is derived from the career
   * stage into `agent_weights`, and the EP salary floor is applied to the
   * non-negotiables when the residency status and non-negotiables are known.
   */
  private async commit(
    record: OnboardingUserRecord,
  ): Promise<OnboardingState> {
    this.recalibrate(record);

    const stamped = stampOnSave(
      this.recordToContent(record),
      record.onboarding_version,
      { now: this.now() },
    );
    record.onboarding_version = stamped.onboarding_version;
    record.updated_at = stamped.updated_at;
    if (record.created_at === undefined) {
      record.created_at = stamped.updated_at;
    }

    await this.db.put(USERS_TABLE, record);

    this.logger?.info('Onboarding saved', {
      userId: record.user_id,
      onboardingVersion: stamped.onboarding_version,
    });

    return stamped;
  }

  /**
   * Re-derive the calibration-dependent fields in place (Req 6.1-6.4):
   *   - `agent_weights` from the career stage (Realism threshold 70/80/85);
   *   - the EP salary floor applied to `non_negotiables` for `need_sponsorship`
   *     users, keeping the higher of the user's minimum and the floor.
   */
  private recalibrate(record: OnboardingUserRecord): void {
    if (record.career_stage !== undefined) {
      record.agent_weights = deriveAgentWeights(
        record.career_stage,
        record.agent_weights ?? DEFAULT_AGENT_WEIGHTS,
      );
    }
    if (
      record.non_negotiables !== undefined &&
      record.residency_status !== undefined
    ) {
      record.non_negotiables = applyEpSalaryFloor(
        record.non_negotiables,
        record.residency_status,
        record.profile?.target_industries ?? [],
      );
    }
  }

  /**
   * Project the persisted (nested) record onto the flattened editable
   * {@link OnboardingContent} view that the versioning module stamps. Missing
   * fields fall back to safe defaults so the projection is always well-formed;
   * the placeholders are never written back to the persisted record.
   */
  private recordToContent(record: OnboardingUserRecord): OnboardingContent {
    const content: OnboardingContent = {
      career_stage: record.career_stage ?? 'early_career',
      residency_status: record.residency_status ?? 'citizen',
      target_roles: record.profile?.target_roles ?? [],
      target_industries: record.profile?.target_industries ?? [],
      dream_companies: record.profile?.dream_companies ?? [],
      priority_ranking: record.profile?.priority_ranking ?? [],
      non_negotiables: record.non_negotiables ?? PLACEHOLDER_NON_NEGOTIABLES,
    };
    if (record.career_switch_context !== undefined) {
      content.career_switch_context = record.career_switch_context;
    }
    return content;
  }
}

/** Convenience factory mirroring the {@link OnboardingServiceImpl} constructor. */
export function createOnboardingService(
  deps: OnboardingServiceDeps,
): OnboardingServiceImpl {
  return new OnboardingServiceImpl(deps);
}
