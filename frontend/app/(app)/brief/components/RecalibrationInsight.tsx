'use client';

import type { AgentScoreAverages, SkillGapSummaryItem } from '@/app/types/shared';

interface RecalibrationInsightProps {
  scoreAverages?: AgentScoreAverages;
  skillsGap?: SkillGapSummaryItem[];
  applicationCount?: number;
}

const SCORE_COLORS: Record<keyof AgentScoreAverages, string> = {
  ambition: 'bg-purple-500',
  realism: 'bg-blue-500',
  risk: 'bg-red-500',
  opportunity: 'bg-emerald-500',
};

const SCORE_LABELS: Record<keyof AgentScoreAverages, string> = {
  ambition: 'Ambition',
  realism: 'Realism',
  risk: 'Risk',
  opportunity: 'Opportunity',
};

export function RecalibrationInsight({
  scoreAverages,
  skillsGap,
  applicationCount,
}: RecalibrationInsightProps) {
  if (!scoreAverages && (!skillsGap || skillsGap.length === 0)) return null;

  const divergence = scoreAverages
    ? scoreAverages.ambition - scoreAverages.realism
    : 0;
  const hasDivergence = divergence >= 15;

  return (
    <section aria-label="Calibration agent insight" data-testid="recalibration-insight">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">Calibration Agent</h2>

      <div className="flex flex-col gap-3">
        {scoreAverages && (
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-500">
              Avg agent scores
              {applicationCount != null ? ` · ${applicationCount} applications` : ''}
            </p>
            <div className="flex flex-col gap-2.5">
              {(Object.keys(SCORE_LABELS) as (keyof AgentScoreAverages)[]).map((agent) => (
                <div key={agent} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-xs text-gray-600">
                    {SCORE_LABELS[agent]}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className={`h-full rounded-full ${SCORE_COLORS[agent]} transition-all`}
                      style={{ width: `${Math.min(scoreAverages[agent], 100)}%` }}
                    />
                  </div>
                  <span className="w-8 shrink-0 text-right text-xs font-semibold text-gray-700">
                    {scoreAverages[agent]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {hasDivergence && scoreAverages && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-800">Trend observed</p>
            <p className="mt-1.5 text-sm leading-relaxed text-amber-700">
              Applications averaged <strong>{scoreAverages.ambition}</strong> on Ambition but only{' '}
              <strong>{scoreAverages.realism}</strong> on Realism — a gap of{' '}
              <strong>{divergence} points</strong>. The Ambition Agent was systematically
              over-recommending stretch roles the profile isn&apos;t yet competitive for.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-amber-700">
              The Calibration Agent is using this as a feedback signal — Ambition threshold
              will be lowered next week to surface fewer overreach roles.
            </p>
          </div>
        )}

        {skillsGap && skillsGap.length > 0 && (
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">
              Skills to work on
            </p>
            <p className="mb-3 text-xs text-gray-500">
              From JDs where Ambition said yes but Realism flagged gaps:
            </p>
            <ul className="flex flex-col gap-2" role="list">
              {skillsGap.map((item) => (
                <li
                  key={item.skill}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="text-sm text-gray-800">{item.skill}</span>
                  <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                    flagged {item.flagged_count}×
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
