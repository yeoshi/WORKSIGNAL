import { randomUUID } from 'node:crypto';
import { DynamoDBWrapper, S3Helper } from '@worksignal/shared';
import { generateText } from 'ai';
import type { Decision } from '@/app/types/shared';
import { getBedrockModel } from './bedrockStream';
import {
  buildDemoCoverLetter,
  buildDemoTailoringNotes,
  shouldUseBedrockStreaming,
  type GenerationJobContext,
} from './demoGeneration';
import { buildCoverLetterPrompt, buildTailoringNotesPrompt } from './generationPrompts';
import {
  buildDemoResume,
  buildResumePrompt,
  loadBaseResumeContext,
} from './resumeGeneration';
import { textToResumePdf } from './resumePdf';
import { serializeUserProfileFromRecord } from './serializeUserProfile';

const MATERIALS_DECISIONS = new Set<Decision>([
  'deadlock_escalate',
  'apply_consensus',
  'apply_with_caveat',
]);

export interface GeneratedJobMaterials {
  coverLetterText: string;
  tailoringNotes: string;
  resumeS3Key: string | null;
  resumeUrl: string | null;
  customisationApplied: boolean;
}

export function shouldGenerateJobMaterials(decision: string | undefined): boolean {
  return decision !== undefined && MATERIALS_DECISIONS.has(decision as Decision);
}

function formatSalary(min: unknown, max: unknown): string {
  const lo = typeof min === 'number' ? min : 0;
  const hi = typeof max === 'number' ? max : 0;
  if (!lo && !hi) return 'Not disclosed';
  if (lo && hi && lo !== hi) return `$${lo} – $${hi} / month`;
  return `$${hi || lo} / month`;
}

function buildContext(
  job: Record<string, unknown>,
  decision: Record<string, unknown>,
  userProfile: string,
): GenerationJobContext & { resumeInstructions?: string | null } {
  return {
    jobTitle: String(job.role_title ?? 'Role'),
    company: String(job.company ?? 'Company'),
    salary: formatSalary(job.salary_min, job.salary_max),
    location: String(job.location ?? 'Not specified'),
    userProfile,
    suggestedAngle:
      typeof decision.cover_letter_angle === 'string'
        ? decision.cover_letter_angle
        : null,
    requirements: String(job.jd_text ?? '').slice(0, 800),
    resumeInstructions:
      typeof decision.resume_instructions === 'string'
        ? decision.resume_instructions
        : null,
  };
}

async function generateResumeText(
  userId: string,
  context: GenerationJobContext & { resumeInstructions?: string | null },
): Promise<string> {
  const baseContext = await loadBaseResumeContext(userId).catch(() => null);

  if (!shouldUseBedrockStreaming()) {
    return buildDemoResume(context, baseContext);
  }

  if (!baseContext) return '';

  try {
    const { text } = await generateText({
      model: getBedrockModel(),
      prompt: buildResumePrompt({
        ...context,
        originalResumeText: baseContext.originalText,
        sectionHeadings: baseContext.sectionHeadings,
      }),
    });
    return text.trim();
  } catch (error) {
    console.warn('[jobMaterialsGeneration] Resume generation failed:', error);
    return buildDemoResume(context, baseContext);
  }
}

