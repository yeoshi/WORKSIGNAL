'use client';

import { useEffect, useState } from 'react';
import type {
  GrowthCardItem,
  IntelligenceSummary,
  NetworkCardItem,
} from '../types';
import {
  areAllGrowthRoadmapsComplete,
  getActiveGrowthItems,
  getGrowthCardSubtext,
  hasAnyCompletedGrowthSkill,
} from '../../growth/lib/growthStorage';
import {
  areAllNetworkCompaniesComplete,
  getActiveNetworkItems,
  getNetworkCardSubtext,
  hasAnyCompletedCompany,
} from '../../network/lib/networkStorage';
import { formatWeekRange } from '../../../lib/formatDate';
import { formatGrowthTitle } from '../../growth/lib/format';

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
  arrowPulse = false,
  arrowPulseTestId,
}: {
  title: string;
  labelClassName: string;
  arrowPulse?: boolean;
  arrowPulseTestId?: string;
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
        data-testid={arrowPulse ? arrowPulseTestId : undefined}
        className={[
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/15 text-sm',
          labelClassName,
          arrowPulse ? 'animate-network-arrow-pulse-once' : '',
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
      <IntelligenceCard
        intelligence={intelligence}
        onOpen={onOpenBrief}
        className={cardClass}
      />
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
  const [growthRevision, setGrowthRevision] = useState(0);
  const [pulseArrow, setPulseArrow] = useState(false);

  useEffect(() => {
    const handler = () => setGrowthRevision((v) => v + 1);
    window.addEventListener('worksignal:growth-state-changed', handler);
    return () => window.removeEventListener('worksignal:growth-state-changed', handler);
  }, []);

  useEffect(() => {
    if (!hasAnyCompletedGrowthSkill(items)) {
      setPulseArrow(false);
      return;
    }
    setPulseArrow(true);
    const timer = window.setTimeout(() => setPulseArrow(false), 700);
    return () => window.clearTimeout(timer);
  }, [items, growthRevision]);

  void growthRevision;
  const subtext = getGrowthCardSubtext(items);
  const allComplete = areAllGrowthRoadmapsComplete(items);
  const activeItems = getActiveGrowthItems(items);
  const headline = allComplete
    ? 'All caught up'
    : formatGrowthTitle(activeItems[0]?.skill ?? top?.skill ?? '');
  const showPulse = pulseArrow && hasAnyCompletedGrowthSkill(items) && !allComplete;

  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="growth-card"
      aria-label="Growth"
      className={`rounded-xl border border-orange-800/60 bg-gradient-to-br from-orange-500 to-orange-900 p-4 text-left text-white transition hover:border-orange-300/40 hover:shadow-sm ${className}`}
    >
      <InsightCardHeader
        title="Growth"
        labelClassName="text-orange-50"
        arrowPulse={showPulse}
        arrowPulseTestId="growth-card-arrow-pulse"
      />
      {top ? (
        <>
          <p data-testid="growth-card-subtext" className="mt-3 text-sm text-white/90">
            {subtext}
          </p>
          <p
            data-testid="growth-card-headline"
            className="mt-1 text-sm font-semibold leading-snug text-white"
          >
            {headline}
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
  const [networkRevision, setNetworkRevision] = useState(0);
  const [pulseArrow, setPulseArrow] = useState(false);

  useEffect(() => {
    const handler = () => setNetworkRevision((v) => v + 1);
    window.addEventListener('worksignal:network-state-changed', handler);
    return () => window.removeEventListener('worksignal:network-state-changed', handler);
  }, []);

  useEffect(() => {
    if (!hasAnyCompletedCompany(items)) {
      setPulseArrow(false);
      return;
    }
    setPulseArrow(true);
    const timer = window.setTimeout(() => setPulseArrow(false), 700);
    return () => window.clearTimeout(timer);
  }, [items, networkRevision]);

  void networkRevision;
  const subtext = getNetworkCardSubtext(items);
  const allComplete = areAllNetworkCompaniesComplete(items);
  const activeItems = getActiveNetworkItems(items);
  const headline = allComplete
    ? 'All caught up'
    : (activeItems[0]?.company ?? top?.company ?? '');
  const showPulse = pulseArrow && hasAnyCompletedCompany(items) && !allComplete;

  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="network-card"
      aria-label="Network"
      className={`rounded-xl border border-violet-800/60 bg-gradient-to-br from-violet-600 to-purple-950 p-4 text-left text-white transition hover:border-violet-300/40 hover:shadow-sm ${className}`}
    >
      <InsightCardHeader
        title="Network"
        labelClassName="text-violet-100"
        arrowPulse={showPulse}
        arrowPulseTestId="network-card-arrow-pulse"
      />
      {top ? (
        <>
          <p data-testid="network-card-subtext" className="mt-3 text-sm text-white/90">
            {subtext}
          </p>
          <p
            data-testid="network-card-headline"
            className="mt-1 text-sm font-semibold text-white"
          >
            {headline}
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
  const weekRange = formatWeekRange(
    intelligence.latest_recalibration?.week_of ?? null,
  );

  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="weekly-report-card"
      aria-label="Weekly Report"
      className={`rounded-xl border border-ws-dark bg-gradient-to-br from-ws-dark to-ws-teal-deep p-4 text-left text-white transition hover:border-ws-teal/40 ${className}`}
    >
      <InsightCardHeader title="Weekly Report" labelClassName="text-ws-teal" />
      <p
        data-testid="weekly-report-date-range"
        className="mt-3 text-sm text-white/90"
      >
        {weekRange}
      </p>
    </button>
  );
}

export { GrowthCard, NetworkCard, IntelligenceCard };
