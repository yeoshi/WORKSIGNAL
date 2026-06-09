/**
 * Filter_Relaxation_Suggestion derivation and lifecycle (Requirements 9.5-9.8).
 *
 * Pure, deterministic logic — no I/O. This module covers the "too-strict
 * relaxation flow" that runs around the Pre_Filter (design §Pre_Filter, Too-
 * strict relaxation flow 9.5-9.8):
 *
 *  (a) **Detection (9.5/9.6):** {@link allJobsDiscarded} reports whether a scan
 *      run discarded *every* scanned job (the trigger for notifying the user and
 *      deriving a suggestion).
 *  (b) **Derivation (9.6):** {@link deriveRelaxationSuggestion} produces a
 *      concrete {@link Filter_Relaxation_Suggestion} from the scanned jobs — for
 *      the canonical case, lowering the minimum salary to surface N of M jobs —
 *      with a human-readable rationale and the evidence job ids the suggestion is
 *      drawn from.
 *  (c) **Lifecycle (9.7/9.8):** a `pending → approved | rejected | expired` state
 *      machine in which the user's non-negotiables mutate **only** on an explicit
 *      transition to `approved` ({@link processLifecycleEvent}), and remain
 *      unchanged while the suggestion is `pending` or after it is `rejected` /
 *      `expired`.
 *
 * Safety-critical (Property 7): for *any* sequence of lifecycle events, the
 * user's non-negotiables remain equal to their pre-suggestion values unless and
 * until the user explicitly approves a suggestion, after which exactly the
 * approved adjustment is applied. Suggestions in `pending`, `rejected`, or
 * `expired` state never mutate non-negotiables, and approval applies the change
 * at most once (terminal states ignore further events).
 *
 * The legal Singapore work-pass guardrails (`location`, EP salary floor, EP
 * sponsorship) are intentionally **not** relaxable: they are constraints no
 * agent may override, so the derivation never proposes adjusting them.
 */

import type {
  DiscoveredJob,
  EmploymentType,
  Filter_Relaxation_Suggestion,
  FilterResult,
  Logger,
  NonNegotiableKey,
  NonNegotiables,
  RelaxationTarget,
  UserConfig,
  WorkArrangement,
} from '@worksignal/shared';
import { preFilter, type PreFilterOptions } from './preFilter.js';

// --- Scan-run evaluation -----------------------------------------------------

/** A single scanned job paired with its Pre_Filter result. */
export interface ScannedJobEvaluation {
  job: DiscoveredJob;
  result: FilterResult;
}

/**
 * Evaluate every scanned job against the user's non-negotiables, pairing each
 * job with its {@link FilterResult}. A thin, deterministic bridge over
 * {@link preFilter} that produces the input shape consumed by
 * {@link allJobsDiscarded} and {@link deriveRelaxationSuggestion}.
 */
export function evaluateScanRun(
  jobs: readonly DiscoveredJob[],
  user: UserConfig,
  options: PreFilterOptions = {},
): ScannedJobEvaluation[] {
  return jobs.map((job) => ({ job, result: preFilter(job, user, options) }));
}

/**
 * Detect whether a scan run discarded **every** scanned job (Req 9.5, 9.6).
 *
 * Returns `true` only when at least one job was scanned and none of them passed
 * the Pre_Filter. An empty run (no jobs scanned) returns `false` — there is
 * nothing to relax when nothing was discovered.
 */
export function allJobsDiscarded(
  evaluations: readonly ScannedJobEvaluation[],
): boolean {
  return evaluations.length > 0 && evaluations.every((e) => !e.result.pass);
}

// --- Derivation --------------------------------------------------------------

/**
 * The non-negotiables a relaxation suggestion may target. The Singapore
 * work-pass guardrails (`location`, EP floor, EP sponsorship) are deliberately
 * excluded — they are legal constraints that are never auto-relaxed.
 */
const RELAXABLE_TARGETS: readonly RelaxationTarget[] = [
  'min_salary',
  'employment_type',
  'work_arrangement',
  'custom',
] as const;

/**
 * Map a violated {@link NonNegotiableKey} to the coarser
 * {@link RelaxationTarget} it belongs to, or `null` when the violated key is a
 * non-relaxable guardrail (`location`, `ep_salary_floor`, `ep_sponsorship`).
 */
