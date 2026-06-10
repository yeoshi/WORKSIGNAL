/**
 * Filters Realism `gaps` down to user skill/experience gaps suitable for the
 * Growth Agent. Job-listing quality issues (empty JD, agency postings, etc.)
 * belong in verdict reasoning, not upskilling roadmaps.
 */

/** Patterns that describe the listing/JD, not a user skill gap. */
const JOB_LISTING_META_PATTERNS: RegExp[] = [
  /job description/i,
  /\bjd\b/i,
  /completely empty/i,
  /no requirements/i,
  /no responsibilities/i,
  /role details provided to evaluate/i,
  /provided to evaluate against/i,
  /nothing to evaluate/i,
  /cannot evaluate|can't evaluate|unable to evaluate|unable to assess/i,
  /insufficient (job |role )?(detail|information|data)/i,
  /recruitment agency/i,
  /recruiting agency/i,
  /agency posting/i,
  /evolution recruitment/i,
  /end[- ]client/i,
  /no visible end/i,
  /unclear actual employer/i,
  /employer.*(undisclosed|unclear|unknown)/i,
  /purpose alignment/i,
  /industry.*unclear/i,
  /posting with no/i,
  /high applicant volume/i,
  /salary alignment/i,
  /market data for this role/i,
];

/** Reframe verbose experience-fit gaps into actionable skill labels. */
const EXPERIENCE_REFRAME_RULES: Array<{ pattern: RegExp; skill: string }> = [
  {
    pattern:
      /\b(product manager|principal product|lead\/principal pm|dedicated pm|corporate pm|pm ladder|pm experience)\b/i,
    skill: 'Product management experience',
  },
  {
    pattern: /\b(system design|distributed systems)\b.*\b(scale|at scale)\b/i,
    skill: 'System design at scale',
  },
];

function normalizeSkillLabel(label: string): string {
  const trimmed = label.replace(/\s+/g, ' ').trim();
  if (!trimmed) return '';
  if (trimmed.length <= 80) return trimmed;
  return `${trimmed.slice(0, 77)}…`;
}

/** True when the gap text is about the job posting, not the user's skills. */
export function isJobListingMetaGap(gap: string): boolean {
  const text = gap.trim();
  if (!text) return true;
  return JOB_LISTING_META_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Map a Realism gap string to a concise user skill label, or null when it should
 * be excluded from Growth.
 */
export function reframeUserSkillGap(gap: string): string | null {
  const text = gap.trim();
  if (!text || isJobListingMetaGap(text)) return null;

  for (const rule of EXPERIENCE_REFRAME_RULES) {
    if (rule.pattern.test(text)) return rule.skill;
  }

  const lackMatch = text.match(/\blacks?\s+(?:of\s+)?(.{3,80}?)(?:[.;,]|$)/i);
  if (lackMatch?.[1]) {
    return normalizeSkillLabel(lackMatch[1]);
  }

  const missingMatch = text.match(/\bmissing\s+(.{3,80}?)(?:[.;,]|$)/i);
  if (missingMatch?.[1]) {
    return normalizeSkillLabel(missingMatch[1]);
  }

  const noExperienceMatch = text.match(/\bno\s+(.{2,50}?)\s+experience\b/i);
  if (noExperienceMatch?.[1]) {
    return normalizeSkillLabel(`${noExperienceMatch[1]} experience`);
  }

  // Short, concrete skill labels pass through (e.g. "Kubernetes", "SQL").
  if (text.length <= 80 && !/\b(posting|employer|job description|recruitment)\b/i.test(text)) {
    return normalizeSkillLabel(text);
  }

  // Long narrative gaps that mention user profile shortfalls are still skill gaps.
  if (
    /\b(user|profile|candidate|you)\b/i.test(text) &&
    /\b(experience|skill|background|qualification|requirement)\b/i.test(text)
  ) {
    const pmReframe = EXPERIENCE_REFRAME_RULES.find((r) => r.skill === 'Product management experience');
    if (pmReframe?.pattern.test(text)) return pmReframe.skill;
    return normalizeSkillLabel(text.split(/[.;]/)[0] ?? text);
  }

  return null;
}

/** Keep only user skill gaps, deduped case-insensitively. */
export function filterUserSkillGaps(gaps: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of gaps) {
    const skill = reframeUserSkillGap(raw);
    if (!skill) continue;
    const key = skill.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(skill);
  }

  return result;
}
