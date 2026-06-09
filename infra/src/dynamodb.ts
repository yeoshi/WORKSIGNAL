/**
 * DynamoDB table infrastructure for WORKSIGNAL.
 *
 * Declarative, framework-free table definitions targeting AWS region
 * `ap-southeast-1` with **on-demand** (`PAY_PER_REQUEST`) billing. Each
 * definition mirrors the DynamoDB `CreateTable` input shape so it can be fed
 * directly to the AWS SDK / a deployment harness in a later task.
 *
 * DynamoDB is schemaless for non-key attributes, so only key and GSI-key
 * attributes appear in `AttributeDefinitions`. The complete item schema —
 * including the attributes added for Requirements 5, 9, 16, and 18 (flagged
 * **NEW** in the design Data Models section) — is captured in
 * `documentedAttributes` for traceability and so consumers can introspect the
 * intended shape.
 *
 * Schemas mirror design.md → Data Models.
 */
import { AWS_REGION } from '@worksignal/shared';

/** Region all WORKSIGNAL DynamoDB tables are deployed to. */
export const DYNAMODB_REGION = AWS_REGION;

/** DynamoDB scalar key attribute types. */
export type DynamoKeyType = 'S' | 'N' | 'B';

/** A key-eligible attribute declaration (DynamoDB `AttributeDefinition`). */
export interface AttributeDefinition {
  AttributeName: string;
  AttributeType: DynamoKeyType;
}

/** Role of a key attribute: `HASH` (partition) or `RANGE` (sort). */
export type KeyRole = 'HASH' | 'RANGE';

/** A single element of a (primary or index) key schema. */
export interface KeySchemaElement {
  AttributeName: string;
  KeyType: KeyRole;
}

/** Index projection configuration. */
export interface Projection {
  ProjectionType: 'ALL' | 'KEYS_ONLY' | 'INCLUDE';
  NonKeyAttributes?: string[];
}

/** A Global Secondary Index definition. */
export interface GlobalSecondaryIndex {
  IndexName: string;
  KeySchema: KeySchemaElement[];
  Projection: Projection;
}

/**
 * Documentation-only description of a stored item attribute. Non-key
 * attributes are not part of the DynamoDB table contract, but recording them
 * here keeps the intended schema (and the **NEW** additions) explicit.
 */
export interface DocumentedAttribute {
  /** Attribute name as stored in the item. */
  name: string;
  /** Logical type, free-form to allow nested/object/list shapes. */
  type: string;
  /** True for attributes added beyond PRD §13 (design "NEW" callouts). */
  isNew?: boolean;
  /** Requirement reference for NEW attributes. */
  requirement?: string;
}

/** A full DynamoDB table definition (on-demand billing). */
export interface TableDefinition {
  TableName: string;
  /** On-demand billing for every WORKSIGNAL table. */
  BillingMode: 'PAY_PER_REQUEST';
  AttributeDefinitions: AttributeDefinition[];
  KeySchema: KeySchemaElement[];
  GlobalSecondaryIndexes?: GlobalSecondaryIndex[];
  /** Complete intended item schema, including NEW attributes. */
  documentedAttributes: DocumentedAttribute[];
}

/**
 * Table: Users — partition key `user_id` (Google OAuth `sub`).
 * design.md → Data Models → Users. Requirements 1, 3, 4, 5, 6.
 */
export const UsersTable: TableDefinition = {
  TableName: 'Users',
  BillingMode: 'PAY_PER_REQUEST',
  AttributeDefinitions: [{ AttributeName: 'user_id', AttributeType: 'S' }],
  KeySchema: [{ AttributeName: 'user_id', KeyType: 'HASH' }],
  documentedAttributes: [
    { name: 'user_id', type: 'string (Google OAuth sub)' },
    { name: 'email', type: 'string' },
    { name: 'name', type: 'string' },
    { name: 'resume_s3_key', type: 'string' },
    {
      name: 'career_stage',
      type: 'fresh_grad | early_career | mid_career | senior | career_switcher',
    },
    {
      name: 'residency_status',
      type: 'citizen | pr | ep_holder | need_sponsorship',
    },
    { name: 'career_switch_context', type: '{ from: string; to: string }' },
    {
      name: 'profile',
      type: '{ current_role, years_experience, skills[], education, university, target_roles[], target_industries[], dream_companies[], priority_ranking[] }',
    },
    {
      name: 'non_negotiables',
      type: '{ min_salary, employment_type[], work_arrangement, custom[], ep_sponsorship_required }',
    },
    {
      name: 'agent_weights',
      type: '{ ambition_threshold, realism_threshold, risk_max_acceptable, opportunity_urgency_boost }',
    },
    { name: 'gmail_oauth_token', type: 'encrypted_string' },
    {
      name: 'inbox_monitoring_available',
      type: 'boolean',
      isNew: true,
      requirement: '1.5',
    },
    {
      name: 'onboarding_version',
      type: 'number',
      isNew: true,
      requirement: '5.5',
    },
    { name: 'updated_at', type: 'timestamp', isNew: true, requirement: '5.5' },
    { name: 'created_at', type: 'timestamp' },
    { name: 'last_scan_at', type: 'timestamp' },
  ],
};