/** Generate cover letter, tailoring notes, and tailored resume PDF; persist to AgentVerdicts. */
export async function generateAndPersistJobMaterials(params: {
  userId: string;
  jobId: string;
  verdictId: string;
  job: Record<string, unknown>;
  decision: Record<string, unknown>;
  userProfile?: string;
}): Promise<GeneratedJobMaterials> {
  const { userId, jobId, verdictId, job, decision } = params;

  const db = new DynamoDBWrapper();

  let userProfile = params.userProfile;
  if (!userProfile) {
    const userRecord = await db.get('Users', { user_id: userId });
    userProfile = serializeUserProfileFromRecord(
      userRecord as Record<string, unknown> | null,
    );
  }

  const context = buildContext(job, decision, userProfile);
  let coverLetterText: string;
  let tailoringNotes: string;

  if (!shouldUseBedrockStreaming()) {
    coverLetterText = buildDemoCoverLetter(context);
    tailoringNotes = buildDemoTailoringNotes(context);
  } else {
    const model = getBedrockModel();
    const [coverResult, notesResult] = await Promise.all([
      generateText({ model, prompt: buildCoverLetterPrompt(context) }).catch(() => ({
        text: buildDemoCoverLetter(context),
      })),
      generateText({ model, prompt: buildTailoringNotesPrompt(context) }).catch(() => ({
        text: buildDemoTailoringNotes(context),
      })),
    ]);
    coverLetterText = coverResult.text.trim();
    tailoringNotes = notesResult.text.trim();
  }

  // Persist cover letter + notes first so the modal can show them while resume generates.
  await db.update(
    'AgentVerdicts',
    { verdict_id: verdictId },
    {
      UpdateExpression:
        'SET cover_letter_text = :cl, tailoring_notes = :tn, updated_at = :ts',
      ExpressionAttributeValues: {
        ':cl': coverLetterText,
        ':tn': tailoringNotes,
        ':ts': new Date().toISOString(),
      },
    },
  );

  const resume = await persistTailoredResumePdf({
    db,
    userId,
    jobId,
    verdictId,
    context,
  });

  return {
    coverLetterText,
    tailoringNotes,
    resumeS3Key: resume.resumeS3Key,
    resumeUrl: resume.resumeUrl,
    customisationApplied: resume.customisationApplied,
  };
}

async function persistTailoredResumePdf(params: {
  db: { update: (table: string, key: Record<string, string>, options: unknown) => Promise<unknown> };
  userId: string;
  jobId: string;
  verdictId: string;
  context: GenerationJobContext & { resumeInstructions?: string | null };
}): Promise<{
  resumeS3Key: string | null;
  resumeUrl: string | null;
  customisationApplied: boolean;
}> {
  const { db, userId, jobId, verdictId, context } = params;

  let resumeText: string;
  if (!shouldUseBedrockStreaming()) {
    const baseContext = await loadBaseResumeContext(userId).catch(() => null);
    resumeText = buildDemoResume(context, baseContext);
  } else {
    resumeText = await generateResumeText(userId, context);
  }

  if (!resumeText.trim()) {
    return { resumeS3Key: null, resumeUrl: null, customisationApplied: false };
  }

  try {
    const pdfBytes = await textToResumePdf(resumeText);
    const bucket = process.env.WORKSIGNAL_S3_BUCKET ?? 'worksignal-documents';
    const resumeS3Key = `resumes/customised/${userId}/${jobId}/${randomUUID()}/tailored-resume.pdf`;
    const s3 = new S3Helper({ bucket });
    await s3.putObject(resumeS3Key, Buffer.from(pdfBytes), {
      contentType: 'application/pdf',
    });
    const resumeUrl = await s3.getPresignedUrl(resumeS3Key);

    await db.update(
      'AgentVerdicts',
      { verdict_id: verdictId },
      {
        UpdateExpression:
          'SET customised_resume_s3_key = :key, customisation_applied = :applied, updated_at = :ts',
        ExpressionAttributeValues: {
          ':key': resumeS3Key,
          ':applied': true,
          ':ts': new Date().toISOString(),
        },
      },
    );

    return { resumeS3Key, resumeUrl, customisationApplied: true };
  } catch (error) {
    console.warn('[jobMaterialsGeneration] Resume PDF persist failed:', error);
    return { resumeS3Key: null, resumeUrl: null, customisationApplied: false };
  }
}

/** Generate and persist only the tailored resume PDF (cover letter already exists). */
export async function generateAndPersistResumeOnly(params: {
  userId: string;
  jobId: string;
  verdictId: string;
  job: Record<string, unknown>;
  decision: Record<string, unknown>;
  userProfile?: string;
}): Promise<{
  resumeS3Key: string | null;
  resumeUrl: string | null;
  customisationApplied: boolean;
}> {
  const { userId, jobId, verdictId, job, decision } = params;
  const db = new DynamoDBWrapper();

  let userProfile = params.userProfile;
  if (!userProfile) {
    const userRecord = await db.get('Users', { user_id: userId });
    userProfile = serializeUserProfileFromRecord(
      userRecord as Record<string, unknown> | null,
    );
  }

  const context = buildContext(job, decision, userProfile);
  return persistTailoredResumePdf({ db, userId, jobId, verdictId, context });
}
