import type { EducationEntry, HonorAwardEntry } from '@/app/types/shared';
import { MONTH, parseDateRange } from './resumeDateUtils';

const DEGREE_LINE =
  /\b((?:Bachelor|Master|PhD|Doctor|Diploma|Associate|GCE|IB|International Baccalaureate|A.?Level)[^.\n]{0,160})/i;

const SCHOOL_LINE =
  /^[A-Z][A-Za-z0-9\s&'().,-]+(?:University|College|Institute|School|Polytechnic|Academy)/i;

const YEAR_RANGE = /(\d{4})\s*[-–]\s*(\d{4}|Present|Current)/i;
const MONTH_RANGE = new RegExp(
  `(${MONTH}\\s+\\d{4})\\s*[-–]\\s*(${MONTH}\\s+\\d{4}|Present|Current)`,
  'i',
);

function extractDates(line: string): { start: string; end: string; remainder: string } {
  const monthMatch = line.match(MONTH_RANGE);
  if (monthMatch) {
    const dates = parseDateRange(monthMatch[0]);
    return {
      start: dates.start,
      end: dates.end,
      remainder: line.replace(monthMatch[0], '').trim(),
    };
  }

  const yearMatch = line.match(YEAR_RANGE);
  if (yearMatch) {
    const dates = parseDateRange(yearMatch[0]);
    return {
      start: dates.start,
      end: dates.end,
      remainder: line.replace(yearMatch[0], '').trim(),
    };
  }

  return { start: '', end: '', remainder: line };
}

function parseDegreeLine(line: string): { degree: string; fieldOfStudy: string } {
  const degreeLine = line.match(DEGREE_LINE)?.[1]?.trim() ?? line.trim();
  let degree = degreeLine;
  let fieldOfStudy = '';

  const specMatch = degreeLine.match(/,\s*Speciali[sz]ation in\s+(.+)$/i);
  if (specMatch) {
    degree = degreeLine.replace(/,\s*Speciali[sz]ation in\s+.+$/i, '').trim();
    fieldOfStudy = specMatch[1].trim();
  }

  const minorMatch = line.match(/Minor in\s+(.+)/i);
  if (minorMatch) {
    fieldOfStudy = fieldOfStudy
      ? `${fieldOfStudy}; Minor in ${minorMatch[1].trim()}`
      : `Minor in ${minorMatch[1].trim()}`;
  }

  return { degree, fieldOfStudy };
}

function isSchoolCandidate(line: string): boolean {
  if (/^[•\-*]/.test(line)) return false;
  if (DEGREE_LINE.test(line) && !SCHOOL_LINE.test(line)) return false;
  return (
    SCHOOL_LINE.test(line) ||
    /University|College|Polytechnic|Institute|School/i.test(line)
  );
}

export function parseEducationHistory(educationBlock: string): EducationEntry[] {
  const lines = educationBlock.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  const entries: EducationEntry[] = [];
  let current: Partial<EducationEntry> | null = null;

  function flush() {
    if (!current?.school && !current?.degree) {
      current = null;
      return;
    }
    entries.push({
      school: current.school ?? '',
      faculty: current.faculty ?? '',
      degree: current.degree ?? '',
      field_of_study: current.field_of_study ?? '',
      start: current.start ?? '',
      end: current.end ?? '',
    });
    current = null;
  }

  for (const line of lines) {
    if (/^[•\-*]/.test(line)) continue;

    const gluedSchool = line.match(
      new RegExp(`^(.+?)(${MONTH}\\s+\\d{4})\\s*[-–]\\s*(${MONTH}\\s+\\d{4}|Present|Current)$`, 'i'),
    );
    if (gluedSchool) {
      flush();
      const dates = parseDateRange(`${gluedSchool[2]} - ${gluedSchool[3]}`);
      current = {
        school: gluedSchool[1].trim(),
        start: dates.start,
        end: dates.end,
      };
      continue;
    }

    const dateOnly = extractDates(line);
    if (dateOnly.start && !dateOnly.remainder) {
      if (current) {
        current.start = dateOnly.start;
        current.end = dateOnly.end;
      }
      continue;
    }

    if (dateOnly.start && dateOnly.remainder && isSchoolCandidate(dateOnly.remainder)) {
      flush();
      current = {
        school: dateOnly.remainder,
        start: dateOnly.start,
        end: dateOnly.end,
      };
      continue;
    }

    if (isSchoolCandidate(line)) {
      flush();
      current = { school: line };
      continue;
    }

    if (DEGREE_LINE.test(line) && current) {
      const { degree, fieldOfStudy } = parseDegreeLine(line);
      current.degree = degree;
      if (fieldOfStudy) current.field_of_study = fieldOfStudy;
      continue;
    }

    if (YEAR_RANGE.test(line) || MONTH_RANGE.test(line)) {
      const dates = extractDates(line);
      if (current) {
        current.start = dates.start;
        current.end = dates.end;
      }
      continue;
    }

    if (current && !current.degree && DEGREE_LINE.test(line)) {
      const { degree, fieldOfStudy } = parseDegreeLine(line);
      current.degree = degree;
      if (fieldOfStudy) current.field_of_study = fieldOfStudy;
    } else if (current && !current.degree) {
      const { degree, fieldOfStudy } = parseDegreeLine(line);
      if (degree) {
        current.degree = degree;
        if (fieldOfStudy) current.field_of_study = fieldOfStudy;
      }
    }
  }

  flush();
  return entries;
}

export function parseHonorsFromBlocks(
  educationBlock: string,
  achievementsBlock: string,
): HonorAwardEntry[] {
  const honors: HonorAwardEntry[] = [];
  const combined = `${educationBlock}\n${achievementsBlock}`;

  for (const line of combined.split('\n').map((l) => l.trim()).filter(Boolean)) {
    const cleaned = line.replace(/^[•\-*]\s*/, '').trim();
    if (!/scholarship|dean'?s list|\baward\b|honou?r|hackathon|winning/i.test(cleaned)) {
      continue;
    }
    if (/^cgpa\b|^gpa\b/i.test(cleaned) && !/scholarship|dean'?s list|\baward\b/i.test(cleaned)) {
      continue;
    }

    const title = cleaned
      .replace(/^cgpa:\s*[\d./]+\s*,?\s*/i, '')
      .replace(/^gpa:\s*[\d./]+\s*,?\s*/i, '')
      .trim();

    if (!title || /^cgpa\b|^gpa\b/i.test(title)) continue;

    honors.push({ title, date: '', description: '' });
  }

  return honors;
}
