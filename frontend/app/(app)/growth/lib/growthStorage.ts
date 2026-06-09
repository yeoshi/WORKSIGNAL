import type { WeekProgress } from '../components/RoadmapTimeline';
import type { GrowthCardItem } from '../../dashboard/types';

const ARCHIVED_KEY = 'worksignal:growth-archived-skills';
const PROGRESS_KEY = 'worksignal:growth-progress';
const STANDARD_WEEK_COUNT = 4;

export function isSkillResolved(
  weeks: { week: number }[],
  progress: WeekProgress,
): boolean {
  const resolved = new Set([...progress.completed, ...progress.skipped]);
  return weeks.every((w) => resolved.has(w.week));
}

function notifyGrowthStateChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('worksignal:growth-state-changed'));
}

export function loadArchivedSkills(): Set<string> {
  if (typeof window === 'undefined') return new Set();

  try {
    const raw = window.localStorage.getItem(ARCHIVED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((s): s is string => typeof s === 'string'));
  } catch {
    return new Set();
  }
}

export function saveArchivedSkills(skills: Set<string>): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ARCHIVED_KEY, JSON.stringify([...skills]));
  notifyGrowthStateChanged();
}

export function loadProgressBySkill(): Record<string, WeekProgress> {
  if (typeof window === 'undefined') return {};

  try {
    const raw = window.localStorage.getItem(PROGRESS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Record<string, WeekProgress>;
  } catch {
    return {};
  }
}

export function saveProgressBySkill(progress: Record<string, WeekProgress>): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  notifyGrowthStateChanged();
}

export function isGrowthSkillComplete(skill: string, weekCount = STANDARD_WEEK_COUNT): boolean {
  if (loadArchivedSkills().has(skill)) return true;

  const progress = loadProgressBySkill()[skill];
  if (!progress) return false;

  const weeks = Array.from({ length: weekCount }, (_, index) => ({ week: index + 1 }));
  return isSkillResolved(weeks, progress);
}

export function getActiveGrowthItems(items: GrowthCardItem[]): GrowthCardItem[] {
  return items.filter((item) => !isGrowthSkillComplete(item.skill));
}

export function areAllGrowthRoadmapsComplete(items: GrowthCardItem[]): boolean {
  return items.length > 0 && getActiveGrowthItems(items).length === 0;
}

export function getGrowthCardSubtext(items: GrowthCardItem[]): string {
  if (items.length === 0) return 'No gaps yet';

  if (areAllGrowthRoadmapsComplete(items)) {
    return 'All roadmaps complete';
  }

  const activeItems = getActiveGrowthItems(items);
  return `${activeItems.length} roadmap${activeItems.length === 1 ? '' : 's'} in progress`;
}

export function hasAnyCompletedGrowthSkill(items: GrowthCardItem[]): boolean {
  return items.some((item) => isGrowthSkillComplete(item.skill));
}
