import Link from 'next/link';
import { Logo } from './components/ui/Logo';
import { SignInWithGoogleButton } from './components/landing/SignInWithGoogleButton';
import { TypewriterPrompt } from './components/landing/TypewriterPrompt';

function HeroBackground() {
  const nodes = [
    { x: '12%', y: '22%', delay: '0s' },
    { x: '78%', y: '18%', delay: '1.2s' },
    { x: '65%', y: '72%', delay: '2.1s' },
    { x: '28%', y: '68%', delay: '0.8s' },
    { x: '88%', y: '55%', delay: '1.6s' },
  ];

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="hero-gradient absolute inset-0 opacity-95" />
      {nodes.map((node, i) => (
        <span
          key={i}
          className="animate-float-node absolute h-2 w-2 rounded-full bg-white/40"
          style={{
            left: node.x,
            top: node.y,
            animationDelay: node.delay,
          }}
        />
      ))}
    </div>
  );
}

export default function HomePage() {
  const isDev = process.env.NODE_ENV === 'development';

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 py-16 text-white">
      <HeroBackground />

      <div className="relative z-10 flex max-w-2xl flex-col items-center text-center">
        <Logo size="lg" inverted />
        <h1 className="mt-6 font-wordmark text-5xl font-semibold tracking-tight sm:text-6xl">
          Your job search team. Working 24/7.
        </h1>
        <p className="mt-4 max-w-xl text-lg text-white/85">
          Most tools just apply. worksignal&apos;s 8 agents debate every role,
          identify your gaps, and connect you to the right people — automatically.
        </p>

        <div className="mt-8">
          <SignInWithGoogleButton />
        </div>

        <div className="mt-8 w-full max-w-xl">
          <TypewriterPrompt />
          <p className="mt-3 text-center text-xs text-white/60">
            Track everything. Ask anything.
          </p>
        </div>
      </div>

      {isDev && (
        <nav className="relative z-10 mt-16 flex flex-col items-center gap-3 border-t border-white/20 pt-8">
          <p className="font-mono text-[10px] uppercase tracking-widest text-white/50">
            Quick links (dev)
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {(
              [
                ['Dashboard', '/dashboard'],
                ['Growth', '/growth'],
                ['Network', '/network'],
                ['Brief', '/brief'],
              ] as const
            ).map(([label, href]) => (
              <Link
                key={href}
                href={href}
                className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white/80 hover:bg-white/10"
              >
                {label}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </main>
  );
}
