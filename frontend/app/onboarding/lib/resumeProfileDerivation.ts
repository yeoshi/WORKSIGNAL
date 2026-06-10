import type { ProjectEntry, WorkExperienceEntry } from '@worksignal/shared';

function parseYearMonth(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed || /^present$/i.test(trimmed)) {
    return new Date().getFullYear() * 12 + new Date().getMonth();
  }

  const iso = trimmed.match(/^(\d{4})-(\d{2})$/);
  if (iso) {
    return Number(iso[1]) * 12 + (Number(iso[2]) - 1);
  }

  const named = trimmed.match(
    /^(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})$/i,
  );
  if (named) {
    const monthNames = [
      'jan',
      'feb',
      'mar',
      'apr',
      'may',
      'jun',
      'jul',
      'aug',
      'sep',
      'oct',
      'nov',
      'dec',
    ];
    const month = monthNames.findIndex((m) =>
      trimmed.toLowerCase().startsWith(m),
    );
    return Number(named[1]) * 12 + month;
  }

  const yearOnly = trimmed.match(/^(\d{4})$/);
  if (yearOnly) {
    return Number(yearOnly[1]) * 12;
  }

  return null;
}

function entrySpanYears(entry: WorkExperienceEntry): number {
  const start = parseYearMonth(entry.start);
  const end = parseYearMonth(entry.end);
  if (start === null || end === null || end < start) return 0;
  return Math.max(1, Math.ceil((end - start + 1) / 12));
}

export function deriveCurrentRole(
  workExperience: WorkExperienceEntry[],
): string {
  const presentEntries = workExperience.filter(
    (entry) => entry.title.trim() && /^present$/i.test(entry.end.trim()),
  );

  if (presentEntries.length === 0) {
    return workExperience.find((entry) => entry.title.trim())?.title.trim() ?? '';
  }

  const ranked = [...presentEntries].sort((a, b) => {
    const aStart = parseYearMonth(a.start) ?? 0;
    const bStart = parseYearMonth(b.start) ?? 0;
    return bStart - aStart;
  });

  return ranked[0]?.title.trim() ?? '';
}

export function deriveYearsExperience(
  workExperience: WorkExperienceEntry[],
  internships: WorkExperienceEntry[] = [],
): number {
  const entries = [...workExperience, ...internships].filter(
    (entry) => entry.start.trim() || entry.end.trim(),
  );

  if (entries.length === 0) return 0;

  const total = entries.reduce((sum, entry) => sum + entrySpanYears(entry), 0);
  return Math.max(1, Math.min(total, 40));
}

export function hasValidWorkExperience(
  workExperience: WorkExperienceEntry[],
): boolean {
  return workExperience.some(
    (entry) => entry.company.trim() && entry.title.trim(),
  );
}

/** Best available headline for students with internships/projects only. */
export function deriveHeadlineRole(
  workExperience: WorkExperienceEntry[],
  internships: WorkExperienceEntry[] = [],
  projects: ProjectEntry[] = [],
): string {
  const fromWork = deriveCurrentRole(workExperience);
  if (fromWork) return fromWork;

  const fromInternships = deriveCurrentRole(internships);
  if (fromInternships) return fromInternships;

  for (const project of projects) {
    const title = project.title.trim() || project.project_name.trim();
    if (title) return title;
  }

  return '';
}
