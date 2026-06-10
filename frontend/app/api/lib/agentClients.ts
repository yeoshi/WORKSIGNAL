/**
 * Shared Bedrock + Exa clients for in-process agent run routes.
 */

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { getAwsRegion } from './awsRegion';

export function createBedrockClient() {
  const region = getAwsRegion();
  return new BedrockRuntimeClient({
    region,
    credentials: process.env.AWS_ACCESS_KEY_ID
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
          sessionToken: process.env.AWS_SESSION_TOKEN,
        }
      : undefined,
  });
}

export function createBedrockInvoke(
  client: BedrockRuntimeClient,
  modelId = process.env.BEDROCK_MODEL_ID ?? 'us.anthropic.claude-sonnet-4-6',
) {
  return async (req: { system: string; user: string }): Promise<string> => {
    const cmd = new InvokeModelCommand({
      modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: new TextEncoder().encode(
        JSON.stringify({
          anthropic_version: 'bedrock-2023-05-31',
          max_tokens: 2048,
          system: req.system,
          messages: [{ role: 'user', content: req.user }],
        }),
      ),
    });
    const res = await client.send(cmd);
    const body = JSON.parse(new TextDecoder().decode(res.body)) as {
      content: Array<{ text: string }>;
    };
    const text = body.content[0]?.text;
    if (text === undefined) throw new Error('Bedrock response missing content[0].text');
    return text;
  };
}

export interface ExaSearchOptions {
  /** When true, request page text snippets (used for network contact context). */
  includeText?: boolean;
}

export async function exaSearchRaw(
  query: string,
  numResults = 3,
  options?: ExaSearchOptions,
): Promise<Array<{ url: string; title?: string; text?: string | null; publishedDate?: string | null }>> {
  const key = process.env.EXA_API_KEY ?? '';
  if (!key) return [];
  const contents = options?.includeText ? { text: true } : { text: false };
  const res = await fetch('https://api.exa.ai/search', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      'x-api-key': key,
    },
    body: JSON.stringify({ query, numResults, type: 'auto', contents }),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    results?: Array<{ url?: string; title?: string; text?: string | null; publishedDate?: string | null }>;
  };
  return (data.results ?? []).map((r) => ({
    url: r.url ?? '',
    title: r.title,
    text: r.text,
    publishedDate: r.publishedDate,
  }));
}
