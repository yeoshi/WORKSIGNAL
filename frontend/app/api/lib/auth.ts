/**
 * BFF auth helper — extracts the authenticated user ID (Google sub) from the
 * NextAuth session. Every API route calls this first and returns 401 if
 * unauthenticated (Req 1.2, design trust boundaries).
 */

import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/authOptions';
import { DEMO_MODE, DEMO_USER } from './demo';

export interface AuthenticatedUser {
    /** Google OAuth `sub` — the Users table partition key. */
    userId: string;
    email?: string;
    name?: string;
}

/**
 * Authenticate the current request. Returns the user info or null when no
 * valid session exists.
 */
export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
    if (DEMO_MODE) return DEMO_USER;

    const session = await getServerSession(authOptions);

    if (!session?.user) {
        return null;
    }

    const userId = (session.user as { id?: string }).id;
    if (!userId) {
        return null;
    }

    return {
        userId,
        email: session.user.email ?? undefined,
        name: session.user.name ?? undefined,
    };
}

/**
 * Utility: returns a 401 JSON response for unauthenticated requests.
 */
export function unauthorizedResponse(): Response {
    return Response.json(
        { error: 'Unauthorized', message: 'Authentication required.' },
        { status: 401 },
    );
}
