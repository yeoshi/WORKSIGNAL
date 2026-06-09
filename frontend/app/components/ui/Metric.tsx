import type { ReactNode } from 'react';

export interface MetricProps {
  label: string;
  value: ReactNode;
  subtext?: string;
  /** Optional second line below subtext (e.g. benchmark copy). */
  secondarySubtext?: string;
  highlight?: boolean;
  /** Extra classes for the value line. */
  valueClassName?: string;
  /** Renders as a bordered card for dashboard stat tiles. */
  bordered?: boolean;
  className?: string;
}

export function Metric({
  label,
  value,
  subtext,
  secondarySubtext,
  highlight = false,
  valueClassName = '',
  bordered = false,
  className = '',
}: MetricProps) {
  return (
    <div
      className={[
        bordered ? 'rounded-xl border border-ws-line bg-ws-card p-3 shadow-sm sm:p-4' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ws-muted">
        {label}
      </p>
      <p
        className={[
          'mt-1 font-semibold',
          highlight
            ? 'text-2xl sm:text-3xl xl:text-4xl'
            : 'text-xl text-ws-ink sm:text-2xl',
          highlight && !valueClassName ? 'text-ws-teal' : '',
          valueClassName,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {value}
      </p>
      {subtext && (
        <p className="mt-1 text-sm text-ws-muted">{subtext}</p>
      )}
      {secondarySubtext && (
        <p className="mt-0.5 text-xs text-gray-400">{secondarySubtext}</p>
      )}
    </div>
  );
}
