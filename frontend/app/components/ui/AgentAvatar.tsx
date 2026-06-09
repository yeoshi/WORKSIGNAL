import { agentAvatarSrc, type ExtendedAgentName } from '../../lib/agentAvatars';

export interface AgentAvatarProps {
  agent: ExtendedAgentName;
  size: number;
  className?: string;
}

export function AgentAvatar({ agent, size, className = '' }: AgentAvatarProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={agentAvatarSrc(agent)}
      alt=""
      width={size}
      height={size}
      className={['shrink-0 rounded-full object-cover', className]
        .filter(Boolean)
        .join(' ')}
      aria-hidden
      data-agent-avatar={agent}
    />
  );
}
