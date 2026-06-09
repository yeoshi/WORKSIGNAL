import type { ReactNode } from 'react';

export interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  interactive?: boolean;
  'data-testid'?: string;
}

export function Card({
  children,
  className = '',
  onClick,
  interactive = false,
  'data-testid': testId,
}: CardProps) {
  const base = 'ws-card p-5';
  const interactiveStyles = interactive
    ? 'cursor-pointer transition hover:border-ws-teal/40 hover:shadow-md'
    : '';

  if (onClick || interactive) {
    return (
      <button
        type="button"
        onClick={onClick}
        data-testid={testId}
        className={`${base} ${interactiveStyles} w-full text-left ${className}`}
      >
        {children}
      </button>
    );
  }

  return (
    <div data-testid={testId} className={`${base} ${className}`}>
      {children}
    </div>
  );
}
