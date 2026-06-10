import type { ParsedProfile } from '@worksignal/shared';

export { emptyParsedProfile } from '../../onboarding/lib/parsedProfileDefaults';

/** Placeholder profile used when resume parsing is unavailable in local dev. */
export const DEMO_PARSED_PROFILE: ParsedProfile = {
  current_role: 'Product Analyst',
  years_experience: 2,
  skills: ['SQL', 'Python', 'Tableau', 'A/B Testing'],
  education: 'Bachelor of Business Analytics',
  university: 'NUS',
  basic_info: {
    full_name: 'Alex Tan',
    mobile: '+65 9123 4567',
    email: 'alex.tan@example.com',
    preferred_location: 'Singapore',
  },
  education_history: [
    {
      school: 'National University of Singapore',
      faculty: 'School of Computing',
      degree: 'Bachelor of Business Analytics',
      field_of_study: 'Business Analytics',
      start: '2019-08',
      end: '2023-05',
    },
  ],
  work_experience: [
    {
      company: 'ShopFlow Pte Ltd',
      title: 'Product Analyst',
      start: '2023-07',
      end: 'Present',
      description:
        'Owns the activation funnel dashboard; ran 12 A/B tests improving signup conversion by 18%.',
    },
  ],
  internships: [
    {
      company: 'DataBridge Analytics',
      title: 'Data Analyst Intern',
      start: '2022-05',
      end: '2022-08',
      description: 'Built Tableau dashboards tracking weekly retention for 3 product teams.',
    },
  ],
  projects: [
    {
      project_name: 'Campus Marketplace',
      title: 'Full-stack Developer',
      start: '2022-01',
      end: '2022-04',
      url: 'https://github.com/example/campus-marketplace',
      description: 'Built a peer-to-peer marketplace for NUS students; React + Firebase, 200+ active users.',
    },
  ],
  work_samples: [
    {
      url: 'https://example.com/portfolio/ab-testing-case-study',
      description: 'Case study on the signup A/B test redesign and its 18% conversion lift.',
    },
  ],
  honors_awards: [
    {
      title: "Dean's List",
      date: '2022',
      description: 'Top 10% of cohort, AY2021/22.',
    },
  ],
  languages: [
    { language: 'English', proficiency: 'native_or_bilingual' },
    { language: 'Mandarin', proficiency: 'professional_working' },
  ],
  self_introduction:
    'Product-minded analyst who loves turning messy data into clear product decisions. Outside work I run a small Tableau tutorial channel.',
  sns_links: [
    { platform: 'linkedin', url: 'https://linkedin.com/in/alex-tan-example' },
    { platform: 'github', url: 'https://github.com/alex-tan-example' },
  ],
};
