import type { AgentName } from '@/app/types/shared';

export type ExtendedAgentName =
  | AgentName
  | 'orchestrator'
  | 'recalibration'
  | 'growth'
  | 'network';

export const AGENT_AVATAR_PATHS: Record<ExtendedAgentName, string> = {
  ambition: '/agents/Ambition.png',
  realism: '/agents/Realism.png',
  risk: '/agents/Risk.png',
  opportunity: '/agents/Opportunity.png',
  orchestrator: '/agents/Orchestrator.png',
  recalibration: '/agents/Recalibration.png',
  growth: '/agents/Growth.png',
  network: '/agents/Network.png',
};

export function agentAvatarSrc(agent: ExtendedAgentName): string {
  return AGENT_AVATAR_PATHS[agent];
}
