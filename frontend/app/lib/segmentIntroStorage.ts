export type SegmentIntroKey = 'dashboard' | 'brief' | 'growth' | 'network';

const STORAGE_PREFIX = 'worksignal:intro:';

export function isIntroDismissed(key: SegmentIntroKey): boolean {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(`${STORAGE_PREFIX}${key}`) === '1';
}

export function markIntroDismissed(key: SegmentIntroKey): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(`${STORAGE_PREFIX}${key}`, '1');
}
