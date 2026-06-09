'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Archive } from 'lucide-react';
import { SkillGapHeader } from './SkillGapHeader';
import {
  RoadmapTimeline,
  type WeekProgress,
  type WeekProgressUpdater,
} from './RoadmapTimeline';
import { RoadmapCelebration } from './RoadmapCelebration';
import { ArchivedRoadmapsPanel } from './ArchivedRoadmapsPanel';
import { RelatedEventsSection } from './RelatedEventsSection';
import { PillTabs } from '../../../components/ui/PillTabs';
import { fetchGrowthAll, type GrowthRoadmap } from '../lib/fetchGrowth';
import { fireCelebrationConfetti } from '../../../lib/confetti';
import {
  isSkillResolved,
  loadArchivedSkills,
  loadProgressBySkill,
  saveArchivedSkills,
  saveProgressBySkill,
} from '../lib/growthStorage';

export { isSkillResolved };

type LoadState =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'error' }
  | { status: 'ready'; data: GrowthRoadmap[] };

type ViewMode = 'active' | 'archived';

const EMPTY_PROGRESS: WeekProgress = {
  completed: [],
  skipped: [],
  customProjects: {},
};

const ARCHIVE_DELAY_MS = 2500;

export interface GrowthViewProps {
  onTitleActionChange?: (action: ReactNode | null) => void;
}

function isActiveSkill(
  roadmap: GrowthRoadmap,
  archivedSkills: Set<string>,
  progressBySkill: Record<string, WeekProgress>,
  celebratingSkill: string | null = null,
): boolean {
  if (archivedSkills.has(roadmap.skill)) return false;
  if (celebratingSkill === roadmap.skill) return true;
  const progress = progressBySkill[roadmap.skill] ?? EMPTY_PROGRESS;
  return !isSkillResolved(roadmap.roadmap.weeks, progress);
}

function firstActiveSkill(
  data: GrowthRoadmap[],
  archived: Set<string>,
  progressBySkill: Record<string, WeekProgress>,
): string {
  return data.find((r) => isActiveSkill(r, archived, progressBySkill))?.skill ?? '';
}

