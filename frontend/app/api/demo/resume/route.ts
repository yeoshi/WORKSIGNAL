import { NextRequest } from 'next/server';
import { DEMO_MODE } from '../../lib/demo';

/** Minimal valid PDF used for demo resume downloads. */
const DEMO_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000052 00000 n\n0000000101 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n178\n%%EOF',
);

export async function GET(request: NextRequest) {
  if (!DEMO_MODE) {
    return Response.json({ error: 'Not Found' }, { status: 404 });
  }

  const file =
    request.nextUrl.searchParams.get('file')?.replace(/[^a-zA-Z0-9._-]/g, '') ||
    'resume.pdf';

  return new Response(DEMO_PDF, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${file}"`,
    },
  });
}
