/**
 * Client-safe LinkedIn headline parser (mirrors @worksignal/shared implementation).
 */

const JOB_TITLE_HINT =
  /\b(engineer|manager|director|analyst|designer|developer|lead|principal|intern|consultant|specialist|architect|scientist|coordinator|associate|vp|head of|product|marketing|sales|recruiter|founder|partner)\b/i;

const EDUCATION_HINT =
  /\b(university|school of|college|student|bachelor|master|phd|major in|cohort|faculty|department)\b/i;

const SCRAPE_NOISE =
  /showSidebars|showTitleBreadcrumbs|===|View LinkedIn profile|connections\s*•|followers|## About/i;

function stripMarkdownLinks(value: string): string {
  return value.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
}

function normalizeLinkedInRawText(value: string): string {
  return stripMarkdownLinks(value)
    .replace(/^#+\s*/gm, '')
    .replace(SCRAPE_NOISE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatRoleAtCompany(role: string, company: string): string {
  const r = role.replace(/\s+/g, ' ').trim();
  const c = company.replace(/\s+/g, ' ').replace(/\s*\(.*$/, '').trim();
  if (!r) return c;
  if (!c) return r;
  return `${r} @ ${c}`;
}

function stripLeadingName(role: string, contactName: string): string {
  let cleaned = role.trim();
  for (const part of contactName.split(/\s+/)) {
    if (part.length <= 2) continue;
    const re = new RegExp(`^${part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+`, 'i');
    cleaned = cleaned.replace(re, '').trim();
  }
  return cleaned.replace(/^[-–—|]\s*/, '').trim();
}

function scoreRoleCompanyMatch(role: string, company: string, contactName: string): number {
  let score = 0;
  if (JOB_TITLE_HINT.test(role)) score += 12;
  if (EDUCATION_HINT.test(role)) score -= 6;
  if (EDUCATION_HINT.test(company)) score -= 4;
  if (role.length > 70 || company.length > 45) score -= 4;
  if (company.length <= 35) score += 2;

  const roleLower = role.toLowerCase();
  const companyLower = company.toLowerCase();
  if (roleLower.startsWith(companyLower)) score -= 20;
  if (roleLower.includes(companyLower)) score -= 12;

  const nameLower = contactName.toLowerCase();
  if (roleLower.includes(nameLower)) score -= 10;
  for (const part of contactName.split(/\s+/)) {
    if (part.length > 2 && roleLower.startsWith(part.toLowerCase())) {
      score -= 4;
    }
  }
  return score;
}

function removeContactNameFromText(text: string, contactName: string): string {
  let result = text;
  const fullName = contactName.trim();
  if (fullName) {
    const escaped = fullName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(escaped, 'gi'), ' ');
  }
  for (const part of contactName.split(/\s+/)) {
    if (part.length <= 2) continue;
    const escaped = part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), ' ');
  }
  return result.replace(/\s+/g, ' ').trim();
}

interface RoleCompanyMatch {
  role: string;
  company: string;
  score: number;
}

const ROLE_SUFFIX =
  '(?:Engineer|Manager|Intern|Analyst|Director|Designer|Developer|Consultant|Specialist|Architect|Scientist|Coordinator|Partner|Founder|Recruiter)';

const AT_HEADLINE_RE = new RegExp(
  `\\b((?:Associate|Senior|Staff|Principal|Lead|Product|Software|Data|Marketing|Business)?\\s*[\\w\\s]{0,40}?${ROLE_SUFFIX})\\s+@\\s+([A-Za-z][\\w.&'-]+)\\b`,
  'gi',
);

const AT_COMPANY_HEADLINE_RE = new RegExp(
  `\\b((?:Associate|Senior|Staff|Principal|Lead|Product|Software|Data|Marketing|Business)?\\s*[\\w\\s]{0,40}?${ROLE_SUFFIX})\\s+at\\s+(?:\\[)?([A-Za-z][\\w.&'-]+)(?:\\])?\\b`,
  'gi',
);

function findRoleCompanyMatches(text: string, contactName: string): RoleCompanyMatch[] {
  const normalized = removeContactNameFromText(normalizeLinkedInRawText(text), contactName);
  const matches: RoleCompanyMatch[] = [];

  for (const match of normalized.matchAll(AT_HEADLINE_RE)) {
    const role = stripLeadingName(match[1]!.trim(), contactName);
    const company = match[2]!.trim();
    if (role && company) {
      matches.push({
        role,
        company,
        score: scoreRoleCompanyMatch(role, company, contactName) + 5,
      });
    }
  }

  for (const match of normalized.matchAll(AT_COMPANY_HEADLINE_RE)) {
    const role = stripLeadingName(match[1]!.trim(), contactName);
    const company = match[2]!.trim();
    if (role && company) {
      matches.push({ role, company, score: scoreRoleCompanyMatch(role, company, contactName) });
    }
  }

  return matches;
}

function cleanHeadlineSegment(value: string): string {
  return value
    .replace(SCRAPE_NOISE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function shortenEducationLine(value: string, maxLen = 55): string {
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen - 1).trim()}…`;
}

export function extractLinkedInRoleLine(
  sources: { text?: string | null; title?: string | null },
  contactName: string,
): string | null {
  const combined = [sources.text, sources.title]
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .join(' ');

  if (!combined.trim()) return null;

  const matches = findRoleCompanyMatches(combined, contactName);
  if (matches.length > 0) {
    matches.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.role.length - b.role.length;
    });
    const best = matches[0]!;
    return formatRoleAtCompany(best.role, best.company);
  }

  const title = cleanHeadlineSegment((sources.title ?? '').trim());
  const pipeParts = title.split(/\s*[|｜]\s*/).filter(Boolean);
  if (pipeParts.length > 1) {
    const headline = cleanHeadlineSegment(pipeParts[1] ?? '');
    if (headline) {
      return shortenEducationLine(headline);
    }
  }

  return null;
}

export function formatLinkedInRoleLine(context: string, contactName = ''): string {
  const trimmed = context.trim();
  if (!trimmed || trimmed === 'No additional context available.' || trimmed === 'LinkedIn profile') {
    return trimmed;
  }

  const parsed = extractLinkedInRoleLine({ text: trimmed, title: trimmed }, contactName);
  if (parsed) return parsed;

  const primary = trimmed.split('·')[0]?.trim() ?? trimmed;
  if (primary.length <= 70 && !SCRAPE_NOISE.test(primary)) return primary;

  const collapsed = normalizeLinkedInRawText(primary);
  if (collapsed.length <= 70) return collapsed;
  return `${collapsed.slice(0, 67).trim()}…`;
}
