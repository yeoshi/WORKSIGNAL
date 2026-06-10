const DEFAULT_API_BASE = 'http://localhost:3001';

export function getApiBaseUrl(): string {
  const base = process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_API_BASE;
  return base.replace(/\/$/, '');
}

export async function proxyJson(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(`${getApiBaseUrl()}${path}`, init);
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { message: text };
    }
  }
  return Response.json(body, { status: res.status });
}
