export type CanonicalSection =
  | 'education'
  | 'experience'
  | 'projects'
  | 'skills'
  | 'profile'
  | 'achievements';

export type SectionBlocks = Record<CanonicalSection, string>;

const SECTION_ALIASES: Record<CanonicalSection, string[]> = {
  education: ['EDUCATION', 'ACADEMIC BACKGROUND'],
  experience: [
    'WORK EXPERIENCE',
    'EXPERIENCE',
    'EMPLOYMENT',
    'WORK HISTORY',
    'WORK',
  ],
  projects: ['PROJECT EXPERIENCE', 'PROJECTS', 'KEY PROJECTS'],
  skills: [
    'SKILLS',
    'KEY SKILLS',
    'TECHNICAL SKILLS',
    'SKILLS & CERTIFICATIONS',
    'SKILLS, CERTIFICATIONS & EXPERIENCE',
  ],
  profile: ['PROFILE', 'SUMMARY', 'ABOUT ME'],
  achievements: ['ACHIEVEMENTS', 'AWARDS', 'HONORS', 'HONOURS'],
};

const ALL_HEADINGS: { canonical: CanonicalSection; heading: string }[] = [];
for (const [canonical, aliases] of Object.entries(SECTION_ALIASES)) {
  for (const heading of aliases) {
    ALL_HEADINGS.push({ canonical: canonical as CanonicalSection, heading });
  }
}

const OTHER_SECTION_MARKERS = [
  'VOLUNTEER',
  'EXTRA-CURRICULAR ACTIVITIES',
  'EXTRA CURRICULAR ACTIVITIES',
  'CERTIFICATIONS',
  'LANGUAGES',
  'REFERENCES',
  'CONTACT',
  'HOBBIES',
  'INTERESTS',
];

function normalizeHeading(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9&,\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);

  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = temp;
    }
  }

  return dp[n];
}

function isHeadingLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 40) return false;
  if (/[@|]/.test(trimmed)) return false;
  if (/\d{4}/.test(trimmed) && !/^\d{4}\s*[-–]\s*\d{4}$/.test(trimmed)) return false;

  const letters = trimmed.replace(/[^A-Za-z]/g, '');
  if (letters.length < 3) return false;

  const upperRatio =
    (trimmed.match(/[A-Z]/g)?.length ?? 0) / Math.max(letters.length, 1);
  const isTitleCase = /^[A-Z][a-z]+(\s+[A-Z][a-z]+)*$/.test(trimmed);

  return upperRatio >= 0.6 || isTitleCase || trimmed === trimmed.toUpperCase();
}

function matchCanonicalSection(line: string): CanonicalSection | null {
  const normalized = normalizeHeading(line);
  if (!normalized) return null;

  let best: { canonical: CanonicalSection; distance: number } | null = null;

  for (const { canonical, heading } of ALL_HEADINGS) {
    const aliasNorm = normalizeHeading(heading);
    if (normalized === aliasNorm) {
      return canonical;
    }

    const maxDist = aliasNorm.length >= 6 ? 2 : 1;
    const dist = levenshtein(normalized, aliasNorm);
    if (dist <= maxDist) {
      if (!best || dist < best.distance) {
        best = { canonical, distance: dist };
      }
    }
  }

  return best?.canonical ?? null;
}

function isOtherSection(line: string): boolean {
  const normalized = normalizeHeading(line);
  return OTHER_SECTION_MARKERS.some(
    (marker) => normalized === normalizeHeading(marker),
  );
}

interface DetectedSection {
  canonical: CanonicalSection;
  contentStartLine: number;
  headingLine: number;
}

/**
 * Detect resume sections using fuzzy heading matching.
 */
export function detectSections(text: string): SectionBlocks {
  const lines = text.split('\n');
  const detected: DetectedSection[] = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!isHeadingLine(trimmed)) continue;

    const canonical = matchCanonicalSection(trimmed);
    if (canonical) {
      detected.push({
        canonical,
        contentStartLine: i + 1,
        headingLine: i,
      });
      continue;
    }

    if (isOtherSection(trimmed) && detected.length > 0) {
      // Next iteration will naturally bound content; mark as boundary via headingLine
      detected.push({
        canonical: detected[detected.length - 1].canonical,
        contentStartLine: i,
        headingLine: i,
      });
    }
  }

  const blocks: SectionBlocks = {
    education: '',
    experience: '',
    projects: '',
    skills: '',
    profile: '',
    achievements: '',
  };

  for (let d = 0; d < detected.length; d++) {
    const section = detected[d];
    const isBoundaryOnly =
      d > 0 &&
      section.headingLine === section.contentStartLine &&
      section.canonical === detected[d - 1].canonical;

    if (isBoundaryOnly) continue;

    let endLine = lines.length;
    for (let j = d + 1; j < detected.length; j++) {
      endLine = detected[j].headingLine;
      break;
    }

    const content = lines
      .slice(section.contentStartLine, endLine)
      .join('\n')
      .trim();

    if (!content) continue;

    if (section.canonical === 'experience' && blocks.experience) {
      blocks.experience = `${blocks.experience}\n${content}`;
    } else if (!blocks[section.canonical] || content.length > blocks[section.canonical].length) {
      blocks[section.canonical] = content;
    }
  }

  return blocks;
}
