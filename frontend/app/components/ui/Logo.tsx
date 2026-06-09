import Link from 'next/link';

export interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  showWordmark?: boolean;
  href?: string;
  className?: string;
  inverted?: boolean;
}

const markHeights = { sm: 22, md: 28, lg: 40 };
const wordmarkSizes = {
  sm: 'text-base',
  md: 'text-lg',
  lg: 'text-2xl',
};

function LogoMark({
  height,
  inverted,
}: {
  height: number;
  inverted?: boolean;
}) {
  const gradId = inverted ? 'wgradLight' : 'wgrad';
  const stops = inverted
    ? ['#92e7d3', '#54bcb2', '#2f93a6']
    : ['#63c6b4', '#1f8390', '#15324c'];

  return (
    <svg
      viewBox="0 0 300 205"
      aria-hidden
      className="shrink-0"
      style={{ height, width: 'auto' }}
    >
      <defs>
        <linearGradient
          id={gradId}
          gradientUnits="userSpaceOnUse"
          x1="95"
          y1="25"
          x2="205"
          y2="190"
        >
          <stop offset="0" stopColor={stops[0]} />
          <stop offset="0.5" stopColor={stops[1]} />
          <stop offset="1" stopColor={stops[2]} />
        </linearGradient>
      </defs>
      <g
        fill="none"
        stroke={`url(#${gradId})`}
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="20" y1="30" x2="91" y2="76" />
        <line x1="20" y1="30" x2="49" y2="113" />
        <line x1="91" y1="76" x2="49" y2="113" />
        <line x1="49" y1="113" x2="92" y2="185" />
        <line x1="92" y1="185" x2="150" y2="127" />
        <line x1="91" y1="76" x2="150" y2="127" />
        <line x1="150" y1="28" x2="91" y2="76" />
        <line x1="150" y1="28" x2="209" y2="76" />
        <line x1="209" y1="76" x2="150" y2="127" />
        <line x1="280" y1="30" x2="209" y2="76" />
        <line x1="280" y1="30" x2="251" y2="113" />
        <line x1="209" y1="76" x2="251" y2="113" />
        <line x1="251" y1="113" x2="208" y2="185" />
        <line x1="208" y1="185" x2="150" y2="127" />
      </g>
      <g fill={`url(#${gradId})`}>
        <circle cx="20" cy="30" r="15" />
        <circle cx="150" cy="28" r="15" />
        <circle cx="280" cy="30" r="15" />
        <circle cx="91" cy="76" r="15" />
        <circle cx="209" cy="76" r="15" />
        <circle cx="49" cy="113" r="15" />
        <circle cx="251" cy="113" r="15" />
        <circle cx="150" cy="127" r="16" />
        <circle cx="92" cy="185" r="15" />
        <circle cx="208" cy="185" r="15" />
      </g>
    </svg>
  );
}

export function Logo({
  size = 'md',
  showWordmark = true,
  href,
  className = '',
  inverted = false,
}: LogoProps) {
  const content = (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark height={markHeights[size]} inverted={inverted} />
      {showWordmark && (
        <span
          className={[
            'font-wordmark font-semibold tracking-tight',
            wordmarkSizes[size],
            inverted ? 'text-white' : 'text-ws-ink',
          ].join(' ')}
        >
          worksignal
        </span>
      )}
    </span>
  );

  if (href) {
    return (
      <Link href={href} className="inline-flex items-center">
        {content}
      </Link>
    );
  }

  return content;
}
