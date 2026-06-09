import type { BriefGrowthActivity, BriefNetworkActivity } from './briefTypes';

export interface CondensedGrowthSummary {
  skills: string[];
  teaser: string;
  reason: string;
  summary: string;
  detail: string;
}

export interface CondensedNetworkSummary {
  companies: string[];
  teaser: string;
  reason: string;
  summary: string;
  detail: string;
}

export function condenseGrowthActivities(
  activities: BriefGrowthActivity[],
): CondensedGrowthSummary | null {
  if (activities.length === 0) return null;

  const skills = activities.map((activity) => activity.skill);
  const roadmapLabel = activities.length === 1 ? '1 roadmap' : `${activities.length} roadmaps`;

  const reason =
    activities.length === 1
      ? activities[0].reason
      : `Realism Agent flagged ${skills
          .map((skill, index) => `${skill} (${activities[index].times_flagged} jobs)`)
          .join(' and ')}.`;

  const summary =
    activities.length === 1
      ? activities[0].summary
      : `Built four-week roadmaps with linked resources for ${skills.join(' and ')}.`;

  const detail = activities
    .map((activity) => `${activity.skill}: ${activity.projected_match_improvement}`)
    .join(' · ');

  return {
    skills,
    teaser: `${roadmapLabel} built · ${skills.join(', ')}`,
    reason,
    summary,
    detail,
  };
}

export function condenseNetworkActivities(
  activities: BriefNetworkActivity[],
): CondensedNetworkSummary | null {
  if (activities.length === 0) return null;

  const companies = activities.map((activity) => activity.company);
  const totalSuggestions = activities.reduce(
    (sum, activity) => sum + activity.suggestion_count,
    0,
  );
  const suggestionLabel =
    totalSuggestions === 1 ? '1 suggestion' : `${totalSuggestions} suggestions`;

  const reason =
    activities.length === 1
      ? activities[0].reason
      : `You crossed the 2-application threshold at ${companies.join(' and ')} — Network Agent activated for both.`;

  const summary =
    activities.length === 1
      ? activities[0].summary
      : `Drafted ${totalSuggestions} personalised outreach messages across ${companies.join(' and ')}.`;

  const detail = activities
    .map(
      (activity) =>
        `${activity.company}: ${activity.suggestion_count} ${activity.suggestion_count === 1 ? 'suggestion' : 'suggestions'}`,
    )
    .join(' · ');

  return {
    companies,
    teaser: `${suggestionLabel} drafted · ${companies.join(', ')}`,
    reason,
    summary,
    detail,
  };
}
