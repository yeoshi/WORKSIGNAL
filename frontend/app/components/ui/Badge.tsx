import type { ReactNode } from 'react';

export interface BadgeProps {
  children: ReactNode;
  variant?: 'default' | 'teal' | 'muted';
  className?: string;
}

const variants = {
  default: 'bg-ws-paper text-ws-ink border-ws-line',
  teal: 'bg-ws-teal/15 text-ws-teal-mid border-ws-teal/30',
  muted: 'bg-ws-paper text-ws-muted border-ws-line',
};

export function Badge({
  children,
  variant = 'default',
  className = '',
}: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium font-mono uppercase tracking-wide',
        variants[variant],
        className,
      ].join(' ')}
    >
      {children}
    </span>
  );
}
