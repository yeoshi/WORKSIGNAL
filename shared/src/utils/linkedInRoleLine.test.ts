import { describe, expect, it } from 'vitest';
import { extractLinkedInRoleLine, formatLinkedInRoleLine } from './linkedInRoleLine.js';

describe('extractLinkedInRoleLine', () => {
  it('extracts Software Engineer @ Google from Brendon-style scrape', () => {
    const text =
      '# Brendon Lim Software Engineer @ Google Software Engineer at [Google] (https://www.linkedin.com/company/google) Singapore (SG) 500 connections • 843 followers ## About I\'m...';
    expect(extractLinkedInRoleLine({ text, title: 'Brendon Lim' }, 'Brendon Lim')).toBe(
      'Software Engineer @ Google',
    );
  });

  it('prefers intern role at target company over student line', () => {
    const text =
      '# Tong Jess Ning Final year student at SMU | Major in Marketing Analytics Associate Product Marketing Manager Intern at [Google] (https://www.linkedin.com/company/google) Singapore';
    expect(extractLinkedInRoleLine({ text, title: 'Tong Jess Ning' }, 'Tong Jess Ning')).toBe(
      'Associate Product Marketing Manager Intern @ Google',
    );
  });

  it('uses title pipe segment when no role@company is found', () => {
    expect(
      extractLinkedInRoleLine(
        {
          title:
            'LIM Yi Hao | School of Computing and Information Systems | School of Computing showSidebars == 1',
        },
        'LIM Yi Hao',
      ),
    ).toBe('School of Computing and Information Systems');
  });
});

describe('formatLinkedInRoleLine', () => {
  it('cleans persisted scrape text for display', () => {
    const messy =
      '# Brendon Lim Software Engineer @ Google Software Engineer at [Google] Singapore... View LinkedIn profile';
    expect(formatLinkedInRoleLine(messy, 'Brendon Lim')).toBe('Software Engineer @ Google');
  });
});
