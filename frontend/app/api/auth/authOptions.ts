import type { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { DEMO_MODE } from '../lib/demo';
import { persistOAuthSignIn } from './persistOAuthSignIn';

const TOKEN_ENCRYPTION_SECRET =
  process.env.TOKEN_ENCRYPTION_SECRET ?? 'dev-encryption-secret-change-in-production';

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      authorization: {
        params: {
          scope:
            'openid email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send',
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ account, profile }) {
      if (!account || !profile) {
        return false;
      }

      if (DEMO_MODE) {
        return true;
      }

      try {
        const { DynamoDBWrapper } = await import('@/app/api/lib/aws');
        const db = new DynamoDBWrapper();
        const result = await persistOAuthSignIn({
          profile: profile as {
            sub?: string | null;
            email?: string | null;
            name?: string | null;
          },
          account,
          encryptionSecret: TOKEN_ENCRYPTION_SECRET,
          db,
        });

        return result.redirectUrl ?? true;
      } catch (error) {
        console.error('OAuth sign-in persistence failed:', error);
        const message =
          error instanceof Error ? error.message : 'Sign-in persistence failed';
        if (/ExpiredToken|expired token/i.test(message)) {
          throw new Error(
            'AWS credentials in frontend/.env.local are expired. Refresh AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_SESSION_TOKEN, then restart the dev server.',
          );
        }
        return false;
      }
    },
    async jwt({ token, account, profile }) {
      if (account && profile) {
        token.sub = (profile as { sub?: string }).sub ?? token.sub;
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.sub;
        // Expose access token so API routes can call Gmail API on behalf of the user.
        (session.user as { accessToken?: string }).accessToken = token.accessToken as string | undefined;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET ?? 'dev-secret-change-in-production',
};
