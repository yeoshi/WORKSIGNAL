/**
 * Growth_Agent and Network_Agent output types (Req 19, 20).
 *
 * Mirrors the SkillGaps roadmap schema and the network-suggestion contract.
 */

import type { NetworkConnectionType, RoadmapResourceType } from './enums';

/** A single week within a Growth roadmap (Req 19.3). */
export interface RoadmapWeek {
  /** 1-4. */
  week: number;
  action: string;
  resource_url: string;
  cost: string;
  /** Estimated time commitment in hours. */
  time_hours: number;
  type: RoadmapResourceType;
}

/** A networking opportunity surfaced alongside a roadmap (Req 19.2). */
export interface NetworkingOpportunity {
  name: string;
  date: string;
  url: string;
  type: 'event';
  /** Which roadmap week this event belongs to (1–4), if known. */
  week?: number;
}

/**
 * A four-week skill-gap roadmap produced by the Growth_Agent (Req 19.3).
 * Contains exactly four weekly entries.
 */
export interface SkillGapRoadmap {
  weeks: RoadmapWeek[];
  /** e.g. "74% -> 89%" (Req 19.4). */
  projected_match_improvement: string;
  networking_opportunities: NetworkingOpportunity[];
}

/** A single connection suggestion from the Network_Agent (Req 20.4). */
export interface NetworkSuggestion {
  name: string;
  type: NetworkConnectionType;
  /** Headline / role / context for the connection. */
  context: string;
  /** Personalised outreach draft (Req 20.4). */
  outreach_draft: string;
  /** LinkedIn profile URL when discovered from Exa search. */
  linkedin_url?: string;
  email?: string;
}

/**
 * The Network_Agent's output for a company: at most three suggestions
 * ordered alumni -> community -> cold (Req 20.3).
 */
export interface NetworkSuggestionSet {
  company: string;
  /** At most three entries, ordered by connection tier. */
  suggestions: NetworkSuggestion[];
  upcoming_events: NetworkingOpportunity[];
}
