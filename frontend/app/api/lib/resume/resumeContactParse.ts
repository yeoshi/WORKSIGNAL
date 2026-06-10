import type { SnsLinkEntry } from '@/app/types/shared';

const EMAIL_REGEX = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE_REGEX =
  /(?:HP|Mobile|Tel|Phone)\s*:?\s*(\+?\d[\d\s-]{7,14}\d)|(\+?\d{1,3}[\s-]?[3689]\d{3}[\s-]?\d{4}\b)|(\b[3689]\d{7}\b)/i;

function titleCaseName(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

const INSTITUTION_WORDS =
  /\b(University|College|Polytechnic|Institute|School|Engineering|Academy|Department|Faculty|Campus)\b/i;

function isAllCapsName(line: string): boolean {
  return (
    /^[A-Z][A-Z\s'.-]+$/.test(line) &&
    line.split(/\s+/).length >= 2 &&
    line.split(/\s+/).length <= 5
  );
}

function looksLikeName(line: string): boolean {
  if (line.length < 3 || line.length > 80) return false;
  if (/[|@,:]/.test(line)) return false;
  if (/^(email|phone|hp|mobile|linkedin|github|www\.)/i.test(line)) return false;
  if (INSTITUTION_WORDS.test(line)) return false;
  if (/\d/.test(line)) return false;

  if (isAllCapsName(line)) return true;

  // Title Case: "Tan Yeo Shi Lee"
  if (/^[A-Z][A-Za-z'.\-]+(?:\s+[A-Z][A-Za-z'.\-]+)+$/.test(line)) {
    return true;
  }

  return false;
}

export function parseFullName(text: string): string {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  // First pass: lines before contact info at top of document
  for (const line of lines.slice(0, 8)) {
    if (EMAIL_REGEX.test(line)) break;
    if (looksLikeName(line)) {
      return titleCaseName(line);
    }
  }

  // Second pass: ALL CAPS name anywhere in first 70% of document
  const scanLimit = Math.ceil(lines.length * 0.7);
  for (let i = 0; i < scanLimit; i++) {
    const line = lines[i];
    if (isAllCapsName(line) && !INSTITUTION_WORDS.test(line)) {
      return titleCaseName(line);
    }
  }

  // Third pass: title-case name in first 60%, excluding institutions
  const titleLimit = Math.ceil(lines.length * 0.6);
  for (let i = 0; i < titleLimit; i++) {
    const line = lines[i];
    if (looksLikeName(line) && !EMAIL_REGEX.test(line)) {
      return titleCaseName(line);
    }
  }

  return '';
}

export function parseEmail(text: string): string {
  return text.match(EMAIL_REGEX)?.[0] ?? '';
}

export function parseMobile(text: string): string {
  const match = text.match(PHONE_REGEX);
  if (!match) return '';

  const raw = (match[1] ?? match[2] ?? match[3] ?? '').trim();
  const digits = raw.replace(/\D/g, '');

  if (digits.length === 8 && /^[3689]/.test(digits)) {
    return `+65 ${digits.slice(0, 4)} ${digits.slice(4)}`;
  }

  return raw;
}

export function parseSnsLinks(text: string): SnsLinkEntry[] {
  const collapsed = text.replace(/\s*\n\s*/g, '');
  const links: SnsLinkEntry[] = [];

  const linkedin = collapsed.match(
    /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[\w-]+/i,
  )?.[0];
  if (linkedin) {
    links.push({
      platform: 'linkedin',
      url: linkedin.startsWith('http') ? linkedin : `https://${linkedin}`,
    });
  }

  const github = collapsed.match(/(?:https?:\/\/)?github\.com\/[\w-]+/i)?.[0];
  if (github) {
    links.push({
      platform: 'github',
      url: github.startsWith('http') ? github : `https://${github}`,
    });
  }

  return links;
}

export function parseProfileSummary(profileBlock: string): string {
  if (!profileBlock) return '';
  return profileBlock
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join(' ')
    .slice(0, 2000);
}
