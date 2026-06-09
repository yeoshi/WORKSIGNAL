const SKIPPED_JOBS_KEY = 'worksignal:skipped-jobs';

export function loadSkippedJobIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();

  try {
    const raw = window.localStorage.getItem(SKIPPED_JOBS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === 'string'));
  } catch {
    return new Set();
  }
}

export function saveSkippedJobIds(ids: Set<string>): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(SKIPPED_JOBS_KEY, JSON.stringify([...ids]));
}

export function markJobSkipped(jobId: string): void {
  const ids = loadSkippedJobIds();
  ids.add(jobId);
  saveSkippedJobIds(ids);
}

export function filterSkippedActionNeeded<T extends { job_id: string }>(
  items: T[],
): T[] {
  const skipped = loadSkippedJobIds();
  if (skipped.size === 0) return items;
  return items.filter((item) => !skipped.has(item.job_id));
}
