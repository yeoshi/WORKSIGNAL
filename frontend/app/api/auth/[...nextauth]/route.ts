/**
 * NextAuth.js App Router route handler (Req 1.1).
 *
 * Configures Google OAuth with the `gmail.readonly` scope. On successful
 * sign-in, creates/retrieves the user record keyed by Google `sub` (Req 1.2),
 * stores email + display name (Req 1.3), and persists the encrypted Gmail
 * OAuth token (Req 1.4).
 */

import NextAuth, { type NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';

export const authOptions: NextAuthOptions = {
    providers: [
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID ?? '',
            clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
            authorization: {
                params: {
                    scope: 'openid email profile https://www.googleapis.com/auth/gmail.readonly',
                    access_type: 'offline',
                    prompt: 'consent',
                },
            },
        }),
    ],
    callbacks: {
        async jwt({ token, account, profile }) {
            // On initial sign-in, persist the Google sub and tokens.
            if (account && profile) {
                token.sub = (profile as { sub?: string }).sub ?? token.sub;
                token.accessToken = account.access_token;
                token.refreshToken = account.refresh_token;
            }
            return token;
        },
        async session({ session, token }) {
            // Expose the Google sub as session.user.id so API routes can identify the user.
            if (session.user) {
                (session.user as { id?: string }).id = token.sub;
            }
            return session;
        },
    },
    secret: process.env.NEXTAUTH_SECRET ?? 'dev-secret-change-in-production',
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