/**
 * Table: Jobs — partition key `job_id`; GSI on `user_id` for per-user scans.
 * design.md → Data Models → Jobs. Requirements 7, 8, 9, 10.7.
 */
export const JobsTable: TableDefinition = {
  TableName: 'Jobs',
  BillingMode: 'PAY_PER_REQUEST',
  AttributeDefinitions: [
    { AttributeName: 'job_id', AttributeType: 'S' },
    { AttributeName: 'user_id', AttributeType: 'S' },
  ],
  KeySchema: [{ AttributeName: 'job_id', KeyType: 'HASH' }],
  GlobalSecondaryIndexes: [
    {
      IndexName: 'user_id-index',
      KeySchema: [{ AttributeName: 'user_id', KeyType: 'HASH' }],
      Projection: { ProjectionType: 'ALL' },
    },
  ],
  documentedAttributes: [
    { name: 'job_id', type: 'string' },
    { name: 'user_id', type: 'string' },
    { name: 'company', type: 'string' },
    { name: 'role_title', type: 'string' },
    { name: 'salary_min', type: 'number' },
    { name: 'salary_max', type: 'number' },
    { name: 'jd_text', type: 'string' },
    { name: 'posted_at', type: 'timestamp' },
    { name: 'source_url', type: 'string' },
    { name: 'employer_email', type: 'string | null' },
    { name: 'employment_type', type: 'string' },
    { name: 'work_arrangement', type: 'string' },
    { name: 'location', type: 'string' },
    {
      name: 'ep_sponsorship_signal',
      type: 'boolean',
      isNew: true,
      requirement: '8/9',
    },
    {
      name: 'mcf_listing_days',
      type: 'number',
      isNew: true,
      requirement: '10.7',
    },
    { name: 'scanned_at', type: 'timestamp' },
  ],
};

/**
 * Table: AgentVerdicts — partition key `verdict_id`; GSI on `(job_id, user_id)`.
 * design.md → Data Models → AgentVerdicts. Requirements 10, 11, 12, 22.
 */
export const AgentVerdictsTable: TableDefinition = {
  TableName: 'AgentVerdicts',
  BillingMode: 'PAY_PER_REQUEST',
  AttributeDefinitions: [
    { AttributeName: 'verdict_id', AttributeType: 'S' },
    { AttributeName: 'job_id', AttributeType: 'S' },
    { AttributeName: 'user_id', AttributeType: 'S' },
  ],
  KeySchema: [{ AttributeName: 'verdict_id', KeyType: 'HASH' }],
  GlobalSecondaryIndexes: [
    {
      IndexName: 'job_id-user_id-index',
      KeySchema: [
        { AttributeName: 'job_id', KeyType: 'HASH' },
        { AttributeName: 'user_id', KeyType: 'RANGE' },
      ],
      Projection: { ProjectionType: 'ALL' },
    },
  ],
  documentedAttributes: [
    { name: 'verdict_id', type: 'string' },
    { name: 'job_id', type: 'string' },
    { name: 'user_id', type: 'string' },
    {
      name: 'ambition',
      type: '{ verdict: apply|skip, score, reasoning, key_argument }',
    },
    {
      name: 'realism',
      type: '{ verdict: apply|skip|caution, score, reasoning, key_argument, gaps[], wlb_flags[] }',
    },
    {
      name: 'risk',
      type: '{ verdict: safe|caution|avoid, score, reasoning, key_argument, red_flags[], glassdoor_score }',
    },
    {
      name: 'opportunity',
      type: '{ verdict: act_now|monitor|no_advantage, score, reasoning, key_argument, timing_factors[] }',
    },
    {
      name: 'master_decision',
      type: '{ decision, summary, agents_for[], agents_against[], dissent_note, user_action_required, resume_instructions, cover_letter_angle }',
    },
    {
      name: 'master_decision.user_action_required',
      type: 'boolean',
      isNew: true,
      requirement: '12.6',
    },
    {
      name: 'agent_failures',
      type: 'string[]',
      isNew: true,
      requirement: '11.3/22.4',
    },
    { name: 'created_at', type: 'timestamp' },
  ],
};

/**
 * Table: Applications — partition key `application_id`; GSI on
 * `(user_id, company)` for Network_Agent (20.1) and role disambiguation (18.3).
 * design.md → Data Models → Applications. Requirements 14, 16, 17, 18.
 */
