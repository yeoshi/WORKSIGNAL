import { streamText } from 'ai';
import { getAuthenticatedUser, unauthorizedResponse } from '../lib/auth';
import { getBedrockModel } from '../lib/bedrockStream';
import {
  buildDemoCoverLetter,
  shouldUseBedrockStreaming,
  streamDemoText,
  type GenerationJobContext,
} from '../lib/demoGeneration';
import { buildCoverLetterPrompt } from '../lib/generationPrompts';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  let body: GenerationJobContext;
  try {
    body = (await request.json()) as GenerationJobContext;
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!shouldUseBedrockStreaming()) {
    return streamDemoText(buildDemoCoverLetter(body));
  }

  try {
    const result = streamText({
      model: getBedrockModel(),
      prompt: buildCoverLetterPrompt(body),
    });
    return result.toTextStreamResponse();
  } catch (error) {
    console.warn('[generate-cover-letter] Bedrock failed, using demo fallback:', error);
    return streamDemoText(buildDemoCoverLetter(body));
  }
}
