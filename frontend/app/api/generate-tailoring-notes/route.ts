import { streamText } from 'ai';
import { getAuthenticatedUser, unauthorizedResponse } from '../lib/auth';
import { getBedrockModel } from '../lib/bedrockStream';
import {
  buildDemoTailoringNotes,
  shouldUseBedrockStreaming,
  streamDemoText,
  type GenerationJobContext,
} from '../lib/demoGeneration';
import { buildTailoringNotesPrompt } from '../lib/generationPrompts';

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
    return streamDemoText(buildDemoTailoringNotes(body));
  }

  try {
    const result = streamText({
      model: getBedrockModel(),
      prompt: buildTailoringNotesPrompt(body),
    });
    return result.toTextStreamResponse();
  } catch (error) {
    console.warn('[generate-tailoring-notes] Bedrock failed, using demo fallback:', error);
    return streamDemoText(buildDemoTailoringNotes(body));
  }
}
