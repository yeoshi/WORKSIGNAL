/**
 * Threshold adjustments list for the Weekly Brief (Req 21.5).
 */

import type { AgentName, RecalibrationAdjustment } from '@worksignal/shared';
import { AgentAvatar } from '../../../components/ui/AgentAvatar';
import { AGENT_THEME } from '../../jobs/components/agentTheme';

export interface ThresholdAdjustmentsProps {
  adjustments: RecalibrationAdjustment[];
}

const PARAMETER_LABELS: Record<string, string> = {
  confidence_threshold: 'Confidence threshold',
  match_threshold: 'Match threshold',
  red_flag_weight: 'Red flag weight',
};

const AGENT_BAR_COLORS: Record<AgentName, string> = {
  ambition: 'bg-purple-500',
  realism: 'bg-blue-500',
  risk: 'bg-red-500',
  opportunity: 'bg-emerald-500',
};

function formatParameterLabel(parameter: string): string {
  return (
    PARAMETER_LABELS[parameter] ??
    parameter
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  );
}

function toNumericValue(value: string | number): number | null {
  if (typeof value === 'number') return value;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDisplayValue(value: string | number): string {
  const numeric = toNumericValue(value);
  if (numeric == null) return String(value);

  if (numeric >= 0 && numeric <= 1) {
    return `${(numeric * 100).toFixed(0)}%`;
  }

  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(2);
}

function barPercent(value: string | number): number {
  const numeric = toNumericValue(value);
  if (numeric == null) return 50;

  if (numeric >= 0 && numeric <= 1) {
    return numeric * 100;
  }

  return Math.min(Math.max(numeric, 0), 100);
}

function formatDelta(oldValue: string | number, newValue: string | number): string | null {
  const oldNumeric = toNumericValue(oldValue);
  const newNumeric = toNumericValue(newValue);
  if (oldNumeric == null || newNumeric == null) return null;

  const delta = newNumeric - oldNumeric;
  if (delta === 0) return 'No change';

  const sign = delta > 0 ? '+' : '−';
  if (oldNumeric >= 0 && oldNumeric <= 1 && newNumeric >= 0 && newNumeric <= 1) {
    return `${sign}${Math.abs(delta * 100).toFixed(0)} pts`;
  }

  const formatted = Number.isInteger(delta)
    ? Math.abs(delta)
    : Math.abs(delta).toFixed(2);
  return `${sign}${formatted}`;
}

function formatAdjustmentSummary(adj: RecalibrationAdjustment): string {
  const agentName = AGENT_THEME[adj.agent]?.label ?? `${adj.agent} Agent`;

  if (
    adj.agent === 'opportunity' &&
    adj.parameter === 'confidence_threshold' &&
    typeof adj.old_value === 'number' &&
    typeof adj.new_value === 'number' &&
    adj.new_value < adj.old_value
  ) {
    return `${agentName} was being too conservative — we've loosened it slightly to surface more roles for you.`;
  }

  if (
    adj.agent === 'realism' &&
    typeof adj.old_value === 'number' &&
    typeof adj.new_value === 'number' &&
    adj.new_value < adj.old_value
  ) {
    return `${agentName} was filtering out too many matches — we've relaxed the bar slightly.`;
  }

  if (adj.reason?.trim()) {
    return adj.reason;
  }

  return `${agentName} adjusted ${formatParameterLabel(adj.parameter)} to better match your results this week.`;
}

function ThresholdAdjustmentCard({ adj }: { adj: RecalibrationAdjustment }) {
  const agentLabel = AGENT_THEME[adj.agent]?.label ?? `${adj.agent} Agent`;
  const parameterLabel = formatParameterLabel(adj.parameter);
  const delta = formatDelta(adj.old_value, adj.new_value);
  const loosened =
    toNumericValue(adj.old_value) != null &&
    toNumericValue(adj.new_value) != null &&
    (toNumericValue(adj.new_value) as number) < (toNumericValue(adj.old_value) as number);

  return (
    <li
      data-testid="threshold-adjustment-item"
      className="rounded-lg border border-gray-200 bg-white p-4"
    >
      <div className="flex items-start gap-3">
        <AgentAvatar agent={adj.agent} size={32} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-gray-900">{agentLabel}</p>
            <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
              {parameterLabel}
            </span>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
            <div>
              <p className="text-xs font-medium text-gray-500">Before</p>
              <div className="mt-1.5 flex items-center gap-2">
                <div
                  className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-gray-100"
                  aria-hidden
                >
                  <div
                    className={`h-full rounded-full ${AGENT_BAR_COLORS[adj.agent]} opacity-60`}
                    style={{ width: `${barPercent(adj.old_value)}%` }}
                  />
                </div>
                <span
                  className="shrink-0 text-sm font-semibold text-gray-800"
                  data-testid="prior-value"
                >
                  {formatDisplayValue(adj.old_value)}
                </span>
              </div>
            </div>

            <span className="hidden text-lg text-gray-400 sm:block" aria-hidden>
              →
            </span>

            <div>
              <p className="text-xs font-medium text-gray-500">After</p>
              <div className="mt-1.5 flex items-center gap-2">
                <div
                  className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-gray-100"
                  aria-hidden
                >
                  <div
                    className={`h-full rounded-full ${AGENT_BAR_COLORS[adj.agent]}`}
                    style={{ width: `${barPercent(adj.new_value)}%` }}
                  />
                </div>
                <span
                  className="shrink-0 text-sm font-semibold text-gray-800"
                  data-testid="new-value"
                >
                  {formatDisplayValue(adj.new_value)}
                </span>
              </div>
            </div>
          </div>

          {delta && (
            <p className="mt-3">
              <span
                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  loosened
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                {delta}
              </span>
            </p>
          )}

          <p className="mt-3 text-sm leading-relaxed text-gray-600">
            {formatAdjustmentSummary(adj)}
          </p>
        </div>
      </div>
    </li>
  );
}

export function ThresholdAdjustments({ adjustments }: ThresholdAdjustmentsProps) {
  if (adjustments.length === 0) {
    return (
      <section aria-label="Threshold adjustments" data-testid="threshold-adjustments">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Threshold adjustments</h2>
        <p
          data-testid="no-adjustments"
          className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-600"
        >
          No threshold adjustments this week. All parameters remain unchanged.
        </p>
      </section>
    );
  }

  return (
    <section aria-label="Threshold adjustments" data-testid="threshold-adjustments">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">Threshold adjustments</h2>
      <ul className="flex flex-col gap-3" role="list">
        {adjustments.map((adj, index) => (
          <ThresholdAdjustmentCard
            key={`${adj.agent}-${adj.parameter}-${index}`}
            adj={adj}
          />
        ))}
      </ul>
    </section>
  );
}
