'use client';

import type {
  GrowthCardItem,
  IntelligenceSummary,
  NetworkCardItem,
} from '../types';

export interface InsightRailProps {
  growth: GrowthCardItem[];
  network: NetworkCardItem[];
  intelligence: IntelligenceSummary;
  onOpenGrowth: () => void;
  onOpenNetwork: () => void;
  onOpenBrief: () => void;
  /** Stretch cards to fill the dashboard insight column. */
  expanded?: boolean;
}

function InsightCardHeader({
  title,
  labelClassName,
}: {
  title: string;
  labelClassName: string;
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <h2
        className={[
          'font-wordmark text-lg font-semibold leading-tight',
          labelClassName,
        ].join(' ')}
      >
        {title}
      </h2>
      <span
        aria-hidden
        className={[
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/15 text-sm',
          labelClassName,
        ].join(' ')}
      >
        →
      </span>
    </div>
  );
}

export function InsightRail({
  growth,
  network,
  intelligence,
  onOpenGrowth,
  onOpenNetwork,
  onOpenBrief,
  expanded = false,
}: InsightRailProps) {
  const cardClass = expanded ? 'flex-1 min-h-0' : 'min-w-0 flex-1 lg:flex-none';

  return (
    <aside
      className={[
        'flex min-w-0 gap-3',
        expanded
          ? 'h-full min-h-0 flex-col'
          : 'flex-row flex-wrap lg:flex-col',
      ].join(' ')}
      aria-label="Insights"
    >
      <GrowthCard
        items={growth}
        onOpen={onOpenGrowth}
        className={cardClass}
      />
      <NetworkCard
        items={network}
        onOpen={onOpenNetwork}
        className={cardClass}
      />
      <IntelligenceCard
        intelligence={intelligence}
        onOpen={onOpenBrief}
        className={cardClass}
      />
    </aside>
  );
}

function GrowthCard({
  items,
  onOpen,
  className = '',
}: {
  items: GrowthCardItem[];
  onOpen: () => void;
  className?: string;
}) {
  const top = items[0];

  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="growth-card"
      aria-label="Growth"
      className={`rounded-xl border border-orange-800/60 bg-gradient-to-br from-orange-500 to-orange-900 p-4 text-left text-white transition hover:border-orange-300/40 hover:shadow-sm ${className}`}
    >
      <InsightCardHeader title="Growth" labelClassName="text-orange-50" />
      {top ? (
        <>
          <p className="mt-3 text-sm font-semibold leading-snug text-white">
            {top.skill}
          </p>
          <p className="mt-1 text-xs text-white/75">
            {top.projected_match_improvement} projected · flagged{' '}
            {top.times_flagged}×
          </p>
        </>
      ) : (
        <p className="mt-3 text-xs text-white/75">No gaps yet</p>
      )}
    </button>
  );
}

function NetworkCard({
  items,
  onOpen,
  className = '',
}: {
  items: NetworkCardItem[];
  onOpen: () => void;
  className?: string;
}) {
  const top = items[0];

  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="network-card"
      aria-label="Network"
      className={`rounded-xl border border-violet-800/60 bg-gradient-to-br from-violet-600 to-purple-950 p-4 text-left text-white transition hover:border-violet-300/40 hover:shadow-sm ${className}`}
    >
      <InsightCardHeader title="Network" labelClassName="text-violet-100" />
      {top ? (
        <>
          <p className="mt-3 text-sm font-semibold text-white">{top.company}</p>
          <p className="mt-1 text-xs text-white/75">
            {top.suggestion_count} connections · {top.application_count} apps
          </p>
        </>
      ) : (
        <p className="mt-3 text-xs text-white/75">No suggestions</p>
      )}
    </button>
  );
}

function IntelligenceCard({
  intelligence,
  onOpen,
  className = '',
}: {
  intelligence: IntelligenceSummary;
  onOpen: () => void;
  className?: string;
}) {
  const rate =
    intelligence.callback_rate === null
      ? null
      : Math.round(intelligence.callback_rate * 100);

  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="intelligence-card"
      aria-label="Intelligence"
      className={`rounded-xl border border-ws-dark bg-gradient-to-br from-ws-dark to-ws-teal-deep p-4 text-left text-white transition hover:border-ws-teal/40 ${className}`}
    >
      <InsightCardHeader title="Intelligence" labelClassName="text-ws-teal" />
      <p className="mt-3 text-3xl font-semibold text-ws-teal">
        {rate === null ? '—' : `${rate}%`}
      </p>
      <p className="mt-1 text-xs text-white/70">callback rate</p>
    </button>
  );
}

export { GrowthCard, NetworkCard, IntelligenceCard };
