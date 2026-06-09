import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-5xl font-bold tracking-tight">WORKSIGNAL</h1>
        <p className="text-lg text-gray-600">
          AI-powered multi-agent job search for early-career Singaporeans.
        </p>
      </div>

      <div className="flex flex-col items-center gap-4 pt-6">
        {/* Google Sign-In via NextAuth */}
        <a
          href="/api/auth/signin"
          className="inline-flex items-center gap-3 rounded-lg bg-white px-6 py-3 text-base font-medium text-gray-700 shadow-md ring-1 ring-gray-200 transition hover:shadow-lg hover:ring-gray-300"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Sign in with Google
        </a>

        <p className="text-sm text-gray-500">
          Sign in to start your AI-powered job search
        </p>
      </div>

      {/* Quick navigation for development */}
      <nav className="mt-12 flex flex-col items-center gap-3 border-t border-gray-200 pt-8">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
          Quick links (dev)
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            href="/onboarding"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
          >
            Onboarding
          </Link>
          <Link
            href="/dashboard"
            className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
          >
            Dashboard
          </Link>
          <Link
            href="/pipeline"
            className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
          >
            Pipeline
          </Link>
          <Link
            href="/growth"
            className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
          >
            Growth
          </Link>
          <Link
            href="/network"
            className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
          >
            Network
          </Link>
          <Link
            href="/brief"
            className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
          >
            Weekly Brief
          </Link>
        </div>
      </nav>
    </main>
  );
}
