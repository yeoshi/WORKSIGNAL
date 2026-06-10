import type { AgentRunEvent } from '../../../api/agent/run/route';

export type OrchestratorReasoningEvent = Extract<
  AgentRunEvent,
  { type: 'orchestrator_reasoning' }
>;

export interface DecisionDisplay {
  label: string;
  className: string;
}

export const DECISION_DISPLAY: Record<string, DecisionDisplay> = {
  apply_consensus: {
    label: 'Apply — consensus',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  apply_with_caveat: {
    label: 'Apply — with caveat',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  skip_consensus: {
    label: 'Skip — agents agree',
    className: 'bg-ws-paper text-ws-muted border-ws-line',
  },
  veto_skip: {
    label: 'Veto — risk blocked',
    className: 'bg-red-50 text-red-700 border-red-200',
  },
  no_decision: {
    label: 'No decision',
    className: 'bg-ws-paper text-ws-muted border-ws-line',
  },
};

const ORCHESTRATOR_ACTION_DISPLAY: Record<string, DecisionDisplay> = {
  apply: DECISION_DISPLAY.apply_with_caveat!,
  upskill: {
    label: 'Build skills first',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  hold: DECISION_DISPLAY.skip_consensus!,
};

/** Map raw pipeline decision + optional orchestrator verdict to user-facing label. */
export function getDisplayDecision(
  decision: string,
  orchestrator?: OrchestratorReasoningEvent,
): DecisionDisplay {
  if (orchestrator) {
    return (
      ORCHESTRATOR_ACTION_DISPLAY[orchestrator.action] ??
      DECISION_DISPLAY.apply_with_caveat!
    );
  }
  return DECISION_DISPLAY[decision] ?? DECISION_DISPLAY.no_decision!;
}

/** Split prose into short bullet points for scan-friendly agent cards. */
export function toBulletPoints(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export interface AgentDetailGroup {
  label: string;
  values: string[];
}

export function buildAgentDetails(
  event: Extract<AgentRunEvent, { type: 'agent_result' }>,
): AgentDetailGroup[] {
  const extra = event.extra as Record<string, unknown> | undefined;
  if (!extra) return [];

  if (event.agent === 'realism') {
    const gaps = extra.gaps as string[] | undefined;
    return gaps?.length ? [{ label: 'Key gaps', values: gaps }] : [];
  }

  if (event.agent === 'risk') {
    const flags = extra.red_flags as Array<{ flag: string; severity: string }> | undefined;
    if (!flags?.length) return [];
    return [
      {
        label: 'Red flags',
        values: flags.map((rf) => `${rf.flag} (${rf.severity})`),
      },
    ];
  }

  if (event.agent === 'opportunity') {
    const factors = extra.timing_factors as string[] | undefined;
    return factors?.length ? [{ label: 'Timing factors', values: factors }] : [];
  }

  return [];
}
