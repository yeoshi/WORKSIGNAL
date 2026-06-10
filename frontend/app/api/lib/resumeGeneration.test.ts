import { describe, it, expect } from 'vitest';
import {
  buildDemoResume,
  buildResumePrompt,
  type ResumePromptInput,
} from './resumeGeneration';

describe('buildResumePrompt', () => {
  it('includes original section headings in order', () => {
    const input: ResumePromptInput = {
      jobTitle: 'Analyst',
      company: 'Grab',
      userProfile: 'Name: Alex',
      requirements: 'SQL required',
      resumeInstructions: 'Lead with data work',
      originalResumeText: 'Alex Chen\n\nWORK EXPERIENCE\n...',
      sectionHeadings: ['WORK EXPERIENCE', 'EDUCATION', 'SKILLS'],
    };

    const prompt = buildResumePrompt(input);

    expect(prompt).toContain('1. WORK EXPERIENCE');
    expect(prompt).toContain('2. EDUCATION');
    expect(prompt).toContain('3. SKILLS');
    expect(prompt).toContain('Keep the SAME section headings');
    expect(prompt).toContain('Lead with data work');
    expect(prompt).toContain('Grab');
  });
});

describe('buildDemoResume', () => {
  it('uses base section headings when available', () => {
    const text = buildDemoResume(
      { jobTitle: 'PM', company: 'Acme', userProfile: 'Name: Sam\nCurrent role: Engineer' },
      {
        resumeS3Key: 'resumes/u/cv.pdf',
        originalText: 'Sam\nWORK EXPERIENCE\nBuilt things',
        sectionHeadings: ['WORK EXPERIENCE', 'SKILLS'],
      },
    );

    expect(text).toContain('WORK EXPERIENCE');
    expect(text).toContain('SKILLS');
    expect(text).toContain('Sam');
  });
});
