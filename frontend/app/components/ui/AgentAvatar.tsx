import { agentAvatarSrc, type ExtendedAgentName } from '../../lib/agentAvatars';

export interface AgentAvatarProps {
  agent: ExtendedAgentName;
  size: number;
  className?: string;
  /** Square shows the full character art; circle crops for compact headers. */
  shape?: 'circle' | 'square';
}

export function AgentAvatar({
  agent,
  size,
  className = '',
  shape = 'circle',
}: AgentAvatarProps) {
  const shapeClass =
    shape === 'square'
      ? 'rounded-lg object-contain bg-ws-paper'
      : 'rounded-full object-cover';

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={agentAvatarSrc(agent)}
      alt=""
      width={size}
      height={size}
      className={['shrink-0', shapeClass, className].filter(Boolean).join(' ')}
      aria-hidden
      data-agent-avatar={agent}
    />
  );
}
