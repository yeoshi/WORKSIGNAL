import type { GenerationJobContext } from './demoGeneration';

export function buildCoverLetterPrompt(body: GenerationJobContext): string {
  const {
    jobTitle = 'Role',
    company = 'Company',
    salary = 'Not disclosed',
    location = 'Not specified',
    userProfile = 'Not provided',
    suggestedAngle,
  } = body;

  const lines = [
    'You are an expert cover-letter writer assisting a job seeker.',
    'Write a concise, compelling 3-paragraph cover letter for the job below.',
    'Return ONLY the cover letter text — no subject line, no preamble, no markdown fences.',
    '',
    `Job: ${jobTitle} at ${company}`,
    `Salary: ${salary}`,
    `Location: ${location}`,
    '',
    'Candidate profile:',
    userProfile,
  ];

  if (suggestedAngle?.trim()) {
    lines.push('', `Suggested angle: ${suggestedAngle.trim()}`);
  }

  lines.push(
    '',
    'Write a 3-paragraph cover letter:',
    '1. Open with genuine enthusiasm for this specific role and company.',
    "2. Connect 2-3 of the candidate's key strengths directly to the job requirements.",
    '3. Close warmly with availability and a call to action.',
  );

  return lines.join('\n');
}

export function buildTailoringNotesPrompt(body: GenerationJobContext): string {
  const {
    jobTitle = 'Role',
    company = 'Company',
    salary = 'Not disclosed',
    location = 'Not specified',
    userProfile = 'Not provided',
    requirements = 'Not provided',
  } = body;

  return [
    'You are a cover letter tailoring advisor.',
    'Provide exactly 3–4 short bullet points on the most important ways to personalise the cover letter for this job.',
    'Focus on: opening hook, 1–2 experiences to highlight, company-specific angle, and tone.',
    'Do NOT include resume-editing advice or exhaustive lists.',
    'Use "- " prefix for each bullet (ASCII hyphen only). Max 4 bullets total.',
    'Return ONLY the bullets — no preamble, no markdown fences.',
    '',
    `Job: ${jobTitle} at ${company}`,
    `Salary: ${salary}`,
    `Location: ${location}`,
    '',
    'Candidate profile:',
    userProfile,
    '',
    'Job requirements (excerpt):',
    requirements.slice(0, 800),
  ].join('\n');
}