function violationToRelaxationTarget(
  key: NonNegotiableKey,
): RelaxationTarget | null {
  switch (key) {
    case 'min_salary':
      return 'min_salary';
    case 'employment_type':
      return 'employment_type';
    case 'work_arrangement':
      return 'work_arrangement';
    case 'custom':
      return 'custom';
    case 'location':
    case 'ep_salary_floor':
    case 'ep_sponsorship':
      return null;
  }
}

/**
 * The single relaxable target that, if relaxed alone, would surface a discarded
 * job — i.e. the job's *only* violation is that one relaxable non-negotiable.
 * Returns `null` when the job passed, violated nothing relaxable on its own, or
 * was blocked by more than one non-negotiable (relaxing one would not surface
 * it).
 */
function soleRelaxableTarget(
  result: FilterResult,
): RelaxationTarget | null {
  if (result.pass) {
    return null;
  }
  const [onlyViolation, ...rest] = result.violated;
  if (onlyViolation === undefined || rest.length > 0) {
    return null;
  }
  return violationToRelaxationTarget(onlyViolation);
}

/** Context the caller supplies so derivation stays pure and deterministic. */
export interface RelaxationContext {
  /** Stable identifier for the suggestion (e.g. a generated UUID). */
  suggestion_id: string;
  user_id: string;
  /** The scan run in which every job was discarded (Req 9.6). */
  scan_run_id: string;
  /** ISO timestamp for `created_at`. */
  created_at: string;
}

/** A group of discarded jobs that share a single relaxable blocker. */
interface TargetCandidates {
  target: RelaxationTarget;
  jobs: DiscoveredJob[];
}

/**
 * Group the discarded jobs by the single relaxable non-negotiable that blocks
 * them, preserving the {@link RELAXABLE_TARGETS} order for deterministic
 * tie-breaking.
 */
function groupSoleRelaxableCandidates(
  evaluations: readonly ScannedJobEvaluation[],
): TargetCandidates[] {
  const byTarget = new Map<RelaxationTarget, DiscoveredJob[]>();
  for (const { job, result } of evaluations) {
    const target = soleRelaxableTarget(result);
    if (target === null) {
      continue;
    }
    const bucket = byTarget.get(target);
    if (bucket) {
      bucket.push(job);
    } else {
      byTarget.set(target, [job]);
    }
  }
  return RELAXABLE_TARGETS.filter((t) => byTarget.has(t)).map((target) => ({
    target,
    jobs: byTarget.get(target) as DiscoveredJob[],
  }));
}

/** Deterministically sorted, de-duplicated evidence job ids. */
function evidenceJobIds(jobs: readonly DiscoveredJob[]): string[] {
  return [...new Set(jobs.map((j) => j.job_id))].sort();
}

/**
 * Build the proposed adjustment for a chosen target from its candidate jobs.
 * Returns the current value, the proposed value, and a phrase describing the
 * change for the rationale. Returns `null` when no concrete proposal can be
 * formed for the target.
 */
function buildProposal(
  target: RelaxationTarget,
  candidates: readonly DiscoveredJob[],
  nn: NonNegotiables,
): { current_value: unknown; proposed_value: unknown; change: string } | null {
  switch (target) {
    case 'min_salary': {
      // Lowering the minimum salary to the lowest ceiling among the salary-only
      // blocked jobs surfaces all of them with the smallest possible reduction.
      const proposed = Math.min(...candidates.map((j) => j.salary_max));
      if (!Number.isFinite(proposed) || proposed >= nn.min_salary) {
        return null;
      }
      return {
        current_value: nn.min_salary,
        proposed_value: proposed,
        change: `minimum salary from ${nn.min_salary} to ${proposed}`,
      };
    }
    case 'work_arrangement': {
      // The only broadening that surfaces an arrangement-blocked job is `any`.
      if (nn.work_arrangement === 'any') {
        return null;
      }
      const proposed: WorkArrangement = 'any';
      return {
        current_value: nn.work_arrangement,
        proposed_value: proposed,
        change: `work arrangement from ${nn.work_arrangement} to ${proposed}`,
      };
    }
    case 'employment_type': {
      // Add the candidate jobs' employment types to the accepted set.
      const additions = [
        ...new Set(
          candidates.map((j) => j.employment_type as EmploymentType),
        ),
      ];
      const proposed = [
        ...new Set<EmploymentType>([...nn.employment_type, ...additions]),
      ];
      if (proposed.length === nn.employment_type.length) {
        return null;
      }
      return {
        current_value: [...nn.employment_type],
        proposed_value: proposed,
        change: `accepted employment types to include ${additions.join(', ')}`,
      };
    }
    case 'custom': {
      // Custom dealbreakers cannot be safely auto-narrowed without knowing which
      // dealbreaker matched; defer to the user rather than guessing.
      return null;
    }
    case 'ep_related':
      // Legal guardrail — never auto-relaxed.
      return null;
  }
}

