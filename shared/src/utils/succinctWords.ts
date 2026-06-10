/** Trim display text to at most `maxWords` words. */
export function succinctWords(text: string, maxWords = 5): string {
  const primary =
    text
      .split(/\s*[|｜,;]\s*/)[0]
      ?.split(/[—–-]/)[0]
      ?.replace(/\s+/g, ' ')
      .replace(/\betc\.?$/i, '')
      .trim() ?? '';
  if (!primary) return '';
  const words = primary.split(' ').filter(Boolean);
  if (words.length <= maxWords) return words.join(' ');
  return `${words.slice(0, maxWords).join(' ')}…`;
}
