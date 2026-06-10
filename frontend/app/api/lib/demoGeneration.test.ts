import { describe, it, expect } from 'vitest';
import {
  buildDemoCoverLetter,
  buildDemoTailoringNotes,
  shouldUseBedrockStreaming,
} from './demoGeneration';

describe('demoGeneration', () => {
  const profile = [
    'Name: Randall Koh',
    'Current role: AI Engineer',
    'Skills: Python, React, SQL',
    'Work history:',
    '- AI Engineer at Cynapse.ai: Built CV models end-to-end.',
  ].join('\n');

  it('builds a cover letter from profile and job context', () => {
    const letter = buildDemoCoverLetter({
      jobTitle: 'Product Analyst',
      company: 'Grab',
      userProfile: profile,
      suggestedAngle: 'Highlight product analytics wins.',
    });

    expect(letter).toContain('Grab');
    expect(letter).toContain('Product Analyst');
    expect(letter).toContain('Randall Koh');
  });

  it('builds tailoring notes from job requirements', () => {
    const notes = buildDemoTailoringNotes({
      jobTitle: 'Product Analyst',
      company: 'Grab',
      userProfile: profile,
      requirements: 'Strong SQL skills and experience with data visualisation tools',
    });

    expect(notes).toContain('SQL');
    expect(notes).toContain('Grab');
  });

  it('skips Bedrock when DEMO_MODE is true and DEMO_USE_BEDROCK is unset', () => {
    const originalDemo = process.env.DEMO_MODE;
    const originalUseBedrock = process.env.DEMO_USE_BEDROCK;
    process.env.DEMO_MODE = 'true';
    delete process.env.DEMO_USE_BEDROCK;
    expect(shouldUseBedrockStreaming()).toBe(false);
    process.env.DEMO_MODE = originalDemo;
    if (originalUseBedrock) process.env.DEMO_USE_BEDROCK = originalUseBedrock;
  });
});
