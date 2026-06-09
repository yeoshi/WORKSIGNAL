/**
 * @worksignal/infra
 *
 * Infrastructure-as-code for WORKSIGNAL, targeting AWS region ap-southeast-1.
 * Defines the DynamoDB tables, private S3 bucket, EventBridge schedules,
 * Step Functions debate machine, Lambda functions, and SES configuration
 * in subsequent tasks.
 */
import { AWS_REGION } from '@worksignal/shared';

/** All WORKSIGNAL infrastructure is deployed to this region. */
export const DEPLOY_REGION = AWS_REGION;

export * from './dynamodb.js';

// Private S3 bucket for resumes and generated documents (task 1.4).
export * from './s3.js';

// EventBridge schedule skeletons: debate, Gmail poll, recalibration (task 1.4).
export * from './schedules.js';

// WorkSignal-Debate-Machine Step Functions definition (task 14.1).
export * from './debateMachine.js';
