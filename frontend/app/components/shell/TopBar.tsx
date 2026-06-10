'use client';

import { signOut, useSession } from 'next-auth/react';
import Link from 'next/link';
import { useState } from 'react';
import { Logo } from '../ui/Logo';

function getFirstName(name?: string | null): string {
  if (!name) return 'there';
  return name.split(' ')[0] ?? 'there';
}

export function TopBar() {
  const { data: session } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const firstName = getFirstName(session?.user?.name);

  return (
    <header className="sticky top-0 z-40 border-b border-ws-line bg-ws-card/95 backdrop-blur-md">
      <div className="mx-auto flex min-w-0 max-w-[1600px] items-center justify-between gap-3 px-4 py-3 sm:gap-4 sm:px-6 lg:px-8">
        <Logo href="/dashboard" size="sm" />

        <div className="relative ml-auto">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-ws-line bg-ws-paper text-sm font-semibold text-ws-ink transition hover:border-ws-teal/40"
            aria-label="Settings menu"
            aria-expanded={menuOpen}
          >
            {firstName.charAt(0).toUpperCase()}
          </button>
          {menuOpen && (
            <>
              <button
                type="button"
                className="fixed inset-0 z-40"
                aria-label="Close menu"
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute right-0 z-50 mt-2 w-48 rounded-xl border border-ws-line bg-ws-card py-1 shadow-card">
                <Link
                  href="/profile"
                  className="block w-full px-4 py-2 text-left text-sm text-ws-ink hover:bg-ws-paper"
                  onClick={() => setMenuOpen(false)}
                >
                  Profile
                </Link>
                <button
                  type="button"
                  className="block w-full px-4 py-2 text-left text-sm text-ws-ink hover:bg-ws-paper"
                  onClick={() => {
                    setMenuOpen(false);
                    void signOut({ callbackUrl: '/' });
                  }}
                >
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
