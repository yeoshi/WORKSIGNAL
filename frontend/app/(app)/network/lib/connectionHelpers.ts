import type { NetworkConnectionType, NetworkSuggestion } from '@/app/types/shared';

export type EnrichedNetworkSuggestion = NetworkSuggestion & {
  reasoning?: string;
  linkedin_url?: string;
  email?: string;
  image_url?: string;
};

const AVATAR_STYLES: Record<NetworkConnectionType, string> = {
  alumni: 'bg-blue-100 text-blue-700',
  community: 'bg-purple-100 text-purple-700',
  cold: 'bg-gray-100 text-gray-600',
};

export function getAvatarStyle(type: NetworkConnectionType): string {
  return AVATAR_STYLES[type];
}

/** First + last initial from a display name. */
export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();
  return `${parts[0]!.charAt(0)}${parts[parts.length - 1]!.charAt(0)}`.toUpperCase();
}

/** Role line — prefer the segment before a middle dot. */
export function formatRoleLine(context: string): string {
  const primary = context.split('·')[0]?.trim();
  return primary || context.trim();
}

/** One-sentence agent reasoning for why this person was suggested. */
export function getAgentReasoning(
  suggestion: EnrichedNetworkSuggestion,
  company: string,
): string {
  if (suggestion.reasoning?.trim()) {
    return suggestion.reasoning.trim();
  }

  if (suggestion.type === 'alumni') {
    return `Shared alumni network — connections at ${company} typically convert better.`;
  }

  if (suggestion.type === 'community') {
    return 'Active in your professional community with overlap to your target role.';
  }

  return `Relevant contact at ${company} for direct outreach on your application.`;
}
