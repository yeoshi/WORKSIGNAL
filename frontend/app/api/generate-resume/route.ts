import { streamText } from 'ai';
import { getAuthenticatedUser, unauthorizedResponse } from '../lib/auth';
import { getBedrockModel } from '../lib/bedrockStream';
import {
  shouldUseBedrockStreaming,
  streamDemoText,
} from '../lib/demoGeneration';
import {
  buildDemoResume,
  buildResumePrompt,
  loadBaseResumeContext,
  type ResumeGenerationContext,
} from '../lib/resumeGeneration';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  let body: ResumeGenerationContext;
  try {
    body = (await request.json()) as ResumeGenerationContext;
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }

  let baseContext = null;
  try {
    baseContext = await loadBaseResumeContext(user.userId);
  } catch (error) {
    console.warn('[generate-resume] Could not load base resume:', error);
  }

  if (!shouldUseBedrockStreaming()) {
    return streamDemoText(buildDemoResume(body, baseContext));
  }

  if (!baseContext) {
    return Response.json(
      {
        error: 'No resume',
        message: 'Upload a resume in your profile before generating a tailored version.',
      },
      { status: 400 },
    );
  }

  const prompt = buildResumePrompt({
    ...body,
    originalResumeText: baseContext.originalText,
    sectionHeadings: baseContext.sectionHeadings,
  });

  try {
    const result = streamText({
      model: getBedrockModel(),
      prompt,
    });
    return result.toTextStreamResponse();
  } catch (error) {
    console.warn('[generate-resume] Bedrock failed, using demo fallback:', error);
    return streamDemoText(buildDemoResume(body, baseContext));
  }
}
