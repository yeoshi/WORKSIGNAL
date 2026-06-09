/**
 * Threshold adjustments list for the Weekly Brief (Req 21.5).
 *
 * Displays each adjustment from the most recent recalibration showing
 * the agent, parameter, prior value → new value, and reason.
 */

import type { RecalibrationAdjustment } from '@worksignal/shared';

export interface ThresholdAdjustmentsProps {
    adjustments: RecalibrationAdjustment[];
}

const AGENT_LABEL: Record<string, string> = {
    ambition: 'Ambition',
    realism: 'Realism',
    risk: 'Risk',
    opportunity: 'Opportunity',
};

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
                    <li
                        key={`${adj.agent}-${adj.parameter}-${index}`}
                        data-testid="threshold-adjustment-item"
                        className="rounded-lg border border-gray-200 bg-white p-4"
                    >
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                                <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                                    {AGENT_LABEL[adj.agent] ?? adj.agent}
                                </span>
                                <span className="text-sm font-medium text-gray-900">
                                    {adj.parameter}
                                </span>
                            </div>

                            <div className="flex items-center gap-2 text-sm">
                                <span
                                    data-testid="prior-value"
                                    className="font-mono text-gray-500"
                                >
                                    {String(adj.old_value)}
                                </span>
                                <span className="text-gray-400" aria-hidden="true">→</span>
                                <span className="sr-only">changed to</span>
                                <span
                                    data-testid="new-value"
                                    className="font-mono font-semibold text-gray-900"
                                >
                                    {String(adj.new_value)}
                                </span>
                            </div>

                            <p className="text-sm text-gray-600">{adj.reason}</p>
                        </div>
                    </li>
                ))}
            </ul>
        </section>
    );
}
