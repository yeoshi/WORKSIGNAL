import { MONTH } from './resumeDateUtils';

const BULLET_CHARS = /[●•▪◦‣⁃]/g;

const SPLIT_HEADING_PAIRS: [string, string][] = [
  ['WORK', 'EXPERIENCE'],
  ['PROJECT', 'EXPERIENCE'],
  ['KEY', 'SKILLS'],
  ['TECHNICAL', 'SKILLS'],
  ['EXTRA', 'CURRICULAR'],
];

function mergeSplitHeadings(text: string): string {
  const lines = text.split('\n');
  const merged: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const next = lines[i + 1]?.trim() ?? '';

    let combined = false;
    for (const [first, second] of SPLIT_HEADING_PAIRS) {
      if (
        line.toUpperCase() === first &&
        next.toUpperCase() === second
      ) {
        merged.push(`${first} ${second}`);
        i++;
        combined = true;
        break;
      }
    }

    if (!combined) {
      merged.push(lines[i]);
    }
  }

  return merged.join('\n');
}

function insertGluedDateSpaces(text: string): string {
  let result = text;

  // Year glued to following word: "2024Tech" → "2024 Tech"
  result = result.replace(/(\d{4})([A-Za-z])/g, '$1 $2');

  // Letter glued before month+year: "SingaporeDec 2025" → "Singapore Dec 2025"
  result = result.replace(
    new RegExp(`([a-zA-Z])(${MONTH})\\s+(\\d{4})`, 'gi'),
    '$1 $2 $3',
  );

  return result;
}

/**
 * Pre-process raw PDF text before section and job parsing.
 */
export function normalizeResumeText(text: string): string {
  let result = text.replace(/\r/g, '');

  result = result.replace(BULLET_CHARS, '•');
  result = insertGluedDateSpaces(result);
  result = mergeSplitHeadings(result);

  // Collapse horizontal whitespace but preserve line breaks
  result = result
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trimEnd())
    .join('\n')
    .trim();

  return result;
}
