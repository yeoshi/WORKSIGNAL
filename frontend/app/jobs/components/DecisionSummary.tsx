import type { AgentName, Decision, MasterDecision } from '@worksignal/shared';
import { AGENT_THEME } from './agentTheme';

export interface DecisionSummaryProps {
  decision: MasterDecision;
}

const DECISION_LABEL: Record<Decision, string> = {
  apply_consensus: 'Apply — consensus',
  apply_with_caveat: 'Apply — with caveat',
  skip_consensus: 'Skip — consensus',
  deadlock_escalate: 'Deadlock — needs your call',
  veto_skip: 'Veto — skip',
};

const DECISION_COLOR: Record<Decision, string> = {
  apply_consensus: '#059669',
  apply_with_caveat: '#2563EB',
  skip_consensus: '#6B7280',
  deadlock_escalate: '#D97706',
  veto_skip: '#EF4444',
};

function agentLabel(agent: AgentName): string {
  return AGENT_THEME[agent].label;
}

/**
 * The Master Orchestrator decision summary (Req 15.3): the resolved decision,
 * a human-readable summary, supporting/opposing agents, any dissent note, and
 * the explicit-confirmation flag for low-realism applies (Req 12.6).
 */
export function DecisionSummary({ decision }: DecisionSummaryProps) {
  const color = DECISION_COLOR[decision.decision];

  return (
    <section
      data-testid="decision-summary"
      aria-label="Master decision summary"
      className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-gray-900">Master decision</h2>
        <span
          data-testid="decision-badge"
          className="rounded-full px-3 py-1 text-sm font-semibold text-white"
          style={{ backgroundColor: color }}
        >
          {DECISION_LABEL[decision.decision]}
        </span>
      </div>

      <p data-testid="decision-text" className="mt-3 text-sm leading-relaxed text-gray-700">
        {decision.summary}
      </p>

      {decision.user_action_required ? (
        <p
          data-testid="decision-action-required"
          className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800"
        >
          Your explicit confirmation is required before this application proceeds.
        </p>
      ) : null}

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div data-testid="agents-for">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Supporting
          </p>
          <p className="mt-1 text-sm text-gray-800">
            {decision.agents_for.length > 0
              ? decision.agents_for.map(agentLabel).join(', ')
              : '—'}
          </p>
        </div>
        <div data-testid="agents-against">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Opposing
          </p>
          <p className="mt-1 text-sm text-gray-800">
            {decision.agents_against.length > 0
              ? decision.agents_against.map(agentLabel).join(', ')
              : '—'}
          </p>
        </div>
      </div>

      {decision.dissent_note ? (
        <p data-testid="dissent-note" className="mt-4 text-sm text-gray-600">
          <span className="font-medium text-gray-700">Dissent: </span>
          {decision.dissent_note}
        </p>
      ) : null}

      {decision.agent_failures && decision.agent_failures.length > 0 ? (
        <p data-testid="agent-failures" className="mt-3 text-xs text-gray-500">
          Resolved in degraded mode — unavailable agents:{' '}
          {decision.agent_failures.map(agentLabel).join(', ')}.
        </p>
      ) : null}
    </section>
  );
}