export const ApplicationsTable: TableDefinition = {
  TableName: 'Applications',
  BillingMode: 'PAY_PER_REQUEST',
  AttributeDefinitions: [
    { AttributeName: 'application_id', AttributeType: 'S' },
    { AttributeName: 'user_id', AttributeType: 'S' },
    { AttributeName: 'company', AttributeType: 'S' },
  ],
  KeySchema: [{ AttributeName: 'application_id', KeyType: 'HASH' }],
  GlobalSecondaryIndexes: [
    {
      IndexName: 'user_id-company-index',
      KeySchema: [
        { AttributeName: 'user_id', KeyType: 'HASH' },
        { AttributeName: 'company', KeyType: 'RANGE' },
      ],
      Projection: { ProjectionType: 'ALL' },
    },
  ],
  documentedAttributes: [
    { name: 'application_id', type: 'string' },
    { name: 'user_id', type: 'string' },
    { name: 'job_id', type: 'string' },
    { name: 'verdict_id', type: 'string' },
    { name: 'company', type: 'string' },
    { name: 'role_title', type: 'string' },
    { name: 'customised_resume_s3_key', type: 'string' },
    {
      name: 'customisation_applied',
      type: 'boolean',
      isNew: true,
      requirement: '14.4/14.5',
    },
    { name: 'cover_letter_text', type: 'string' },
    { name: 'sent_at', type: 'timestamp' },
    { name: 'recipient_email', type: 'string | null' },
    { name: 'email_thread_id', type: 'string | null' },
    {
      name: 'status',
      type: 'sent | opened | callback | rejected | ghosted | redirected_external | needs_review | delivery_failed',
      isNew: true,
      requirement: '16/18',
    },
    {
      name: 'redirect_source_url',
      type: 'string | null',
      isNew: true,
      requirement: '16.7',
    },
    {
      name: 'redirected_at',
      type: 'timestamp | null',
      isNew: true,
      requirement: '16.7',
    },
    { name: 'status_updated_at', type: 'timestamp' },
    { name: 'classification_confidence', type: 'number' },
  ],
};

/**
 * Table: SkillGaps — composite partition/sort primary key `(user_id, skill)`.
 * design.md → Data Models → SkillGaps. Requirement 19.
 */
export const SkillGapsTable: TableDefinition = {
  TableName: 'SkillGaps',
  BillingMode: 'PAY_PER_REQUEST',
  AttributeDefinitions: [
    { AttributeName: 'user_id', AttributeType: 'S' },
    { AttributeName: 'skill', AttributeType: 'S' },
  ],
  KeySchema: [
    { AttributeName: 'user_id', KeyType: 'HASH' },
    { AttributeName: 'skill', KeyType: 'RANGE' },
  ],
  documentedAttributes: [
    { name: 'user_id', type: 'string' },
    { name: 'skill', type: 'string' },
    { name: 'times_flagged', type: 'number' },
    { name: 'first_flagged_at', type: 'timestamp' },
    {
      name: 'flagged_job_ids',
      type: 'string[] (set; distinct-job counting)',
      isNew: true,
      requirement: '19.1',
    },
    {
      name: 'roadmap',
      type: '{ weeks[{ week, action, resource_url, cost, time_hours, type }], projected_match_improvement, networking_opportunities[] }',
    },
    {
      name: 'status',
      type: 'identified | roadmap_created | in_progress | completed',
    },
  ],
};

/**
 * Table: RecalibrationLog — partition key `recalibration_id`; GSI on
 * `(user_id, week_of)`.
 * design.md → Data Models → RecalibrationLog. Requirement 21.
 */
export const RecalibrationLogTable: TableDefinition = {
  TableName: 'RecalibrationLog',
  BillingMode: 'PAY_PER_REQUEST',
  AttributeDefinitions: [
    { AttributeName: 'recalibration_id', AttributeType: 'S' },
    { AttributeName: 'user_id', AttributeType: 'S' },
    { AttributeName: 'week_of', AttributeType: 'S' },
  ],
  KeySchema: [{ AttributeName: 'recalibration_id', KeyType: 'HASH' }],
  GlobalSecondaryIndexes: [
    {
      IndexName: 'user_id-week_of-index',
      KeySchema: [
        { AttributeName: 'user_id', KeyType: 'HASH' },
        { AttributeName: 'week_of', KeyType: 'RANGE' },
      ],
      Projection: { ProjectionType: 'ALL' },
    },
  ],
  documentedAttributes: [
    { name: 'recalibration_id', type: 'string' },
    { name: 'user_id', type: 'string' },
    { name: 'week_of', type: 'date' },
    {
      name: 'metrics',
      type: '{ applications_sent, callbacks, rejections, ghosted, callback_rate }',
    },
    {
      name: 'agent_performance',
      type: '{ ambition, realism, risk, opportunity: { correct, incorrect } }',
    },
    {
      name: 'adjustments_made',
      type: '{ agent, parameter, old_value, new_value, reason }[]',
    },
    {
      name: 'emergency',
      type: 'boolean',
      isNew: true,
      requirement: '21.6',
    },
    { name: 'brief_text', type: 'string' },
    { name: 'created_at', type: 'timestamp' },
  ],
};

/** All WORKSIGNAL DynamoDB tables, in deployment order. */
export const WORKSIGNAL_TABLES: readonly TableDefinition[] = [
  UsersTable,
  JobsTable,
  AgentVerdictsTable,
  ApplicationsTable,
  SkillGapsTable,
  RecalibrationLogTable,
];
