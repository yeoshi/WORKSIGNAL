import type {
  EducationEntry,
  HonorAwardEntry,
  LanguageSkillEntry,
  ParsedProfile,
  ProjectEntry,
  SnsLinkEntry,
  WorkExperienceEntry,
  WorkSampleEntry,
} from '@worksignal/shared';

export function emptyParsedProfile(): ParsedProfile {
  return {
    current_role: '',
    years_experience: 0,
    skills: [],
    education: '',
    university: '',
    basic_info: { full_name: '', mobile: '', email: '', preferred_location: '' },
    education_history: [],
    work_experience: [],
    internships: [],
    projects: [],
    work_samples: [],
    honors_awards: [],
    languages: [],
    self_introduction: '',
    sns_links: [],
  };
}

export function emptyEducationEntry(): EducationEntry {
  return { school: '', faculty: '', degree: '', field_of_study: '', start: '', end: '' };
}

export function emptyWorkExperienceEntry(): WorkExperienceEntry {
  return { company: '', title: '', start: '', end: '', description: '' };
}

export function emptyProjectEntry(): ProjectEntry {
  return { project_name: '', title: '', start: '', end: '', url: '', description: '' };
}

export function emptyWorkSampleEntry(): WorkSampleEntry {
  return { url: '', description: '' };
}

export function emptyHonorAwardEntry(): HonorAwardEntry {
  return { title: '', date: '', description: '' };
}

export function emptyLanguageSkillEntry(): LanguageSkillEntry {
  return { language: '', proficiency: 'native_or_bilingual' };
}

export function emptySnsLinkEntry(): SnsLinkEntry {
  return { platform: 'linkedin', url: '' };
}

/** Derive legacy flat education/university fields from the first structured entry. */
export function deriveLegacyEducation(
  entries: EducationEntry[] = [],
): { education: string; university: string } {
  const first = entries[0];
  if (!first) return { education: '', university: '' };
  const parts = [first.degree, first.field_of_study]
    .map((p) => p?.trim())
    .filter((p): p is string => Boolean(p));
  return { education: parts.join(', '), university: first.school?.trim() ?? '' };
}

export function hasConfirmedResumeProfile(
  profile: { current_role?: string } | null | undefined,
): boolean {
  return Boolean(profile?.current_role?.trim());
}
