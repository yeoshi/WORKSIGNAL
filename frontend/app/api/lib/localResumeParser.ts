/**
 * Lightweight resume text extraction for LOCAL_DEV — no Bedrock/S3 required.
 * Heuristic parsing; users can correct fields on the confirm step.
 */

import type {
  EducationEntry,
  ParsedProfile,
} from '@worksignal/shared';
import {
  deriveHeadlineRole,
  deriveYearsExperience,
} from '../../onboarding/lib/resumeProfileDerivation';

import { extractPdfText } from './extractPdfText';
import {
  parseEmail,
  parseFullName,
  parseMobile,
  parseProfileSummary,
  parseSnsLinks,
} from './resume/resumeContactParse';
import {
  parseEducationHistory,
  parseHonorsFromBlocks,
} from './resume/resumeEducationParse';
import { parseWorkAndInternships } from './resume/resumeJobParse';
import {
  dedupeProjectsAgainstJobs,
  parseProjects,
} from './resume/resumeProjectParse';
import { detectSections, type SectionBlocks } from './resume/resumeSectionDetect';
import { parseSkills } from './resume/resumeSkillsParse';
import { normalizeResumeText } from './resume/resumeTextNormalize';

export { toYearMonth, parseDateRange } from './resume/resumeDateUtils';
export {
  parseFullName,
  parseEmail,
  parseMobile,
  parseSnsLinks,
} from './resume/resumeContactParse';
export { parseEducationHistory } from './resume/resumeEducationParse';
export { parseWorkAndInternships } from './resume/resumeJobParse';
export { parseProjects, dedupeProjectsAgainstJobs } from './resume/resumeProjectParse';
export { parseSkills } from './resume/resumeSkillsParse';

const EXPERIENCE_HEADING =
  /\n\s*(?:WORK\s+EXPERIENCE|EXPERIENCE|EMPLOYMENT|WORK\s+HISTORY|WORK)\s*\n/i;

/**
 * Some PDFs place additional jobs after SUMMARY blocks (Wayne Tan layout).
 * Only append when that heading appears *after* the experience section — not
 * a PROFILE block at the top of the document (Randall Koh layout).
 */
function buildExperienceParseText(
  normalized: string,
  sections: SectionBlocks,
): string {
  const parts = [sections.experience].filter(Boolean);

  const experienceMatch = EXPERIENCE_HEADING.exec(normalized);
  const experienceStart = experienceMatch?.index ?? -1;

  const trailingMarkers = ['SUMMARY', 'ABOUT ME'];
  for (const marker of trailingMarkers) {
    const markerRe = new RegExp(`\\n\\s*${marker}\\s*\\n`, 'i');
    const match = markerRe.exec(normalized);
    if (match && match.index > experienceStart && experienceStart >= 0) {
      parts.push(normalized.slice(match.index + match[0].length));
      break;
    }
  }

  return parts.join('\n');
}

function deriveLegacyFromEducation(entries: EducationEntry[]): {
  education: string;
  university: string;
} {
  const first = entries[0];
  if (!first) return { education: '', university: '' };
  const parts = [first.degree, first.field_of_study].filter(Boolean);
  return { education: parts.join(', '), university: first.school };
}

export function parseResumeText(text: string): ParsedProfile | null {
  const normalized = normalizeResumeText(text);
  if (!normalized) return null;

  const sections = detectSections(normalized);

  const educationHistory = parseEducationHistory(sections.education);
  const educationHonors = parseHonorsFromBlocks(
    sections.education,
    sections.achievements,
  );
  const { work: workExperience, internships } = parseWorkAndInternships(
    buildExperienceParseText(normalized, sections),
  );
  const projects = dedupeProjectsAgainstJobs(
    parseProjects(sections.projects),
    workExperience,
    internships,
  );
  const { education, university } = deriveLegacyFromEducation(educationHistory);

  const profile: ParsedProfile = {
    current_role: deriveHeadlineRole(workExperience, internships, projects),
    years_experience: deriveYearsExperience(workExperience, internships),
    skills: parseSkills(sections.skills),
    education,
    university,
    basic_info: {
      full_name: parseFullName(text),
      email: parseEmail(normalized),
      mobile: parseMobile(normalized),
      preferred_location: 'Singapore',
    },
    education_history: educationHistory,
    work_experience: workExperience,
    internships,
    projects,
    work_samples: [],
    honors_awards: educationHonors,
    languages: [],
    self_introduction: parseProfileSummary(sections.profile),
    sns_links: parseSnsLinks(normalized),
  };

  const hasContent =
    profile.basic_info?.full_name ||
    profile.current_role ||
    profile.education ||
    profile.university ||
    profile.skills.length > 0 ||
    (profile.work_experience?.length ?? 0) > 0;

  return hasContent ? profile : null;
}

export async function parseResumePdfLocally(
  bytes: Buffer | Uint8Array,
): Promise<ParsedProfile | null> {
  try {
    const text = await extractPdfText(bytes);
    return parseResumeText(text);
  } catch {
    return null;
  }
}
