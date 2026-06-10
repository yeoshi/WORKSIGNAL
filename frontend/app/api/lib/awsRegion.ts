/** AWS region for S3/DynamoDB/Bedrock — prefers explicit S3 override, then default env. */
export function getAwsRegion(): string {
  return (
    process.env.WORKSIGNAL_S3_REGION ??
    process.env.AWS_DEFAULT_REGION ??
    process.env.AWS_REGION ??
    'us-east-1'
  );
}
