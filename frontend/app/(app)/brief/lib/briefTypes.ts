/**
 * Extended Weekly Brief fields for background agent activity.
 */

export interface BriefGrowthActivity {
  skill: string;
  times_flagged: number;
  projected_match_improvement: string;
  /** Plain-English summary of what the Growth Agent produced. */
  summary: string;
  /** Why the agent was triggered this week. */
  reason: string;
}

export interface BriefNetworkActivity {
  company: string;
  application_count: number;
  suggestion_count: number;
  /** Plain-English summary of what the Network Agent produced. */
  summary: string;
  /** Why the agent was triggered this week. */
  reason: string;
}

export interface BriefBackgroundAgents {
  growth: BriefGrowthActivity[];
  network: BriefNetworkActivity[];
}
