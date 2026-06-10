'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Archive } from 'lucide-react';
import { ConnectionCarousel } from './ConnectionCarousel';
import { NetworkCompanyTabs } from './NetworkCompanyTabs';
import { NetworkCompanyCompletion } from './NetworkCompanyCompletion';
import { NetworkCelebration } from './NetworkCelebration';
import { ArchivedConnectionsPanel } from './ArchivedConnectionsPanel';
import { fetchNetworkOnce, normalizeNetworkResponse, type NetworkData } from '../lib/fetchNetwork';
import { fireCelebrationConfetti } from '../../../lib/confetti';
import type { NetworkCardItem } from '../../dashboard/types';
import {
  connectionReachOutKey,
  isCompanyFullyReachedOut,
  loadArchivedCompanies,
  loadReachedOutChannels,
  loadReachedOutConnections,
  loadReachedOutDates,
  saveArchivedCompanies,
  saveReachedOutChannels,
  saveReachedOutConnections,
  saveReachedOutDates,
  type ReachOutChannel,
} from '../lib/networkStorage';

type CompanyLoadState =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'error' }
  | { status: 'ready'; data: NetworkData };

type ViewMode = 'active' | 'archived';

const ARCHIVE_DELAY_MS = 2500;

export interface NetworkRunCompanyPayload {
  company: string;
  application_count: number;
  suggestions: NetworkData['suggestionSet']['suggestions'];
  upcoming_events: NetworkData['suggestionSet']['upcoming_events'];
}

export interface NetworkViewProps {
  /** Company items for the horizontal pill switcher (from dashboard). */
  companyItems?: NetworkCardItem[];
  onViewPipeline?: (company: string) => void;
  onTitleActionChange?: (action: ReactNode | null) => void;
  /** Companies from a completed Network Agent run — merged without reload. */
  mergeRunCompanies?: NetworkRunCompanyPayload[] | null;
  runCompletedEmpty?: boolean;
  runError?: string | null;
}

function isCompanyActive(
  company: string,
  suggestionCount: number,
  archivedCompanies: Set<string>,
  reachedOut: Set<string>,
  suggestionNames?: string[],
  celebratingCompany: string | null = null,
): boolean {
  if (archivedCompanies.has(company)) return false;
  if (celebratingCompany === company) return true;
  return !isCompanyFullyReachedOut(
    company,
    suggestionCount,
    reachedOut,
    suggestionNames,
  );
}

