/**
 * Backend service client for BFF routes.
 *
 * In development / monorepo mode: calls backend service functions directly
 * (imported from the @worksignal/backend workspace).
 *
 * In deployed mode: proxies to the API Gateway URL set via
 * `WORKSIGNAL_API_URL` environment variable.
 *
 * This abstraction keeps the BFF routes environment-agnostic — they
 * always call `backendClient.get(...)` or `backendClient.post(...)` and the
 * underlying transport is resolved at runtime.
 */

const API_GATEWAY_URL = process.env.WORKSIGNAL_API_URL ?? '';

/**
 * Whether the backend should be reached via HTTP (deployed mode with API
 * Gateway) or via direct imports (monorepo development).
 */
export const isRemoteBackend = API_GATEWAY_URL.length > 0;

/**
 * Make a GET request to the backend API Gateway.
 * Used only in deployed mode when WORKSIGNAL_API_URL is set.
 */
export async function backendGet<T = unknown>(
    path: string,
    headers?: Record<string, string>,
): Promise<T> {
    const url = `${API_GATEWAY_URL}${path}`;
    const res = await fetch(url, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            ...headers,
        },
    });
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new BackendError(res.status, body || `Backend GET ${path} failed`);
    }
    return res.json() as Promise<T>;
}

/**
 * Make a POST request to the backend API Gateway.
 * Used only in deployed mode when WORKSIGNAL_API_URL is set.
 */
export async function backendPost<T = unknown>(
    path: string,
    body: unknown,
    headers?: Record<string, string>,
): Promise<T> {
    const url = `${API_GATEWAY_URL}${path}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...headers,
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new BackendError(res.status, text || `Backend POST ${path} failed`);
    }
    return res.json() as Promise<T>;
}

/**
 * Typed error for backend failures — carries the HTTP status code so the BFF
 * route can propagate it to the frontend.
 */
export class BackendError extends Error {
    constructor(
        public readonly statusCode: number,
        message: string,
    ) {
        super(message);
        this.name = 'BackendError';
    }
}
