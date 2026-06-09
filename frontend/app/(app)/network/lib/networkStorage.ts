import type { NetworkCardItem } from '../../dashboard/types';
import { formatShortDate } from '../../../lib/formatDate';

const REACHED_OUT_KEY = 'worksignal:network-reached-out';
const REACHED_OUT_DATES_KEY = 'worksignal:network-reached-out-dates';
const REACHED_OUT_CHANNELS_KEY = 'worksignal:network-reached-out-channels';
const ARCHIVED_COMPANIES_KEY = 'worksignal:network-archived-companies';

export type ReachOutChannel = 'linkedin' | 'email';

export function connectionReachOutKey(company: string, name: string): string {
  return `${company}::${name}`;
}

export function loadReachedOutConnections(): Set<string> {
  if (typeof window === 'undefined') return new Set();

  try {
    const raw = window.localStorage.getItem(REACHED_OUT_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((s): s is string => typeof s === 'string'));
  } catch {
    return new Set();
  }
}

function notifyNetworkStateChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('worksignal:network-state-changed'));
}

export function saveReachedOutConnections(keys: Set<string>): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(REACHED_OUT_KEY, JSON.stringify([...keys]));
  notifyNetworkStateChanged();
}

export function loadReachedOutDates(): Record<string, string> {
  if (typeof window === 'undefined') return {};

  try {
    const raw = window.localStorage.getItem(REACHED_OUT_DATES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Record<string, string>;
  } catch {
    return {};
  }
}

export function saveReachedOutDates(dates: Record<string, string>): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(REACHED_OUT_DATES_KEY, JSON.stringify(dates));
  notifyNetworkStateChanged();
}

export function loadReachedOutChannels(): Record<string, ReachOutChannel> {
  if (typeof window === 'undefined') return {};

  try {
    const raw = window.localStorage.getItem(REACHED_OUT_CHANNELS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        (entry): entry is [string, ReachOutChannel] =>
          entry[1] === 'linkedin' || entry[1] === 'email',
      ),
    );
  } catch {
    return {};
  }
}

export function saveReachedOutChannels(channels: Record<string, ReachOutChannel>): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(REACHED_OUT_CHANNELS_KEY, JSON.stringify(channels));
  notifyNetworkStateChanged();
}

export function formatReachOutStatus(
  date: string | undefined,
  channel: ReachOutChannel | undefined,
): string {
  const formattedDate = formatShortDate(date);
  const hasDate = formattedDate !== '—';

  if (channel === 'linkedin') {
    return hasDate
      ? `Reached out on LinkedIn · ${formattedDate}`
      : 'Reached out on LinkedIn';
  }

  if (channel === 'email') {
    return hasDate
      ? `Reached out via email · ${formattedDate}`
      : 'Reached out via email';
  }

  return hasDate ? `Reached out on ${formattedDate}` : 'Reached out';
}

export function loadArchivedCompanies(): Set<string> {
  if (typeof window === 'undefined') return new Set();

  try {
    const raw = window.localStorage.getItem(ARCHIVED_COMPANIES_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((s): s is string => typeof s === 'string'));
  } catch {
    return new Set();
  }
}

export function saveArchivedCompanies(companies: Set<string>): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ARCHIVED_COMPANIES_KEY, JSON.stringify([...companies]));
  notifyNetworkStateChanged();
}

export function countReachedOutForCompany(
  company: string,
  reachedOut: Set<string>,
): number {
  const prefix = `${company}::`;
  return [...reachedOut].filter((key) => key.startsWith(prefix)).length;
}

export function isCompanyFullyReachedOut(
  company: string,
  suggestionCount: number,
  reachedOut: Set<string>,
  suggestionNames?: string[],
): boolean {
  if (suggestionCount <= 0) return false;

  if (suggestionNames && suggestionNames.length > 0) {
    return suggestionNames.every((name) =>
      reachedOut.has(connectionReachOutKey(company, name)),
    );
  }

  return countReachedOutForCompany(company, reachedOut) >= suggestionCount;
}

export function getActiveNetworkItems(items: NetworkCardItem[]): NetworkCardItem[] {
  const reachedOut = loadReachedOutConnections();
  const archived = loadArchivedCompanies();

  return items.filter(
    (item) =>
      !archived.has(item.company) &&
      !isCompanyFullyReachedOut(item.company, item.suggestion_count, reachedOut),
  );
}

export function areAllNetworkCompaniesComplete(items: NetworkCardItem[]): boolean {
  return items.length > 0 && getActiveNetworkItems(items).length === 0;
}

export function getNetworkCardSubtext(items: NetworkCardItem[]): string {
  if (items.length === 0) return 'No suggestions';

  if (areAllNetworkCompaniesComplete(items)) {
    return 'All connections reached out';
  }

  const activeItems = getActiveNetworkItems(items);
  const totalConnections = activeItems.reduce(
    (sum, item) => sum + item.suggestion_count,
    0,
  );

  return `${activeItems.length} ${activeItems.length === 1 ? 'company' : 'companies'} · ${totalConnections} connection${totalConnections === 1 ? '' : 's'}`;
}

export function hasAnyCompletedCompany(items: NetworkCardItem[]): boolean {
  const reachedOut = loadReachedOutConnections();
  return items.some((item) =>
    isCompanyFullyReachedOut(item.company, item.suggestion_count, reachedOut),
  );
}
