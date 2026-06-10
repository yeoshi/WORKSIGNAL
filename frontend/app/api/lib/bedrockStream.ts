import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { createGateway } from '@ai-sdk/gateway';

const bedrockRegion =
  process.env.AWS_DEFAULT_REGION ??
  process.env.AWS_REGION ??
  'ap-southeast-1';

const bedrockModelId =
  process.env.BEDROCK_MODEL_ID ?? 'us.anthropic.claude-sonnet-4-6';

/** Gateway model id (provider/model). See Vercel AI Gateway model list. */
const gatewayModelId =
  process.env.AI_GATEWAY_MODEL_ID ?? 'anthropic/claude-sonnet-4.6';

const bedrock = createAmazonBedrock({
  region: bedrockRegion,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  sessionToken: process.env.AWS_SESSION_TOKEN,
});

/** True when Vercel AI Gateway should route AI SDK generation calls. */
export function usesAiGateway(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY?.trim());
}

/**
 * Language model for cover letter, tailoring notes, and resume generation.
 * Prefers Vercel AI Gateway when `AI_GATEWAY_API_KEY` is set; otherwise direct Bedrock.
 */
export function getBedrockModel() {
  if (usesAiGateway()) {
    const gateway = createGateway({
      apiKey: process.env.AI_GATEWAY_API_KEY,
    });
    return gateway(gatewayModelId);
  }

  return bedrock(bedrockModelId);
}
