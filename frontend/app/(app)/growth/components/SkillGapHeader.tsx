import { formatImprovementPill } from '../lib/format';

export interface SkillGapHeaderProps {
  /** Kept for API compatibility; skill name is shown via tab switcher. */
  skill?: string;
  projectedMatchImprovement: string;
  timesFlagged?: number;
}

export function SkillGapHeader({
  projectedMatchImprovement,
  timesFlagged,
}: SkillGapHeaderProps) {
  return (
    <header
      data-testid="skill-gap-header"
      className="mb-6 flex items-center justify-between gap-4"
    >
      {typeof timesFlagged === 'number' ? (
        <p data-testid="times-flagged" className="text-sm text-gray-500">
          Flagged across {timesFlagged} {timesFlagged === 1 ? 'job' : 'jobs'}
        </p>
      ) : (
        <span />
      )}

      <span
        data-testid="projected-improvement"
        className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700"
      >
        <span aria-hidden>↑</span>
        <span data-testid="projected-improvement-value">
          {formatImprovementPill(projectedMatchImprovement)}
        </span>
      </span>
    </header>
  );
}
