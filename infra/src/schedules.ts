/**
 * EventBridge schedule skeletons for WORKSIGNAL.
 *
 * Defines the three recurring schedules from the design (Scheduling /
 * EventBridge). Targets are stubbed here (`target: undefined`) and wired to
 * the concrete Step Functions machine / Lambdas in later tasks (19.1).
 *
 * Cadence (design: Scheduling table):
 * - Every 3 hours   → WorkSignal-Debate-Machine (scan → debate)   (Req 7.1)
 * - Every 30 minutes→ Gmail_Monitor Lambda                        (Req 18.1)
 * - Weekly Sun 09:00 SGT → Recalibration flow                     (Req 21.1)
 *
 * Each schedule fires on a fixed cadence, but execution is **scoped per user**
 * and gated on elapsed-time semantics (the handler checks the user's
 * `last_scan_at` / each application's `sent_at`) so behaviour is correct even
 * if a schedule fires more frequently than the logical interval.
 */
import { AWS_REGION } from '@worksignal/shared';
import { DEBATE_MACHINE_NAME } from './debateMachine.js';

/** Kinds of resources an EventBridge schedule can target. */
export type ScheduleTargetKind = 'state-machine' | 'lambda';

/**
 * Logical id of the Gmail_Monitor Lambda (design §Gmail_Monitor, Req 18). Named
 * with the `WorkSignal-` prefix to match the other deployed Lambdas referenced
 * by the debate machine (e.g. `WorkSignal-OpportunityScanner`).
 */
export const GMAIL_MONITOR_NAME = 'WorkSignal-GmailMonitor';

/**
 * Logical id of the Recalibration flow Lambda (design §Recalibration_Engine,
 * Req 21). The weekly flow is a single `runWeekly(userId)` Lambda, so the
 * schedule targets it directly (kind `lambda`).
 */
export const RECALIBRATION_FLOW_NAME = 'WorkSignal-Recalibration';

/**
 * A schedule target. `undefined` while the rule is a skeleton; populated with
 * a concrete ARN/reference when wired in task 19.1.
 */
export interface ScheduleTarget {
  readonly kind: ScheduleTargetKind;
  /** Logical id of the target resource (Step Functions machine or Lambda). */
  readonly logicalId: string;
}

/** Declarative definition of a recurring EventBridge schedule rule. */
export interface ScheduleRuleDefinition {
  /** Logical resource id used when attaching the target later. */
  readonly logicalId: string;
  /** Deployment region — must match the rest of the stack. */
  readonly region: string;
  /** Human-readable purpose of the schedule. */
  readonly description: string;
  /**
   * EventBridge schedule expression. `rate(...)` for fixed intervals,
   * `cron(...)` for calendar-based schedules.
   */
  readonly scheduleExpression: string;
  /** IANA timezone the expression is evaluated in (relevant for cron). */
  readonly timezone: string;
  /** Whether the rule is enabled on deploy. */
  readonly enabled: boolean;
  /**
   * Target to invoke. `undefined` means the rule is a skeleton awaiting
   * wiring in a later task (19.1).
   */
  readonly target: ScheduleTarget | undefined;
  /** The requirement this schedule satisfies, for traceability. */
  readonly requirement: string;
}

/** 3-hourly trigger for the scan → debate Step Functions workflow (Req 7.1). */
export const debateSchedule: ScheduleRuleDefinition = {
  logicalId: 'WorkSignalDebateSchedule',
  region: AWS_REGION,
  description: 'Every 3 hours: trigger WorkSignal-Debate-Machine (scan → debate), gated per user on last_scan_at.',
  scheduleExpression: 'rate(3 hours)',
  timezone: 'Asia/Singapore',
  enabled: true,
  // Fires every 3 hours, but the workflow gates each user on `last_scan_at`
  // so the 3-hour elapsed-time semantics hold per user (Req 7.1).
  target: {
    kind: 'state-machine',
    logicalId: DEBATE_MACHINE_NAME,
  },
  requirement: '7.1',
};

/** 30-minute trigger for the Gmail_Monitor inbox poll (Req 18.1). */
export const gmailPollSchedule: ScheduleRuleDefinition = {
  logicalId: 'WorkSignalGmailPollSchedule',
  region: AWS_REGION,
  description: 'Every 30 minutes: trigger Gmail_Monitor Lambda to poll inboxes, scoped per user.',
  scheduleExpression: 'rate(30 minutes)',
  timezone: 'Asia/Singapore',
  enabled: true,
  // Fires every 30 minutes; the handler scopes work per user and evaluates the
  // poll against each user's `last_poll_at` / applications' `sent_at` so the
  // elapsed-time semantics hold even with frequent firing (Req 18.1).
  target: {
    kind: 'lambda',
    logicalId: GMAIL_MONITOR_NAME,
  },
  requirement: '18.1',
};

/** Weekly Sunday 09:00 SGT trigger for the recalibration flow (Req 21.1). */
export const recalibrationSchedule: ScheduleRuleDefinition = {
  logicalId: 'WorkSignalRecalibrationSchedule',
  region: AWS_REGION,
  description: 'Weekly on Sunday 09:00 SGT: trigger the Recalibration flow per user.',
  // Minute 0, hour 9, any day-of-month, any month, Sunday (1 in EventBridge cron), any year.
  scheduleExpression: 'cron(0 9 ? * 1 *)',
  timezone: 'Asia/Singapore',
  enabled: true,
  // Fires weekly (Sun 09:00 SGT); the flow runs `runWeekly(userId)` scoped per
  // user against their recalibration history (Req 21.1).
  target: {
    kind: 'lambda',
    logicalId: RECALIBRATION_FLOW_NAME,
  },
  requirement: '21.1',
};

/** All WORKSIGNAL schedule rules, for convenient iteration when wiring. */
export const scheduleRules: readonly ScheduleRuleDefinition[] = [
  debateSchedule,
  gmailPollSchedule,
  recalibrationSchedule,
];
