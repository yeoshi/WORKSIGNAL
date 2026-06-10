type PdfParseFn = (buffer: Buffer) => Promise<{ text: string }>;

async function loadPdfParse(): Promise<PdfParseFn> {
  const mod = await import('pdf-parse/lib/pdf-parse.js');
  return (mod.default ?? mod) as PdfParseFn;
}

export async function extractPdfText(bytes: Buffer | Uint8Array): Promise<string> {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const pdfParse = await loadPdfParse();
  const { text } = await pdfParse(buffer);
  return text.replace(/\r/g, '').trim();
}
