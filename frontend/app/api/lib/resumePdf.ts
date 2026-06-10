import { PDFDocument, StandardFonts } from 'pdf-lib';

/** Replace Unicode characters that StandardFonts (WinAnsi) cannot encode. */
export function sanitizeForPdfText(text: string): string {
  return text
    .replace(/\u25cf/g, '-')
    .replace(/\u25cb/g, '-')
    .replace(/\u2022/g, '-')
    .replace(/\u2023/g, '-')
    .replace(/\u2043/g, '-')
    .replace(/\u2013/g, '-')
    .replace(/\u2014/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '');
}

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 50;
const LINE_HEIGHT = 14;
const HEADING_SIZE = 12;
const BODY_SIZE = 10;

function isLikelySectionHeading(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 48) return false;
  const letters = trimmed.replace(/[^A-Za-z]/g, '');
  if (letters.length < 3) return false;
  const upperRatio =
    (trimmed.match(/[A-Z]/g)?.length ?? 0) / Math.max(letters.length, 1);
  return upperRatio >= 0.6 || trimmed === trimmed.toUpperCase();
}

function wrapLine(
  text: string,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  fontSize: number,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    const width = font.widthOfTextAtSize(candidate, fontSize);
    if (width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current) lines.push(current);
  return lines;
}

/** Render tailored resume plain text as a simple A4 PDF. */
export async function textToResumePdf(text: string): Promise<Uint8Array> {
  const safeText = sanitizeForPdfText(text);
  const doc = await PDFDocument.create();
  const bodyFont = await doc.embedFont(StandardFonts.Helvetica);
  const headingFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const maxWidth = PAGE_WIDTH - MARGIN * 2;

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  function ensureSpace(linesNeeded: number): void {
    if (y - linesNeeded * LINE_HEIGHT >= MARGIN) return;
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;
  }

  for (const rawLine of safeText.split('\n')) {
    const trimmed = rawLine.trim();

    if (!trimmed) {
      ensureSpace(1);
      y -= LINE_HEIGHT / 2;
      continue;
    }

    const isHeading = isLikelySectionHeading(trimmed);
    const fontSize = isHeading ? HEADING_SIZE : BODY_SIZE;
    const font = isHeading ? headingFont : bodyFont;
    const wrapped = wrapLine(trimmed, font, fontSize, maxWidth);

    if (isHeading && wrapped.length > 0) {
      ensureSpace(wrapped.length + 1);
      y -= LINE_HEIGHT / 2;
    }

    for (const line of wrapped) {
      ensureSpace(1);
      page.drawText(line, {
        x: MARGIN,
        y,
        size: fontSize,
        font,
      });
      y -= LINE_HEIGHT;
    }
  }

  return doc.save();
}
