import { extractPdfText } from './extractPdfText';
import {
  detectSections,
  extractOrderedSectionHeadings,
} from './resume/resumeSectionDetect';
import type { GenerationJobContext } from './demoGeneration';

const MAX_ORIGINAL_TEXT_CHARS = 12_000;

export interface BaseResumeContext {
  resumeS3Key: string;
  originalText: string;
  sectionHeadings: string[];
}

export interface ResumeGenerationContext extends GenerationJobContext {
  resumeInstructions?: string | null;
}

export interface ResumePromptInput extends ResumeGenerationContext {
  originalResumeText: string;
  sectionHeadings: string[];
}

/** Load the user's base resume PDF from S3 and extract text + section headings. */
export async function loadBaseResumeContext(
  userId: string,
): Promise<BaseResumeContext | null> {
  const { DynamoDBWrapper, S3Helper } = await import('@/app/api/lib/aws');
  const db = new DynamoDBWrapper();
  const user = await db.get<Record<string, unknown>>('Users', { user_id: userId });
  const resumeS3Key = user?.resume_s3_key as string | undefined;
  if (!resumeS3Key || resumeS3Key.startsWith('local/')) {
    return null;
  }

  const bucket = process.env.WORKSIGNAL_S3_BUCKET ?? 'worksignal-documents';
  const s3 = new S3Helper({ bucket });
  const bytes = await s3.getObject(resumeS3Key);
  if (!bytes.length) return null;

  const originalText = await extractPdfText(bytes);
  if (!originalText.trim()) return null;

  const sectionHeadings = extractOrderedSectionHeadings(originalText);
  return { resumeS3Key, originalText, sectionHeadings };
}

export function buildResumePrompt(input: ResumePromptInput): string {
  const {
    jobTitle = 'Role',
    company = 'Company',
    salary = 'Not disclosed',
    location = 'Not specified',
    userProfile = 'Not provided',
    requirements = '',
    resumeInstructions,
    originalResumeText,
    sectionHeadings,
  } = input;

  const truncatedOriginal =
    originalResumeText.length > MAX_ORIGINAL_TEXT_CHARS
      ? `${originalResumeText.slice(0, MAX_ORIGINAL_TEXT_CHARS)}\n[truncated]`
      : originalResumeText;

  const headingsList =
    sectionHeadings.length > 0
      ? sectionHeadings.map((h, i) => `${i + 1}. ${h}`).join('\n')
      : 'Use sensible resume sections (e.g. Profile, Experience, Education, Skills).';

  const tailoring =
    resumeInstructions?.trim() ||
    'Emphasise experience and skills most relevant to this job. Add metrics where possible.';

  return [
    'You are an expert resume writer. Tailor the candidate resume for the target job below.',
    'Return ONLY the finished resume text — no commentary, no markdown fences.',
    '',
    'FORMAT RULES (critical):',
    '- Keep the SAME section headings and order as the original resume.',
    '- Section headings must appear on their own lines, exactly as listed below.',
    '- Use ASCII hyphen bullets ("- ") only — no Unicode bullet characters.',
    '- Preserve general structure; only change wording and emphasis.',
    '- Do not invent employers, degrees, or dates not supported by the candidate profile.',
    '',
    'Required section headings in order:',
    headingsList,
    '',
    `Target job: ${jobTitle} at ${company}`,
    `Salary: ${salary}`,
    `Location: ${location}`,
    '',
    'Job requirements (excerpt):',
    requirements.slice(0, 800) || 'Not provided',
    '',
    'Tailoring instructions:',
    tailoring,
    '',
    'Candidate profile:',
    userProfile,
    '',
    'Original resume (reference for structure and facts):',
    truncatedOriginal,
  ].join('\n');
}

function extractProfileField(profile: string, label: string): string | null {
  const match = profile.match(new RegExp(`^${label}:\\s*(.+)$`, 'im'));
  return match?.[1]?.trim() ?? null;
}

/** Deterministic demo resume when Bedrock is unavailable. */
export function buildDemoResume(
  body: ResumeGenerationContext,
  base: BaseResumeContext | null,
): string {
  const profile = body.userProfile ?? '';
  const name = extractProfileField(profile, 'Name') ?? 'Candidate Name';
  const role = extractProfileField(profile, 'Current role') ?? 'Professional';
  const skills = extractProfileField(profile, 'Skills') ?? 'Relevant technical skills';
  const education =
    extractProfileField(profile, 'Education') ?? 'Degree, University';
  const company = body.company ?? 'Target Company';
  const jobTitle = body.jobTitle ?? 'Role';

  const headings =
    base?.sectionHeadings.length
      ? base.sectionHeadings
      : ['PROFILE', 'WORK EXPERIENCE', 'EDUCATION', 'SKILLS'];

  const sections = detectSections(base?.originalText ?? '');
  const experience =
    sections.experience ||
    `• ${role} — highlight outcomes aligned with ${jobTitle} at ${company}`;

  const lines: string[] = [name, ''];

  for (const heading of headings) {
    const upper = heading.toUpperCase();
    lines.push(heading, '');

    if (/PROFILE|SUMMARY|ABOUT/i.test(upper)) {
      lines.push(
        `Results-driven ${role.toLowerCase()} targeting the ${jobTitle} role at ${company}.`,
        '',
      );
    } else if (/EXPERIENCE|EMPLOYMENT|WORK/i.test(upper)) {
      lines.push(experience, '');
    } else if (/EDUCATION|ACADEMIC/i.test(upper)) {
      lines.push(education, '');
    } else if (/SKILL/i.test(upper)) {
      lines.push(skills, '');
    } else if (/PROJECT/i.test(upper)) {
      lines.push(
        sections.projects ||
          `• Relevant project work supporting ${jobTitle} requirements`,
        '',
      );
    } else {
      lines.push(`• Tailored content for ${heading}`, '');
    }
  }

  return lines.join('\n').trim();
}
