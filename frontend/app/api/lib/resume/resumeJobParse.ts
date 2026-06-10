import type { WorkExperienceEntry } from '@/app/types/shared';
import { DATE_RANGE_PATTERN, MONTH, parseDateRange } from './resumeDateUtils';

const JOB_LINE_PIPE = new RegExp(
  `^(.+?)\\s*\\|\\s*(.+?)\\s+(${MONTH}\\s+\\d{4})\\s*[–-]\\s*(Present|Current|${MONTH}\\s+\\d{4})\\s*$`,
  'i',
);

const JOB_LINE_COMMA = new RegExp(
  `^(.+?),\\s*(.+?),\\s*(.+?)\\s*(${MONTH}\\s+\\d{4})\\s*[–-]\\s*(Present|Current|${MONTH}\\s+\\d{4})\\s*$`,
  'i',
);

const JOB_LINE_COMMA_SHORT = new RegExp(
  `^(.+?),\\s*(.+?)\\s+(${MONTH}\\s+\\d{4})\\s*[–-]\\s*(Present|Current|${MONTH}\\s+\\d{4})\\s*$`,
  'i',
);

const JOB_LINE_AT_COMPANY = new RegExp(
  `^(${MONTH}\\s+\\d{4})\\s*[–-]\\s*(${MONTH}\\s+\\d{4}|Present|Current)\\s*(.+?)\\s+at\\s+(.+?)\\s*$`,
  'i',
);

const JOB_LINE_TITLE_OF = new RegExp(
  `^(.+?)\\s+of\\s+(.+?)\\s+(${MONTH}\\s+\\d{4})\\s*[–-]\\s*(Present|Current|${MONTH}\\s+\\d{4})\\s*$`,
  'i',
);

const DATE_ONLY_LINE = new RegExp(
  `^(${MONTH}\\s+\\d{4}|\\d{4})\\s*[-–]\\s*(Present|Current|${MONTH}\\s+\\d{4}|\\d{4})(?:\\s*\\|\\s*.+)?\\s*$`,
  'i',
);

const TITLE_AT_COMPANY_LINE = /^(.+?)\s+at\s+(.+?)\s*$/i;

function isBullet(line: string): boolean {
  return /^[•\-*]\s/.test(line);
}

function stripBullet(line: string): string {
  return line.replace(/^[•\-*]\s*/, '').trim();
}

function parsePipeJob(line: string): WorkExperienceEntry | null {
  const match = line.match(JOB_LINE_PIPE);
  if (!match) return null;
  const dates = parseDateRange(`${match[3]} - ${match[4]}`);
  return {
    company: match[1].trim(),
    title: match[2].trim(),
    start: dates.start,
    end: dates.end,
    description: '',
  };
}

function parseCommaJob(line: string): WorkExperienceEntry | null {
  const matchThree = line.match(JOB_LINE_COMMA);
  if (matchThree) {
    const dates = parseDateRange(`${matchThree[4]} - ${matchThree[5]}`);
    return {
      company: matchThree[2].trim(),
      title: matchThree[1].trim(),
      start: dates.start,
      end: dates.end,
      description: '',
    };
  }

  const matchTwo = line.match(JOB_LINE_COMMA_SHORT);
  if (!matchTwo) return null;

  const dates = parseDateRange(`${matchTwo[3]} - ${matchTwo[4]}`);
  return {
    company: matchTwo[2].trim(),
    title: matchTwo[1].trim(),
    start: dates.start,
    end: dates.end,
    description: '',
  };
}

function parseAtCompanyJob(line: string): WorkExperienceEntry | null {
  const match = line.match(JOB_LINE_AT_COMPANY);
  if (!match) return null;
  const dates = parseDateRange(`${match[1]} - ${match[2]}`);
  return {
    company: match[4].trim(),
    title: match[3].trim(),
    start: dates.start,
    end: dates.end,
    description: '',
  };
}

function parseTitleOfJob(line: string): WorkExperienceEntry | null {
  const match = line.match(JOB_LINE_TITLE_OF);
  if (!match) return null;
  const dates = parseDateRange(`${match[3]} - ${match[4]}`);
  return {
    company: match[2].trim(),
    title: match[1].trim(),
    start: dates.start,
    end: dates.end,
    description: '',
  };
}

function parseBlockJob(
  titleLine: string,
  companyLine: string,
  dateLine: string,
): WorkExperienceEntry | null {
  const title = titleLine.replace(/\s*\|\s*/g, ' | ').trim();
  const company = companyLine.trim();
  if (!title || !company) return null;

  const dateMatch = dateLine.match(DATE_RANGE_PATTERN);
  const dates = dateMatch ? parseDateRange(dateMatch[0]) : { start: '', end: '' };

  return {
    company,
    title,
    start: dates.start,
    end: dates.end,
    description: '',
  };
}