export function GrowthView({ onTitleActionChange }: GrowthViewProps = {}) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [selectedSkill, setSelectedSkill] = useState('');
  const [progressBySkill, setProgressBySkill] = useState(loadProgressBySkill);
  const [archivedSkills, setArchivedSkills] = useState(loadArchivedSkills);
  const [viewMode, setViewMode] = useState<ViewMode>('active');
  const [celebratingSkill, setCelebratingSkill] = useState<string | null>(null);
  const archiveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressBySkillRef = useRef(progressBySkill);
  progressBySkillRef.current = progressBySkill;

  useEffect(() => {
    return () => {
      if (archiveTimerRef.current) clearTimeout(archiveTimerRef.current);
    };
  }, []);

  useEffect(() => {
    saveArchivedSkills(archivedSkills);
  }, [archivedSkills]);

  useEffect(() => {
    saveProgressBySkill(progressBySkill);
  }, [progressBySkill]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    fetchGrowthAll(controller.signal)
      .then((data) => {
        if (!active) return;
        if (data.length === 0) {
          setState({ status: 'empty' });
        } else {
          const archived = loadArchivedSkills();
          const progress = loadProgressBySkill();
          setState({ status: 'ready', data });
          setSelectedSkill(firstActiveSkill(data, archived, progress));
        }
      })
      .catch((error) => {
        if (!active || (error instanceof DOMException && error.name === 'AbortError')) return;
        setState({ status: 'error' });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const readyData = state.status === 'ready' ? state.data : [];
  const activeTabs = readyData
    .filter((r) => isActiveSkill(r, archivedSkills, progressBySkill, celebratingSkill))
    .map((r) => r.skill);
  const archivedList = readyData
    .map((r) => r.skill)
    .filter((skill) => archivedSkills.has(skill));

  const activeRoadmap =
    state.status === 'ready' && viewMode === 'active'
      ? readyData.find(
          (r) =>
            r.skill === selectedSkill &&
            isActiveSkill(r, archivedSkills, progressBySkill, celebratingSkill),
        )
        ?? readyData.find((r) =>
          isActiveSkill(r, archivedSkills, progressBySkill, celebratingSkill),
        )
        ?? null
      : null;

  const activeProgress =
    activeRoadmap != null
      ? (progressBySkill[activeRoadmap.skill] ?? EMPTY_PROGRESS)
      : EMPTY_PROGRESS;

  useEffect(() => {
    if (!onTitleActionChange || state.status !== 'ready') {
      onTitleActionChange?.(null);
      return;
    }

    onTitleActionChange(
      <button
        type="button"
        data-testid="growth-archive-tab"
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
            data-testid="growth-archive-count"
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

    return () => onTitleActionChange(null);
  }, [state, viewMode, archivedList.length, onTitleActionChange]);

  function archiveSkill(skill: string) {
    setArchivedSkills((prev) => new Set([...prev, skill]));
    setViewMode('active');

    const remaining = readyData.filter(
      (r) =>
        r.skill !== skill &&
        isActiveSkill(
          r,
          new Set([...archivedSkills, skill]),
          progressBySkillRef.current,
          null,
        ),
    );
    setSelectedSkill(remaining[0]?.skill ?? '');
  }

  function beginCelebration(skill: string) {
    setCelebratingSkill(skill);
    fireCelebrationConfetti();

    if (archiveTimerRef.current) clearTimeout(archiveTimerRef.current);
    archiveTimerRef.current = setTimeout(() => {
      archiveSkill(skill);
      setCelebratingSkill((current) => (current === skill ? null : current));
      archiveTimerRef.current = null;
    }, ARCHIVE_DELAY_MS);
  }

  function handleProgressChange(updater: WeekProgressUpdater) {
    if (!activeRoadmap) return;

    const skill = activeRoadmap.skill;
    const weeks = activeRoadmap.roadmap.weeks;

    setProgressBySkill((prev) => {
      const previous = prev[skill] ?? EMPTY_PROGRESS;
      const progress = updater(previous);
      const justResolved =
        !isSkillResolved(weeks, previous) && isSkillResolved(weeks, progress);

      if (justResolved && !archivedSkills.has(skill) && celebratingSkill !== skill) {
        beginCelebration(skill);
      }

      const next = { ...prev, [skill]: progress };
      progressBySkillRef.current = next;
      return next;
    });
  }

  if (state.status === 'loading') {
    return (
      <div data-testid="growth-loading" className="flex flex-col gap-4" aria-busy="true">
        <div className="h-8 w-48 animate-pulse rounded bg-ws-line" />
        <div className="h-24 w-full animate-pulse rounded bg-ws-line/60" />
      </div>
    );
  }

  if (state.status === 'empty') {
    return (
      <div
        data-testid="growth-empty"
        className="flex flex-col items-center gap-2 rounded-card border border-dashed border-ws-line bg-ws-paper p-10 text-center"
      >
        <h2 className="text-xl font-semibold text-ws-ink">No roadmap yet</h2>
        <p className="max-w-md text-sm text-ws-muted">
          Once the same skill gap is flagged across several jobs, Work Signal
          will build a four-week growth roadmap for you.
        </p>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div
        data-testid="growth-error"
        className="rounded-card border border-rose-200 bg-rose-50 p-8 text-center"
      >
        <p className="text-sm text-rose-700">Could not load your roadmap.</p>
      </div>
    );
  }

  if (viewMode === 'archived') {
    return <ArchivedRoadmapsPanel skills={archivedList} />;
  }

  if (!activeRoadmap) {
    return (
      <div
        data-testid="growth-all-complete"
        className="flex flex-col items-center gap-2 rounded-card border border-emerald-200 bg-emerald-50 p-10 text-center"
      >
        <h2 className="text-xl font-semibold text-gray-900">
          Nice job! Let&apos;s get you more callbacks!
        </h2>
        <p className="max-w-md text-sm text-gray-600">
          All your growth roadmaps are complete. Open Archive to review them anytime.
        </p>
      </div>
    );
  }

  return (
    <>
      {celebratingSkill && <RoadmapCelebration skill={celebratingSkill} />}

      {activeTabs.length > 0 && (
        <PillTabs
          data-testid="growth-skill-tabs"
          className="mb-6"
          options={activeTabs.map((skill) => ({ id: skill, label: skill }))}
          value={activeRoadmap.skill}
          onChange={setSelectedSkill}
        />
      )}

      <SkillGapHeader
        projectedMatchImprovement={activeRoadmap.roadmap.projected_match_improvement}
        timesFlagged={activeRoadmap.times_flagged}
      />

      <RoadmapTimeline
        weeks={activeRoadmap.roadmap.weeks}
        progress={activeProgress}
        onProgressChange={handleProgressChange}
      />

      <RelatedEventsSection events={activeRoadmap.roadmap.networking_opportunities} />
    </>
  );
}
