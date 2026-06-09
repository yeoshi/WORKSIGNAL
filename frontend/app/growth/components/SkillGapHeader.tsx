/**
 * Header for the Growth Roadmap view (Req 19.5).
 *
 * Surfaces the identified skill gap, optional "times flagged" context
 * (Req 19.1), and the projected match-score improvement (Req 19.4), e.g.
 * "74% -> 89%".
 */

export interface SkillGapHeaderProps {
  /** The identified skill gap (Req 19.5). */
  skill: string;
  /** Projected match-score improvement string, e.g. "74% -> 89%" (Req 19.4). */
  projectedMatchImprovement: string;
  /** Distinct jobs that flagged the gap (Req 19.1), when available. */
  timesFlagged?: number;
}

export function SkillGapHeader({
  skill,
  projectedMatchImprovement,
  timesFlagged,
}: SkillGapHeaderProps) {
  return (
    <header data-testid="skill-gap-header" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium uppercase tracking-wide text-gray-500">
          Identified skill gap
        </p>
        <h1 data-testid="skill-gap-name" className="text-3xl font-bold text-gray-900">
          {skill}
        </h1>
        {typeof timesFlagged === 'number' && (
          <p data-testid="times-flagged" className="text-sm text-gray-600">
            Flagged across {timesFlagged} {timesFlagged === 1 ? 'job' : 'jobs'}
          </p>
        )}
      </div>

      <div
        data-testid="projected-improvement"
        className="flex w-fit flex-col gap-1 rounded-lg border border-green-200 bg-green-50 px-4 py-3"
      >
        <span className="text-xs font-medium uppercase tracking-wide text-green-700">
          Projected match-score improvement
        </span>
        <span
          data-testid="projected-improvement-value"
          className="text-xl font-semibold text-green-800"
        >
          {projectedMatchImprovement}
        </span>
      </div>
    </header>
  );
}
