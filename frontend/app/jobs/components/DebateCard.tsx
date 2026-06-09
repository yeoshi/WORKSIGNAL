import type { AgentCardData } from './agentTheme';

export interface DebateCardProps {
  card: AgentCardData;
}

function prettyVerdict(verdict: string): string {
  return verdict
    .split('_')
    .map((w) => (w.length > 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/**
 * A single agent debate card showing the agent's verdict, score, reasoning,
 * and key argument (Req 15.2). Purely presentational so it can be targeted
 * by snapshot/component tests (task 22.2). The agent accent colour is applied
 * via inline style to stay independent of the Tailwind palette.
 */
export function DebateCard({ card }: DebateCardProps) {
  return (
    <article
      data-testid={`debate-card-${card.agent}`}
      className="flex h-full flex-col rounded-2xl border bg-white p-5 shadow-sm"
      style={{ borderTopColor: card.color, borderTopWidth: 4 }}
      aria-label={`${card.label} agent verdict`}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold" style={{ color: card.color }}>
          {card.label}
        </h3>
        <span
          data-testid={`debate-card-${card.agent}-verdict`}
          className="rounded-full px-3 py-1 text-xs font-semibold text-white"
          style={{ backgroundColor: card.color }}
        >
          {prettyVerdict(card.verdict)}
        </span>
      </div>

      {!card.failed ? (
        <div className="mt-3" data-testid={`debate-card-${card.agent}-score`}>
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-gray-500">{card.scoreLabel}</span>
            <span className="font-semibold text-gray-900">{card.score}/100</span>
          </div>
          <div className="mt-1 h-1.5 w-full rounded-full bg-gray-100">
            <div
              className="h-1.5 rounded-full"
              style={{
                width: `${Math.max(0, Math.min(100, card.score))}%`,
                backgroundColor: card.color,
              }}
            />
          </div>
        </div>
      ) : null}

      <p
        data-testid={`debate-card-${card.agent}-reasoning`}
        className="mt-4 text-sm leading-relaxed text-gray-700"
      >
        {card.reasoning}
      </p>

      {card.keyArgument ? (
        <p
          data-testid={`debate-card-${card.agent}-key-argument`}
          className="mt-3 border-l-2 pl-3 text-sm italic text-gray-600"
          style={{ borderLeftColor: card.color }}
        >
          {card.keyArgument}
        </p>
      ) : null}

      {card.details.length > 0 ? (
        <dl className="mt-4 space-y-2 text-sm">
          {card.details.map((detail) => (
            <div key={detail.label}>
              <dt className="font-medium text-gray-700">{detail.label}</dt>
              <dd className="mt-0.5">
                <ul className="list-disc pl-5 text-gray-600">
                  {detail.values.map((value, i) => (
                    <li key={`${detail.label}-${i}`}>{value}</li>
                  ))}
                </ul>
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </article>
  );
}