/** Options for {@link deriveRelaxationSuggestion}. */
export interface DeriveRelaxationOptions {
  /** Optional structured logger for internal analytics (Req 9.2 spirit). */
  logger?: Logger;
}

/**
 * Derive a concrete {@link Filter_Relaxation_Suggestion} from a scan run's
 * evaluations (Req 9.6).
 *
 * Strategy: among the discarded jobs, find those whose **single** blocker is a
 * relaxable non-negotiable; group them by that non-negotiable; choose the target
 * that would surface the most jobs (ties broken by {@link RELAXABLE_TARGETS}
 * order); and propose the minimal adjustment that surfaces that group. The
 * suggestion is created in the `pending` state and carries the evidence job ids
 * it was drawn from and a human-readable rationale ("N of M scanned jobs would
 * pass").
 *
 * Returns `null` when no relaxable single-blocker job exists (e.g. every job was
 * blocked by location or an EP guardrail, or by multiple non-negotiables at
 * once). In that case the user is still notified (Req 9.5) but no concrete,
 * safe adjustment can be proposed.
 *
 * The returned suggestion never mutates the user's non-negotiables; application
 * happens only on explicit approval via {@link processLifecycleEvent}.
 */
export function deriveRelaxationSuggestion(
  evaluations: readonly ScannedJobEvaluation[],
  context: RelaxationContext,
  nonNegotiables: NonNegotiables,
  options: DeriveRelaxationOptions = {},
): Filter_Relaxation_Suggestion | null {
  const totalScanned = evaluations.length;
  if (totalScanned === 0) {
    return null;
  }

  const groups = groupSoleRelaxableCandidates(evaluations);

  // Choose the target surfacing the most jobs; RELAXABLE_TARGETS ordering breaks
  // ties deterministically (groups are already in that order).
  let best: { proposal: NonNullable<ReturnType<typeof buildProposal>>; group: TargetCandidates } | null =
    null;
  for (const group of groups) {
    const proposal = buildProposal(group.target, group.jobs, nonNegotiables);
    if (proposal === null) {
      continue;
    }
    if (best === null || group.jobs.length > best.group.jobs.length) {
      best = { proposal, group };
    }
  }

  if (best === null) {
    options.logger?.info('relaxation.no_suggestion', {
      user_id: context.user_id,
      scan_run_id: context.scan_run_id,
      total_scanned: totalScanned,
    });
    return null;
  }

  const surfaced = best.group.jobs.length;
  const evidence = evidenceJobIds(best.group.jobs);
  const suggestion: Filter_Relaxation_Suggestion = {
    suggestion_id: context.suggestion_id,
    user_id: context.user_id,
    created_at: context.created_at,
    scan_run_id: context.scan_run_id,
    target_non_negotiable: best.group.target,
    current_value: best.proposal.current_value,
    proposed_value: best.proposal.proposed_value,
    rationale: `Lowering ${best.proposal.change} would surface ${surfaced} of ${totalScanned} scanned jobs.`,
    evidence_job_ids: evidence,
    approval_state: 'pending',
  };

  options.logger?.info('relaxation.suggested', {
    user_id: context.user_id,
    scan_run_id: context.scan_run_id,
    target: suggestion.target_non_negotiable,
    surfaced,
    total_scanned: totalScanned,
  });

  return suggestion;
}

// --- Lifecycle state machine -------------------------------------------------

/** An explicit user/system action applied to a suggestion's lifecycle. */
export type LifecycleEvent = 'approve' | 'reject' | 'expire';

/** Maps each lifecycle event to the terminal state it transitions to. */
const EVENT_TARGET_STATE = {
  approve: 'approved',
  reject: 'rejected',
  expire: 'expired',
} as const satisfies Record<LifecycleEvent, Filter_Relaxation_Suggestion['approval_state']>;

/**
 * True when a suggestion is in a terminal state (`approved`, `rejected`, or
 * `expired`) and can no longer transition.
 */
export function isTerminal(
  state: Filter_Relaxation_Suggestion['approval_state'],
): boolean {
  return state !== 'pending';
}

/**
 * Whether the given event may be applied to a suggestion in the given state.
 * Only `pending` suggestions accept events; terminal states accept none.
 */
