const DEFAULT_API_BASE = 'http://localhost:3001';

export function getApiBaseUrl(): string {
  const base = process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_API_BASE;
  return base.replace(/\/$/, '');
}

/** True when NEXT_PUBLIC_API_URL is set (production AWS API Gateway). */
export function isRemoteBackendConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_API_URL?.trim());
}

/**
 * Vercel/production should proxy long-running agent work to API Gateway.
 * Local dev without NEXT_PUBLIC_API_URL runs the pipeline in-process instead.
 */
export function shouldProxyAgentRunToRemote(): boolean {
  return isRemoteBackendConfigured();
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
