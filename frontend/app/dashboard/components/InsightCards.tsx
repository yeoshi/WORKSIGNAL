'use client';

import type {
  GrowthCardItem,
  IntelligenceSummary,
  NetworkCardItem,
} from '../types';

/**
 * Growth, Network, and intelligence cards for the dashboard (Req 13, 19, 20,
 * 21). Each is a compact summary that links through to its dedicated view.
 */

export interface GrowthCardProps {
  items: GrowthCardItem[];
}

export function GrowthCard({ items }: GrowthCardProps) {
  const top = items[0];
  return (
    <section
      aria-label="Growth"
      data-testid="growth-card"
      className="rounded-lg border border-gray-200 bg-white p-5"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[#7C3AED]">Growth</h2>
        <a href="/growth" className="text-sm font-medium text-blue-600">
          View roadmap
        </a>
      </div>
      {top ? (
        <div className="mt-3">
          <p className="text-sm text-gray-600">Top skill gap</p>
          <p className="text-base font-semibold text-gray-900">{top.skill}</p>
          <p className="mt-1 text-sm text-gray-500">
            Projected match {top.projected_match_improvement} · flagged across{' '}
            {top.times_flagged} jobs
          </p>
        </div>
      ) : (
        <p className="mt-3 text-sm text-gray-500">
          No skill gaps identified yet.
        </p>
      )}
    </section>
  );
}

export interface NetworkCardProps {
  items: NetworkCardItem[];
}

export function NetworkCard({ items }: NetworkCardProps) {
  const top = items[0];
  return (
    <section
      aria-label="Network"
      data-testid="network-card"
      className="rounded-lg border border-gray-200 bg-white p-5"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[#0891B2]">Network</h2>
        <a href="/network" className="text-sm font-medium text-blue-600">
          View suggestions
        </a>
      </div>
      {top ? (
        <div className="mt-3">
          <p className="text-base font-semibold text-gray-900">{top.company}</p>
          <p className="mt-1 text-sm text-gray-500">
            {top.suggestion_count} connection
            {top.suggestion_count === 1 ? '' : 's'} · {top.application_count}{' '}
            application
            {top.application_count === 1 ? '' : 's'} sent
          </p>
        </div>
      ) : (
        <p className="mt-3 text-sm text-gray-500">
          No networking suggestions yet.
        </p>
      )}
    </section>
  );
}

export interface IntelligenceCardProps {
  intelligence: IntelligenceSummary;
}

export function IntelligenceCard({ intelligence }: IntelligenceCardProps) {
  const { callback_rate, latest_recalibration } = intelligence;
  return (
    <section
      aria-label="Intelligence"
      data-testid="intelligence-card"
      className="rounded-lg border border-gray-200 bg-white p-5"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Intelligence</h2>
        <a href="/brief" className="text-sm font-medium text-blue-600">
          Weekly brief
        </a>
      </div>
      <div className="mt-3">
        <p className="text-sm text-gray-600">Callback rate</p>
        <p className="text-2xl font-bold text-gray-900">
          {callback_rate === null
            ? '—'
            : `${Math.round(callback_rate * 100)}%`}
        </p>
        {latest_recalibration ? (
          <p className="mt-2 text-sm text-gray-500">
            {latest_recalibration.adjustments_made.length} threshold
            adjustment
            {latest_recalibration.adjustments_made.length === 1
              ? ''
              : 's'}{' '}
            last recalibration
            {latest_recalibration.emergency ? ' · emergency review' : ''}
          </p>
        ) : (
          <p className="mt-2 text-sm text-gray-500">
            No recalibration data yet.
          </p>
        )}
      </div>
    </section>
  );
}
