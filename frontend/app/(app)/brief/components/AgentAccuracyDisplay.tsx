/**
 * Per-agent accuracy display for the Weekly Brief (Req 21.5).
 *
 * Shows the accuracy of each debate agent (ambition, realism, risk,
 * opportunity) based on verdict outcomes from the past week.
 */

import type { AgentName, AgentAccuracy } from '@worksignal/shared';

/** Inline the agent names to avoid pulling node:crypto via the shared barrel export. */
const AGENT_NAMES: AgentName[] = ['ambition', 'realism', 'risk', 'opportunity'];

export interface AgentAccuracyDisplayProps {
    agentPerformance: Record<AgentName, AgentAccuracy>;
}

const AGENT_LABELS: Record<AgentName, string> = {
    ambition: 'Ambition',
    realism: 'Realism',
    risk: 'Risk',
    opportunity: 'Opportunity',
};

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

export function AgentAccuracyDisplay({ agentPerformance }: AgentAccuracyDisplayProps) {
    return (
        <section aria-label="Agent accuracy" data-testid="agent-accuracy">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Per-agent accuracy</h2>
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
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-gray-900">
                                    {AGENT_LABELS[agent]}
                                </span>
                                <span className="text-sm font-semibold text-gray-700">
                                    {percent.toFixed(0)}%
                                </span>
                            </div>

                            {/* Accuracy bar */}
                            <div
                                className="h-2 w-full overflow-hidden rounded-full bg-gray-100"
                                role="progressbar"
                                aria-valuenow={Math.round(percent)}
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-label={`${AGENT_LABELS[agent]} accuracy ${percent.toFixed(0)}%`}
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
            </div>
        </section>
    );
}
