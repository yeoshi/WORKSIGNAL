import { describe, expect, it } from 'vitest';
import {
  deriveCurrentRole,
  deriveHeadlineRole,
  deriveYearsExperience,
  hasValidWorkExperience,
} from './resumeProfileDerivation';

describe('resumeProfileDerivation', () => {
  it('derives current role from the Present entry with the latest start date', () => {
    const role = deriveCurrentRole([
      {
        company: 'The Oddle Company',
        title: 'Associate Product Manager',
        start: '2024-06',
        end: 'Present',
        description: '',
      },
      {
        company: 'CallBridge',
        title: 'Product Manager/Co-founder',
        start: '2025-06',
        end: 'Present',
        description: '',
      },
    ]);

    expect(role).toBe('Product Manager/Co-founder');
  });

  it('sums experience years across work and internships', () => {
    const years = deriveYearsExperience(
      [
        {
          company: 'The Oddle Company',
          title: 'Associate Product Manager',
          start: '2024-06',
          end: 'Present',
          description: '',
        },
      ],
      [
        {
          company: 'Razer Inc.',
          title: 'Product Management Intern',
          start: '2023-06',
          end: '2023-12',
          description: '',
        },
      ],
    );

    expect(years).toBeGreaterThan(0);
  });

  it('falls back to internships then projects when work experience is empty', () => {
    expect(
      deriveHeadlineRole(
        [],
        [
          {
            company: 'Razer Inc.',
            title: 'Product Management Intern',
            start: '2023-06',
            end: '2023-12',
            description: '',
          },
        ],
        [],
      ),
    ).toBe('Product Management Intern');

    expect(
      deriveHeadlineRole([], [], [
        {
          project_name: 'TravelBuddy',
          title: '',
          start: '',
          end: '',
          url: '',
          description: '',
        },
      ]),
    ).toBe('TravelBuddy');
  });

  it('requires at least one work experience entry with company and title', () => {
    expect(hasValidWorkExperience([])).toBe(false);
    expect(
      hasValidWorkExperience([
        { company: 'Oddle', title: 'APM', start: '', end: '', description: '' },
      ]),
    ).toBe(true);
  });
});