export function NetworkView({
  companyItems = [],
  onViewPipeline,
  onTitleActionChange,
  mergeRunCompanies,
  runCompletedEmpty = false,
  runError,
}: NetworkViewProps) {
  const [companyStates, setCompanyStates] = useState<Record<string, CompanyLoadState>>({});
  const companyStatesRef = useRef(companyStates);
  companyStatesRef.current = companyStates;
  const allTabs = companyItems.map((item) => item.company);
  const countsByCompany = Object.fromEntries(
    companyItems.map((item) => [item.company, item.suggestion_count]),
  );
  const [selectedCompany, setSelectedCompany] = useState(
    companyItems.find((item) =>
      isCompanyActive(
        item.company,
        item.suggestion_count,
        loadArchivedCompanies(),
        loadReachedOutConnections(),
      ),
    )?.company ?? '',
  );
  const [reachedOut, setReachedOut] = useState(loadReachedOutConnections);
  const [reachedOutDates, setReachedOutDates] = useState(loadReachedOutDates);
  const [reachedOutChannels, setReachedOutChannels] = useState(loadReachedOutChannels);
  const [archivedCompanies, setArchivedCompanies] = useState(loadArchivedCompanies);
  const [viewMode, setViewMode] = useState<ViewMode>('active');
  const [selectedArchived, setSelectedArchived] = useState<string | null>(null);
  const [celebratingCompany, setCelebratingCompany] = useState<string | null>(null);
  const archiveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeTabs = allTabs.filter((company) =>
    isCompanyActive(
      company,
      countsByCompany[company] ?? 0,
      archivedCompanies,
      reachedOut,
      undefined,
      celebratingCompany,
    ),
  );
  const archivedList = allTabs.filter((company) => archivedCompanies.has(company));

  const activeCompany = selectedCompany || activeTabs[0] || '';
  const archivedCompany = selectedArchived || archivedList[0] || '';

  const activeState =
    viewMode === 'active' && activeCompany
      ? companyStates[activeCompany]
      : undefined;

  useEffect(() => {
    if (!mergeRunCompanies || mergeRunCompanies.length === 0) return;

    setCompanyStates((prev) => {
      const next = { ...prev };
      for (const row of mergeRunCompanies) {
        const normalized = normalizeNetworkResponse({
          company: row.company,
          application_count: row.application_count,
          suggestions: row.suggestions,
          upcoming_events: row.upcoming_events,
        });
        if (normalized) {
          next[row.company] = { status: 'ready', data: normalized };
        }
      }
      return next;
    });

    if (!selectedCompany && mergeRunCompanies[0]) {
      setSelectedCompany(mergeRunCompanies[0].company);
    }
  }, [mergeRunCompanies, selectedCompany]);

  useEffect(() => {
    return () => {
      if (archiveTimerRef.current) clearTimeout(archiveTimerRef.current);
    };
  }, []);

  useEffect(() => {
    saveArchivedCompanies(archivedCompanies);
  }, [archivedCompanies]);

  useEffect(() => {
    if (archivedList.length > 0 && !selectedArchived) {
      setSelectedArchived(archivedList[0]!);
    }
  }, [archivedList, selectedArchived]);

  useEffect(() => {
    if (activeTabs.length > 0 && selectedCompany && !activeTabs.includes(selectedCompany)) {
      setSelectedCompany(activeTabs[0]!);
      setViewMode('active');
    }
  }, [activeTabs, selectedCompany]);

  useEffect(() => {
    onTitleActionChange?.(
      <button
        type="button"
        data-testid="network-archive-tab"
        onClick={() => setViewMode((mode) => (mode === 'archived' ? 'active' : 'archived'))}
        className={[
          'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition',
          viewMode === 'archived'
            ? 'border-gray-900 bg-gray-900 text-white'
            : 'border-gray-200 text-gray-500 hover:bg-gray-50',
        ].join(' ')}
      >
        <Archive size={12} aria-hidden />
        Archive
        {archivedList.length > 0 && (
          <span
            data-testid="network-archive-count"
            className={[
              'rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none',
              viewMode === 'archived' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600',
            ].join(' ')}
          >
            {archivedList.length}
          </span>
        )}
      </button>,
    );

    return () => onTitleActionChange?.(null);
  }, [viewMode, archivedList.length, onTitleActionChange]);

  useEffect(() => {
    if (viewMode !== 'active' || !activeCompany) return;
    const existing = companyStatesRef.current[activeCompany];
    if (existing && existing.status !== 'error') return;

    const controller = new AbortController();
    let alive = true;

    setCompanyStates((prev) => ({ ...prev, [activeCompany]: { status: 'loading' } }));

    fetchNetworkOnce(controller.signal, activeCompany)
      .then((data) => {
        if (!alive) return;
        setCompanyStates((prev) => ({
          ...prev,
          [activeCompany]: data ? { status: 'ready', data } : { status: 'empty' },
        }));
        if (!selectedCompany && data) {
          setSelectedCompany(data.company);
        }
      })
      .catch((error) => {
        if (!alive || (error instanceof DOMException && error.name === 'AbortError')) {
          return;
        }
        setCompanyStates((prev) => ({ ...prev, [activeCompany]: { status: 'error' } }));
      });

    return () => {
      alive = false;
      controller.abort();
    };
  }, [activeCompany, selectedCompany, viewMode]);

  function beginCelebration(
    company: string,
    suggestions: { name: string }[],
  ) {
    setCelebratingCompany(company);
    fireCelebrationConfetti();
    scheduleArchive(company, suggestions);
  }

  function markReachedOut(name: string, channel?: ReachOutChannel) {
    const company = activeCompany;
    if (!company) return;

    const key = connectionReachOutKey(company, name);
    const today = new Date().toISOString();

    const suggestions =
      activeState?.status === 'ready'
        ? activeState.data.suggestionSet.suggestions
        : [];
    const names = suggestions.map((s) => s.name);
    const count = suggestions.length;
    const wasComplete = isCompanyFullyReachedOut(
      company,
      count,
      reachedOut,
      names,
    );
    const nextReachedOut = new Set([...reachedOut, key]);
    const isComplete = isCompanyFullyReachedOut(
      company,
      count,
      nextReachedOut,
      names,
    );

    setReachedOut((prev) => {
      const next = new Set([...prev, key]);
      saveReachedOutConnections(next);
      return next;
    });

    setReachedOutDates((prev) => {
      const next = { ...prev, [key]: prev[key] ?? today };
      saveReachedOutDates(next);
      return next;
    });

    if (channel) {
      setReachedOutChannels((prev) => {
        const next = { ...prev, [key]: channel };
        saveReachedOutChannels(next);
        return next;
      });
    }

    if (
      !wasComplete &&
      isComplete &&
      !archivedCompanies.has(company) &&
      celebratingCompany !== company
    ) {
      beginCelebration(company, suggestions);
    }
  }

  function unmarkReachedOut(name: string) {
    const company = activeCompany;
    if (!company) return;

    const key = connectionReachOutKey(company, name);

    if (archiveTimerRef.current) {
      clearTimeout(archiveTimerRef.current);
      archiveTimerRef.current = null;
    }

    setCelebratingCompany((current) => (current === company ? null : current));

    setReachedOut((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      saveReachedOutConnections(next);
      return next;
    });

    setReachedOutDates((prev) => {
      const next = { ...prev };
      delete next[key];
      saveReachedOutDates(next);
      return next;
    });

    setReachedOutChannels((prev) => {
      const next = { ...prev };
      delete next[key];
      saveReachedOutChannels(next);
      return next;
    });
  }

  function archiveCompany(company: string) {
    setCelebratingCompany((current) => (current === company ? null : current));
    setArchivedCompanies((prev) => new Set([...prev, company]));
    setSelectedArchived(company);
    setViewMode('active');

    const remaining = allTabs.filter((c) => {
      if (c === company) return false;
      return isCompanyActive(
        c,
        countsByCompany[c] ?? 0,
        new Set([...archivedCompanies, company]),
        reachedOut,
      );
    });
    setSelectedCompany(remaining[0] ?? '');
  }

  function scheduleArchive(company: string, suggestions: { name: string }[]) {
    if (archiveTimerRef.current) clearTimeout(archiveTimerRef.current);

    archiveTimerRef.current = setTimeout(() => {
      const currentReachedOut = loadReachedOutConnections();
      if (
        isCompanyFullyReachedOut(
          company,
          suggestions.length,
          currentReachedOut,
          suggestions.map((s) => s.name),
        )
      ) {
        archiveCompany(company);
      }
      archiveTimerRef.current = null;
    }, ARCHIVE_DELAY_MS);
  }

  const readySuggestions =
    activeState?.status === 'ready' ? activeState.data.suggestionSet.suggestions : [];

  const allReachedOut =
    viewMode === 'active' &&
    activeState?.status === 'ready' &&
    isCompanyFullyReachedOut(
      activeCompany,
      readySuggestions.length,
      reachedOut,
      readySuggestions.map((s) => s.name),
    );

  const reachedOutSnapshot = [...reachedOut].sort().join('|');
  const suggestionNamesKey = readySuggestions.map((s) => s.name).join('|');
  const isActiveCompanyArchived = archivedCompanies.has(activeCompany);

  useEffect(() => {
    if (!allReachedOut || isActiveCompanyArchived) {
      if (archiveTimerRef.current) {
        clearTimeout(archiveTimerRef.current);
        archiveTimerRef.current = null;
      }
      return;
    }

    if (celebratingCompany) {
      return;
    }

    scheduleArchive(activeCompany, readySuggestions);

    return () => {
      if (archiveTimerRef.current) {
        clearTimeout(archiveTimerRef.current);
        archiveTimerRef.current = null;
      }
    };
  }, [
    allReachedOut,
    activeCompany,
    isActiveCompanyArchived,
    celebratingCompany,
    suggestionNamesKey,
    reachedOutSnapshot,
  ]);

  function renderActiveTabs() {
    if (activeTabs.length === 0) return null;

    return (
      <NetworkCompanyTabs
        data-testid="network-company-tabs"
        options={activeTabs.map((company) => {
          const state = companyStates[company];
          const suggestions =
            state?.status === 'ready' ? state.data.suggestionSet.suggestions : [];
          const completed =
            suggestions.length > 0 &&
            isCompanyFullyReachedOut(
              company,
              suggestions.length,
              reachedOut,
              suggestions.map((s) => s.name),
            );

          return { id: company, label: company, completed };
        })}
        value={activeCompany}
        onChange={(company) => {
          setViewMode('active');
          setSelectedCompany(company);
        }}
      />
    );
  }

  if (viewMode === 'active' && activeTabs.length === 0 && allTabs.length > 0) {
    return (
      <div
        data-testid="network-all-complete"
        className="flex flex-col items-center gap-2 rounded-card border border-emerald-200 bg-emerald-50 p-10 text-center"
      >
        <h2 className="text-xl font-semibold text-gray-900">
          All caught up!
        </h2>
        <p className="max-w-md text-sm text-gray-600">
          You&apos;ve reached out to every connection. Open Archive to review
          past outreach.
        </p>
      </div>
    );
  }

  if (viewMode === 'archived') {
    if (archivedList.length === 0) {
      return (
        <div
          data-testid="network-archive-empty"
          className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-8 py-12 text-center"
        >
          <Archive size={28} className="text-gray-300" aria-hidden />
          <h3 className="text-sm font-semibold text-gray-700">No archived companies yet</h3>
          <p className="max-w-sm text-sm text-gray-500">
            When you reach out to every connection at a company, it will appear here automatically.
          </p>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-4">
        <NetworkCompanyTabs
          data-testid="network-archived-tabs"
          options={archivedList.map((company) => ({
            id: company,
            label: company,
            completed: true,
          }))}
          value={archivedCompany}
          onChange={setSelectedArchived}
        />
        <ArchivedConnectionsPanel
          company={archivedCompany}
          reachedOutDates={reachedOutDates}
          reachedOutChannels={reachedOutChannels}
        />
      </div>
    );
  }

  if (!activeCompany && allTabs.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {runError ? (
          <div
            data-testid="network-run-error-banner"
            className="rounded-card border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
          >
            {runError}
          </div>
        ) : null}
        {runCompletedEmpty ? (
          <div
            data-testid="network-run-empty-banner"
            className="rounded-card border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          >
            No sent applications yet — mark jobs as sent from the pipeline first,
            then run the Network Agent again.
          </div>
        ) : null}
        <div
          data-testid="network-empty"
          className="flex flex-col items-center gap-2 rounded-card border border-dashed border-ws-line bg-ws-paper p-10 text-center"
        >
          <h2 className="text-xl font-semibold text-ws-ink">No companies yet</h2>
          <p className="max-w-md text-sm text-ws-muted">
            Mark jobs as sent from Needs Decision or Pending Send, then run the
            Network Agent to surface connection suggestions.
          </p>
        </div>
      </div>
    );
  }

  if (!activeState || activeState.status === 'loading') {
    return (
      <div className="flex flex-col gap-4">
        {renderActiveTabs()}
        <div data-testid="network-loading" className="flex flex-col gap-4" aria-busy="true">
          <div className="h-20 w-full animate-pulse rounded bg-ws-line/60" />
          <div className="h-44 w-full animate-pulse rounded bg-ws-line/40" />
        </div>
      </div>
    );
  }

  if (activeState.status === 'empty') {
    return (
      <div className="flex flex-col gap-4">
        {runError ? (
          <div
            data-testid="network-run-error-banner"
            className="rounded-card border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
          >
            {runError}
          </div>
        ) : null}
        {renderActiveTabs()}
        <div
          data-testid="network-empty"
          className="flex flex-col items-center gap-2 rounded-card border border-dashed border-ws-line bg-ws-paper p-10 text-center"
        >
          <h2 className="text-xl font-semibold text-ws-ink">No network suggestions yet</h2>
          <p className="max-w-md text-sm text-ws-muted">
            Run the Network Agent to research connections and draft outreach for
            your target companies.
          </p>
        </div>
      </div>
    );
  }

  if (activeState.status === 'error') {
    return (
      <div className="flex flex-col gap-4">
        {renderActiveTabs()}
        <div
          data-testid="network-error"
          className="rounded-card border border-rose-200 bg-rose-50 p-8 text-center"
        >
          <p className="text-sm text-rose-700">Could not load network suggestions.</p>
        </div>
      </div>
    );
  }

  const { suggestionSet } = activeState.data;

  return (
    <div className="flex flex-col gap-4">
      {runError ? (
        <div
          data-testid="network-run-error-banner"
          className="rounded-card border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          {runError}
        </div>
      ) : null}
      {celebratingCompany && (
        <NetworkCelebration company={celebratingCompany} />
      )}
      {renderActiveTabs()}

      {allReachedOut ? (
        <NetworkCompanyCompletion
          company={activeCompany}
          suggestions={suggestionSet.suggestions}
          reachedOutDates={reachedOutDates}
          onViewPipeline={() => onViewPipeline?.(activeCompany)}
        />
      ) : null}

      {(!allReachedOut || celebratingCompany) && (
        <>
          {!allReachedOut ? (
            <p data-testid="network-summary" className="text-sm text-gray-500">
              {suggestionSet.suggestions.length} connection
              {suggestionSet.suggestions.length === 1 ? '' : 's'} ·{' '}
              {activeState.data.application_count} application
              {activeState.data.application_count === 1 ? '' : 's'} sent
            </p>
          ) : null}

          {suggestionSet.suggestions.length > 0 && (
            <ConnectionCarousel
              suggestions={suggestionSet.suggestions}
              company={activeCompany}
              reachedOut={reachedOut}
              reachedOutChannels={reachedOutChannels}
              reachedOutDates={reachedOutDates}
              onReachOut={markReachedOut}
              onUndoReachOut={unmarkReachedOut}
            />
          )}
        </>
      )}
    </div>
  );
}