function shouldPreferTitleOf(line: string): boolean {
  if (!/\s+of\s+/i.test(line)) return false;
  // Comma jobs like "Research Assistant, NUS School of Computing Jul 2025"
  if (/^[^|]+,/.test(line) && !/\|/.test(line)) return false;
  // "CoFounder | Founding Engineer of CallBridge Jul 2025"
  return true;
}

function tryParseJobHeader(line: string): WorkExperienceEntry | null {
  if (shouldPreferTitleOf(line)) {
    const titleOf = parseTitleOfJob(line);
    if (titleOf) return titleOf;
  }

  return (
    parsePipeJob(line) ??
    parseCommaJob(line) ??
    parseAtCompanyJob(line) ??
    parseTitleOfJob(line)
  );
}

function isJobHeader(line: string): boolean {
  return tryParseJobHeader(line) !== null;
}

function isUrlOrContactLine(line: string): boolean {
  return (
    /^(https?:\/\/|www\.|github\.com|linkedin\.com)/i.test(line) ||
    /@/.test(line) ||
    /\b(gmail|linkedin|github)\b/i.test(line)
  );
}

function looksLikeTitleLine(line: string): boolean {
  if (isJobHeader(line) || isBullet(line) || isUrlOrContactLine(line)) return false;
  if (DATE_RANGE_PATTERN.test(line)) return false;
  if (DATE_ONLY_LINE.test(line)) return false;
  if (line.length > 120) return false;
  return true;
}

function looksLikeCompanyLine(line: string): boolean {
  if (isJobHeader(line) || isBullet(line) || isUrlOrContactLine(line)) return false;
  if (DATE_RANGE_PATTERN.test(line)) return false;
  if (TITLE_AT_COMPANY_LINE.test(line)) return false;
  if (line.length > 100) return false;
  return true;
}

function isInternshipEntry(entry: WorkExperienceEntry): boolean {
  const combined = `${entry.title} ${entry.description}`;
  return /intern/i.test(combined);
}

export function parseWorkAndInternships(workBlock: string): {
  work: WorkExperienceEntry[];
  internships: WorkExperienceEntry[];
} {
  const lines = workBlock.split('\n').map((l) => l.trim()).filter(Boolean);
  const work: WorkExperienceEntry[] = [];
  const internships: WorkExperienceEntry[] = [];

  let current: WorkExperienceEntry | null = null;
  const bullets: string[] = [];

  function flush() {
    if (!current) return;
    current.description = bullets.join('\n');
    if (isInternshipEntry(current)) {
      internships.push(current);
    } else {
      work.push(current);
    }
    current = null;
    bullets.length = 0;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const parsed = tryParseJobHeader(line);
    if (parsed) {
      flush();
      current = parsed;
      continue;
    }

    // Title at Company + dates on next line (before block format)
    const atMatch = line.match(TITLE_AT_COMPANY_LINE);
    if (
      atMatch &&
      i + 1 < lines.length &&
      DATE_ONLY_LINE.test(lines[i + 1])
    ) {
      flush();
      const dateMatch = lines[i + 1].match(DATE_RANGE_PATTERN);
      const dates = dateMatch ? parseDateRange(dateMatch[0]) : { start: '', end: '' };
      current = {
        company: atMatch[2].trim(),
        title: atMatch[1].trim(),
        start: dates.start,
        end: dates.end,
        description: '',
      };
      i += 1;
      continue;
    }

    // Block format: title, company, dates on consecutive lines
    if (
      looksLikeTitleLine(line) &&
      i + 2 < lines.length &&
      looksLikeCompanyLine(lines[i + 1]) &&
      DATE_ONLY_LINE.test(lines[i + 2])
    ) {
      flush();
      const blockJob = parseBlockJob(line, lines[i + 1], lines[i + 2]);
      if (blockJob) {
        current = blockJob;
        i += 2;
        continue;
      }
    }

    // Company-first with title on previous line: "Creative\nAKA Asia..."
    if (
      looksLikeCompanyLine(line) &&
      i + 1 < lines.length &&
      DATE_ONLY_LINE.test(lines[i + 1])
    ) {
      // Title was previous non-bullet line if we don't have current
      const prevLine = i > 0 ? lines[i - 1] : '';
      if (prevLine && looksLikeTitleLine(prevLine) && !isBullet(prevLine)) {
        flush();
        const dateMatch = lines[i + 1].match(DATE_RANGE_PATTERN);
        const dates = dateMatch ? parseDateRange(dateMatch[0]) : { start: '', end: '' };
        current = {
          company: line,
          title: prevLine,
          start: dates.start,
          end: dates.end,
          description: '',
        };
        i += 1;
        continue;
      }
    }

    if (isBullet(line)) {
      bullets.push(stripBullet(line));
      continue;
    }

    if (current && bullets.length === 0 && !isJobHeader(line)) {
      bullets.push(line);
    }
  }

  flush();
  return { work, internships };
}
