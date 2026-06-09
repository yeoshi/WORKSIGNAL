import type { ReactNode } from 'react';

export interface MetricProps {
  label: string;
  value: ReactNode;
  subtext?: string;
  highlight?: boolean;
  /** Renders as a bordered card for dashboard stat tiles. */
  bordered?: boolean;
  className?: string;
}

export function Metric({
  label,
  value,
  subtext,
  highlight = false,
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
            ? 'text-2xl text-ws-teal sm:text-3xl xl:text-4xl'
            : 'text-xl text-ws-ink sm:text-2xl',
        ].join(' ')}
      >
        {value}
      </p>
      {subtext && (
        <p className="mt-1 text-sm text-ws-muted">{subtext}</p>
      )}
    </div>
  );
}
