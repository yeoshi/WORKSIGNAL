import type { DashboardData, DashboardIssue } from '../types';

export function buildDashboardIssues(data: DashboardData): DashboardIssue[] {
  const issues: DashboardIssue[] = [];

  for (const suggestion of data.relaxation_suggestions) {
    if (suggestion.approval_state === 'pending') {
      issues.push({ type: 'relaxation_suggestion', suggestion });
    }
  }

  return issues;
}

export function countPendingIssues(data: DashboardData): number {
  return buildDashboardIssues(data).length;
}
