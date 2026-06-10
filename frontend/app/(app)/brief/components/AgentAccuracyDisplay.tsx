/**
 * Per-agent accuracy display for the Weekly Brief (Req 21.5).
 */

import type { AgentName, AgentAccuracy } from '@/app/types/shared';
import { AgentAvatar } from '../../../components/ui/AgentAvatar';
import { AGENT_THEME } from '../../jobs/components/agentTheme';
import type { BriefGrowthActivity, BriefNetworkActivity } from '../lib/briefTypes';
import {
  condenseGrowthActivities,
  condenseNetworkActivities,
} from '../lib/condenseAgentActivities';

const AGENT_NAMES: AgentName[] = ['ambition', 'realism', 'risk', 'opportunity'];

export interface AgentAccuracyDisplayProps {
  agentPerformance: Record<AgentName, AgentAccuracy>;
  growthActivities?: BriefGrowthActivity[];
  networkActivities?: BriefNetworkActivity[];
}

const AGENT_COLORS: Record<AgentName, string> = {
  ambition: 'bg-purple-500',
  realism: 'bg-blue-500',
  risk: 'bg-red-500',
  opportunity: 'bg-emerald-500',
};

function computeAccuracyPercent(accuracy: AgentAccuracy): number {
  const total = accuracy.correct + accuracy.incorrect;
  if (total === 0) return 0;
  return (accuracy.correct / total) * 100;
}

function CollapsibleAgentCard({
  testId,
  agent,
  label,
  teaser,
  accentClass,
  reason,
  summary,
  detail,
}: {
  testId: string;
  agent: 'growth' | 'network';
  label: string;
  teaser: string;
  accentClass: string;
  reason: string;
  summary: string;
  detail: string;
}) {
  return (
    <details
      data-testid={testId}
      className={[
        'group col-span-1 rounded-lg border border-gray-200 bg-white sm:col-span-2',
        accentClass,
      ].join(' ')}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 marker:content-none [&::-webkit-details-marker]:hidden">
        <div className="flex min-w-0 items-center gap-2">
          <AgentAvatar agent={agent} size={28} />
          <span className="text-sm font-medium text-gray-900">{label}</span>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-xs text-gray-500">{teaser}</span>
          <span
            aria-hidden
            className="shrink-0 text-xs text-gray-400 transition-transform group-open:rotate-180"
          >
            ▼
          </span>
        </div>
      </summary>

      <div className="space-y-3 border-t border-gray-100 px-4 pb-4 pt-3 text-sm">
        <div>
          <p className="font-semibold text-gray-900">Why</p>
          <p className="mt-1 leading-relaxed text-gray-600">{reason}</p>
        </div>
        <div>
          <p className="font-semibold text-gray-900">What it did</p>
          <p className="mt-1 leading-relaxed text-gray-600">{summary}</p>
        </div>
        <p className="text-xs text-gray-500">{detail}</p>
      </div>
    </details>
  );
}

export function AgentAccuracyDisplay({
  agentPerformance,
  growthActivities = [],
  networkActivities = [],
}: AgentAccuracyDisplayProps) {
  const growthSummary = condenseGrowthActivities(growthActivities);
  const networkSummary = condenseNetworkActivities(networkActivities);

  return (
    <section aria-label="Agent accuracy" data-testid="agent-accuracy">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">How your agents performed</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {AGENT_NAMES.map((agent) => {
          const accuracy = agentPerformance[agent];
          const percent = computeAccuracyPercent(accuracy);
          const total = accuracy.correct + accuracy.incorrect;

          return (
            <div
              key={agent}
              data-testid={`agent-accuracy-${agent}`}
              className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <AgentAvatar agent={agent} size={28} />
                  <span className="text-sm font-medium text-gray-900">
                    {AGENT_THEME[agent].label}
                  </span>
                </div>
                <span className="text-sm font-semibold text-gray-700">
                  {percent.toFixed(0)}%
                </span>
              </div>

              <div
                className="h-2 w-full overflow-hidden rounded-full bg-gray-100"
                role="progressbar"
                aria-valuenow={Math.round(percent)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${AGENT_THEME[agent].label} accuracy ${percent.toFixed(0)}%`}
              >
                <div
                  className={`h-full rounded-full ${AGENT_COLORS[agent]} transition-all`}
                  style={{ width: `${Math.min(percent, 100)}%` }}
                />
              </div>

              <span className="text-xs text-gray-500">
                {accuracy.correct} correct / {total} total evaluations
              </span>
            </div>
          );
        })}

        {growthSummary && (
          <CollapsibleAgentCard
            testId="agent-activity-growth"
            agent="growth"
            label="Growth Agent"
            teaser={growthSummary.teaser}
            accentClass="border-l-4 border-l-orange-400"
            reason={growthSummary.reason}
            summary={growthSummary.summary}
            detail={growthSummary.detail}
          />
        )}

        {networkSummary && (
          <CollapsibleAgentCard
            testId="agent-activity-network"
            agent="network"
            label="Network Agent"
            teaser={networkSummary.teaser}
            accentClass="border-l-4 border-l-violet-400"
            reason={networkSummary.reason}
            summary={networkSummary.summary}
            detail={networkSummary.detail}
          />
        )}
      </div>
    </section>
  );
}
