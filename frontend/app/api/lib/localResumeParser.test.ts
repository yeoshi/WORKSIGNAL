// @vitest-environment node

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseResumePdfLocally, parseResumeText } from './localResumeParser';

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

const CV_PATH = '/Users/yeoshitan/Downloads/Tan Yeo Shi Lee CV.pdf';

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURE_DIR, name), 'utf8');
}

describe('parseResumeText', () => {
  it('extracts structured profile fields from the Tan Yeo Shi Lee fixture', () => {
    const profile = parseResumeText(loadFixture('tan-yeo-shi-lee-cv.txt'));
    expect(profile).not.toBeNull();

    expect(profile?.basic_info?.full_name).toBe('Tan Yeo Shi Lee');
    expect(profile?.basic_info?.email).toBe('yeoshitan@gmail.com');
    expect(profile?.basic_info?.mobile).toBe('+65 9001 7585');

    expect(profile?.education_history?.[0]).toMatchObject({
      school: 'Singapore Management University',
      degree: 'Bachelor of Science (Information Systems)',
      field_of_study: 'Smart-City Management and Technology',
      start: '2020-08',
      end: '2024-05',
    });

    expect(profile?.work_experience).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          company: 'The Oddle Company',
          title: 'Associate Product Manager',
          end: 'Present',
        }),
        expect.objectContaining({ company: 'CallBridge' }),
        expect.objectContaining({ company: 'Freelance' }),
      ]),
    );

    expect(profile?.internships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ company: 'Razer Inc.' }),
        expect.objectContaining({ company: 'SGAG Media Pte. Ltd.' }),
      ]),
    );

    expect(profile?.projects?.length).toBeGreaterThanOrEqual(2);
    expect(profile?.sns_links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ platform: 'linkedin' }),
        expect.objectContaining({ platform: 'github' }),
      ]),
    );
    expect(profile?.skills).toEqual(
      expect.arrayContaining(['Python', 'Java', 'SQL', 'React']),
    );
    expect(profile?.skills).not.toEqual(
      expect.arrayContaining(['HR Director', '2021', '2022', 'Mentor']),
    );
    expect(profile?.honors_awards).toEqual([
      expect.objectContaining({
        title: 'SMU SCIS Achievements Scholarship Programme',
      }),
    ]);
    expect(profile?.honors_awards?.[0]?.title).not.toMatch(/cgpa|gpa/i);
  });

  it('extracts Randall Koh resume fields', () => {
    const profile = parseResumeText(loadFixture('randall-koh-resume.txt'));
    expect(profile).not.toBeNull();

    expect(profile?.basic_info?.full_name).toBe('Randall Koh');
    expect(profile?.basic_info?.email).toBe('e1398303@u.nus.edu');
    expect(profile?.basic_info?.mobile).toBe('+65 8781 0680');

    expect(profile?.internships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ company: 'Cynapse.ai' }),
      ]),
    );
    expect(profile?.work_experience).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ company: 'Cynapse.ai' }),
      ]),
    );

    expect(profile?.work_experience?.length).toBeGreaterThanOrEqual(3);
    expect(profile?.work_experience).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ company: 'CallBridge' }),
        expect.objectContaining({ company: 'NUS Fintech Society' }),
      ]),
    );

    const projectNames = profile?.projects?.map((p) => p.project_name) ?? [];
    expect(projectNames).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/CallBridge/i)]),
    );
    expect(projectNames).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/TravelLah/i),
        expect.stringMatching(/Bloom/i),
      ]),
    );
    expect(projectNames.length).toBeLessThanOrEqual(3);

    expect(profile?.skills).toEqual(
      expect.arrayContaining(['React', 'Python']),
    );
    expect(profile?.self_introduction).toMatch(/CallBridge/i);
  });

  it('extracts Jocelyn Tan CV fields', () => {
    const profile = parseResumeText(loadFixture('jocelyn-tan-cv.txt'));
    expect(profile).not.toBeNull();

    expect(profile?.basic_info?.full_name).toBe('Jocelyn Tan');

    expect(profile?.work_experience).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          company: 'CallBridge',
          title: expect.stringMatching(/Design Lead|Co-founder/i),
        }),
      ]),
    );

    expect(profile?.education_history?.length).toBeGreaterThanOrEqual(2);
    expect(profile?.education_history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ school: expect.stringMatching(/NUS/i) }),
        expect.objectContaining({ school: expect.stringMatching(/Singapore Polytechnic/i) }),
      ]),
    );
  });

  it('extracts Wayne Tan CV fields', () => {
    const profile = parseResumeText(loadFixture('wayne-tan-cv.txt'));
    expect(profile).not.toBeNull();

    expect(profile?.basic_info?.full_name).toBe('Wayne Tan Junheng');
    expect(profile?.basic_info?.email).toBe('waynetanjunheng@gmail.com');

    expect(profile?.work_experience).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ company: 'CallBridge' }),
      ]),
    );

    expect(profile?.internships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          company: expect.stringMatching(/CLS/i),
        }),
        expect.objectContaining({ company: 'Lenor' }),
      ]),
    );

    expect(profile?.skills).toEqual(
      expect.arrayContaining(['Java', 'React']),
    );
  });

  it('returns null for empty text (image-only PDFs)', () => {
    expect(parseResumeText('')).toBeNull();
    expect(parseResumeText(loadFixture('cody-resume-empty.txt'))).toBeNull();
  });
});

describe('parseResumePdfLocally', () => {
  it('extracts profile fields from a real resume PDF when available', async () => {
    let buffer: Buffer;
    try {
      buffer = readFileSync(CV_PATH);
    } catch {
      return;
    }

    const profile = await parseResumePdfLocally(buffer);
    expect(profile).not.toBeNull();
    expect(profile?.basic_info?.full_name).toBe('Tan Yeo Shi Lee');
    expect(profile?.work_experience?.length).toBeGreaterThanOrEqual(2);
    expect(profile?.internships?.length).toBeGreaterThanOrEqual(1);
  });
});
