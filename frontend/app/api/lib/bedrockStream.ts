import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';

const bedrockRegion =
  process.env.AWS_DEFAULT_REGION ??
  process.env.AWS_REGION ??
  'ap-southeast-1';

const bedrockModelId =
  process.env.BEDROCK_MODEL_ID ?? 'us.anthropic.claude-sonnet-4-6';

const bedrock = createAmazonBedrock({
  region: bedrockRegion,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  sessionToken: process.env.AWS_SESSION_TOKEN,
});

/** Language model for cover letter, tailoring notes, and resume generation. */
export function getBedrockModel() {
  return bedrock(bedrockModelId);
}
