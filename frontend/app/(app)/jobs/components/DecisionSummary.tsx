import type {
  AgentName,
  Decision,
  EnrichedMasterDecision,
  MasterDecision,
  OrchestratorVerdict,
} from '@/app/types/shared';
import { AgentAvatar } from '../../../components/ui/AgentAvatar';
import { AGENT_THEME } from './agentTheme';
import {
  DECISION_TIER_STYLES,
  getDecisionTier,
} from '../lib/getDecisionTier';

export interface DecisionSummaryProps {
  decision: MasterDecision | EnrichedMasterDecision;
}

const DECISION_LABEL: Record<Decision, string> = {
  apply_consensus: 'Apply — consensus',
  apply_with_caveat: 'Apply — with caveat',
  skip_consensus: 'Skip — consensus',
  deadlock_escalate: 'Deadlock — needs your call',
  veto_skip: 'Veto — skip',
};

function agentLabel(agent: AgentName): string {
  return AGENT_THEME[agent].label;
}

function resolveDecisionLabel(
  decision: Decision,
  orchestratorVerdict?: OrchestratorVerdict | null,
): string {
  if (orchestratorVerdict?.action === 'apply') {
    return DECISION_LABEL.apply_with_caveat;
  }
  if (orchestratorVerdict?.action === 'upskill') {
    return 'Build skills first';
  }
  if (orchestratorVerdict?.action === 'hold') {
    return DECISION_LABEL.skip_consensus;
  }
  return DECISION_LABEL[decision];
}

export function DecisionSummary({ decision }: DecisionSummaryProps) {
  const orchestratorVerdict =
    'orchestrator_verdict' in decision ? decision.orchestrator_verdict : undefined;
  const tier = getDecisionTier(decision.decision, orchestratorVerdict);
  const tierStyles = DECISION_TIER_STYLES[tier];
  const showActionRequired =
    decision.user_action_required && !orchestratorVerdict;

  return (
    <section
      data-testid="decision-summary"
      data-decision-tier={tier}
      aria-label="Orchestrator decision summary"
      className={['rounded-2xl border p-6 shadow-sm', tierStyles.section].join(' ')}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <AgentAvatar agent="orchestrator" size={56} />
          <h2 className="text-lg font-semibold text-gray-900">Orchestrator Decision</h2>
        </div>
        <span
          data-testid="decision-badge"
          className="rounded-full px-3 py-1 text-sm font-semibold text-white"
          style={{ backgroundColor: tierStyles.badge }}
        >
          {resolveDecisionLabel(decision.decision, orchestratorVerdict)}
        </span>
      </div>

      <p data-testid="decision-text" className="mt-3 text-sm leading-relaxed text-gray-700">
        {decision.summary}
      </p>

      {showActionRequired ? (
        <p
          data-testid="decision-action-required"
          className="mt-3 rounded-lg bg-amber-100/80 px-3 py-2 text-sm font-medium text-amber-900"
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
