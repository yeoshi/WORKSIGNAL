import { createTextStreamResponse } from 'ai';

export interface GenerationJobContext {
  jobTitle?: string;
  company?: string;
  salary?: string;
  location?: string;
  userProfile?: string;
  suggestedAngle?: string | null;
  requirements?: string;
}

function extractProfileField(profile: string, label: string): string | null {
  const match = profile.match(new RegExp(`^${label}:\\s*(.+)$`, 'im'));
  return match?.[1]?.trim() ?? null;
}

function extractFirstSkill(profile: string): string {
  const skills = extractProfileField(profile, 'Skills');
  if (!skills) return 'technical and analytical skills';
  return skills.split(',')[0]?.trim() || 'technical skills';
}

function extractRecentRole(profile: string): string {
  const role = extractProfileField(profile, 'Current role');
  if (role) return role;
  const workMatch = profile.match(/-\s*(.+?)\s+at\s+/m);
  return workMatch?.[1]?.trim() ?? 'my recent product and engineering work';
}

export function buildDemoCoverLetter(body: GenerationJobContext): string {
  const company = body.company ?? 'your company';
  const jobTitle = body.jobTitle ?? 'this role';
  const profile = body.userProfile ?? '';
  const name = extractProfileField(profile, 'Name') ?? 'Dear Hiring Manager';
  const greeting = name.startsWith('Dear') ? name : `Dear ${company} Hiring Team`;
  const role = extractRecentRole(profile);
  const skill = extractFirstSkill(profile);
  const angle =
    body.suggestedAngle?.trim() ||
    `Connect ${role} to the requirements for ${jobTitle}.`;

  return [
    greeting + ',',
    '',
    `I am excited to apply for the ${jobTitle} position at ${company}. Your listing stood out because it combines product impact with data-driven decision making — a match for my background in ${role}.`,
    '',
    `In my recent work, I have used ${skill} to ship user-facing features and translate messy problems into measurable outcomes. ${angle} I am especially motivated by the chance to bring that mix of builder mindset and analytical rigour to ${company}.`,
    '',
    `I would welcome the opportunity to discuss how my experience can support the ${jobTitle} team. Thank you for your time and consideration.`,
    '',
    name.startsWith('Dear') ? 'Best regards,' : name,
  ].join('\n');
}

export function buildDemoTailoringNotes(body: GenerationJobContext): string {
  const company = body.company ?? 'this company';
  const jobTitle = body.jobTitle ?? 'this role';
  const profile = body.userProfile ?? '';
  const role = extractRecentRole(profile);
  const requirements = body.requirements?.trim() ?? '';

  const bullets = [
    `Open with why ${company} and the ${jobTitle} role fit your background as a ${role}.`,
    'Lead with one metric-backed achievement that matches the job\'s top requirement.',
    `Name ${company} once and tie your strongest result to their product or mission.`,
  ];

  if (/product|stakeholder|cross-functional/i.test(requirements)) {
    bullets[1] =
      'Highlight cross-functional product work and one outcome stakeholders cared about.';
  } else if (/sql|dashboard|bi|tableau|data/i.test(requirements)) {
    bullets[1] =
      'Lead with a data or analytics win (dashboards, experiments, or SQL-driven insight).';
  }

  return bullets.slice(0, 4).map((line) => `- ${line}`).join('\n');
}

/** Stream plain text in small chunks for a token-by-token UX without Bedrock. */
export function streamDemoText(text: string): Response {
  const stream = new ReadableStream<string>({
    async start(controller) {
      const chunks = text.match(/.{1,12}/gs) ?? [text];
      for (const chunk of chunks) {
        controller.enqueue(chunk);
        await new Promise((resolve) => setTimeout(resolve, 18));
      }
      controller.close();
    },
  });

  return createTextStreamResponse({ textStream: stream });
}

export function shouldUseBedrockStreaming(): boolean {
  if (process.env.DEMO_MODE !== 'true') return true;
  return process.env.DEMO_USE_BEDROCK === 'true';
}
