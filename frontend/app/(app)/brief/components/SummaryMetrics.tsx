/**
 * Summary metrics cards for the Weekly Brief (Req 21.5).
 *
 * Displays applications sent, callbacks received, and callback rate
 * as prominent metric cards.
 */

import type { RecalibrationMetrics } from '@/app/types/shared';

export interface SummaryMetricsProps {
    metrics: RecalibrationMetrics;
}

interface MetricCardProps {
    label: string;
    value: string;
    testId: string;
    accent?: 'default' | 'success' | 'warning';
}

function MetricCard({ label, value, testId, accent = 'default' }: MetricCardProps) {
    const borderColor =
        accent === 'success'
            ? 'border-green-200'
            : accent === 'warning'
                ? 'border-amber-200'
                : 'border-gray-200';

    const bgColor =
        accent === 'success'
            ? 'bg-green-50'
            : accent === 'warning'
                ? 'bg-amber-50'
                : 'bg-white';

    return (
        <div
            data-testid={testId}
            className={`flex flex-col gap-1 rounded-lg border ${borderColor} ${bgColor} p-4`}
        >
            <span className="text-sm font-medium text-gray-600">{label}</span>
            <span className="text-2xl font-bold text-gray-900">{value}</span>
        </div>
    );
}

export function SummaryMetrics({ metrics }: SummaryMetricsProps) {
    const ratePercent = (metrics.callback_rate * 100).toFixed(1);
    const rateAccent = metrics.callback_rate >= 0.1 ? 'success' : 'warning';

    return (
        <section aria-label="Summary metrics" data-testid="summary-metrics">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">This week</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <MetricCard
                    label="Applications sent"
                    value={String(metrics.applications_sent)}
                    testId="metric-applications-sent"
                />
                <MetricCard
                    label="Callbacks received"
                    value={String(metrics.callbacks)}
                    testId="metric-callbacks"
                    accent={metrics.callbacks > 0 ? 'success' : 'default'}
                />
                <MetricCard
                    label="Callback rate"
                    value={`${ratePercent}%`}
                    testId="metric-callback-rate"
                    accent={rateAccent}
                />
            </div>
        </section>
    );
}