export function canApplyEvent(
  state: Filter_Relaxation_Suggestion['approval_state'],
  _event: LifecycleEvent,
): boolean {
  return state === 'pending';
}

/**
 * Apply the suggestion's proposed adjustment to a set of non-negotiables.
 *
 * The change is applied **only** when the suggestion's `approval_state` is
 * `approved` (Req 9.7); for any other state the non-negotiables are returned
 * unchanged (Req 9.8). The legal `ep_related` guardrail is never applied even
 * if approved.
 */
export function applyApprovedAdjustment(
  nonNegotiables: NonNegotiables,
  suggestion: Filter_Relaxation_Suggestion,
): NonNegotiables {
  if (suggestion.approval_state !== 'approved') {
    return nonNegotiables;
  }
  switch (suggestion.target_non_negotiable) {
    case 'min_salary':
      return typeof suggestion.proposed_value === 'number'
        ? { ...nonNegotiables, min_salary: suggestion.proposed_value }
        : nonNegotiables;
    case 'work_arrangement':
      return { ...nonNegotiables, work_arrangement: suggestion.proposed_value as WorkArrangement };
    case 'employment_type':
      return Array.isArray(suggestion.proposed_value)
        ? { ...nonNegotiables, employment_type: suggestion.proposed_value as EmploymentType[] }
        : nonNegotiables;
    case 'custom':
      return Array.isArray(suggestion.proposed_value)
        ? { ...nonNegotiables, custom: suggestion.proposed_value as string[] }
        : nonNegotiables;
    case 'ep_related':
      // Legal guardrail — never mutated.
      return nonNegotiables;
  }
}

/** The result of folding a lifecycle event over a suggestion + non-negotiables. */
export interface RelaxationOutcome {
  /** The suggestion after the event (state-transitioned, or unchanged). */
  suggestion: Filter_Relaxation_Suggestion;
  /** The non-negotiables after the event — only ever changed on approval. */
  non_negotiables: NonNegotiables;
  /** Whether this event mutated the non-negotiables. */
  applied: boolean;
}

/**
 * Process a single lifecycle event against a suggestion and the user's current
 * non-negotiables (Req 9.7, 9.8) — the core of Property 7.
 *
 * This is a **total** function over arbitrary event sequences:
 *  - From `pending`: the event transitions the suggestion to its terminal state.
 *    On `approve` (and only then) the proposed adjustment is applied to the
 *    non-negotiables; on `reject` / `expire` the non-negotiables are left
 *    unchanged.
 *  - From any terminal state: the event is ignored (the suggestion and
 *    non-negotiables are returned unchanged), so approval applies at most once
 *    and a rejected/expired suggestion can never later mutate non-negotiables.
 *
 * Returned objects are fresh on transition; the input objects are never mutated.
 */
export function processLifecycleEvent(
  suggestion: Filter_Relaxation_Suggestion,
  nonNegotiables: NonNegotiables,
  event: LifecycleEvent,
): RelaxationOutcome {
  if (!canApplyEvent(suggestion.approval_state, event)) {
    // Terminal state — ignore the event entirely (idempotent / no re-application).
    return { suggestion, non_negotiables: nonNegotiables, applied: false };
  }

  const transitioned: Filter_Relaxation_Suggestion = {
    ...suggestion,
    approval_state: EVENT_TARGET_STATE[event],
  };

  const non_negotiables = applyApprovedAdjustment(nonNegotiables, transitioned);
  return {
    suggestion: transitioned,
    non_negotiables,
    applied: non_negotiables !== nonNegotiables,
  };
}

/**
 * Fold a sequence of lifecycle events over a suggestion and non-negotiables,
 * returning the final {@link RelaxationOutcome}. Convenience wrapper over
 * {@link processLifecycleEvent} used to reason about whole event histories
 * (Property 7). `applied` is `true` iff the non-negotiables were mutated by any
 * event in the sequence (i.e. an approval occurred).
 */
export function applyLifecycleEvents(
  suggestion: Filter_Relaxation_Suggestion,
  nonNegotiables: NonNegotiables,
  events: readonly LifecycleEvent[],
): RelaxationOutcome {
  let outcome: RelaxationOutcome = {
    suggestion,
    non_negotiables: nonNegotiables,
    applied: false,
  };
  for (const event of events) {
    const next = processLifecycleEvent(
      outcome.suggestion,
      outcome.non_negotiables,
      event,
    );
    outcome = {
      suggestion: next.suggestion,
      non_negotiables: next.non_negotiables,
      applied: outcome.applied || next.applied,
    };
  }
  return outcome;
}
