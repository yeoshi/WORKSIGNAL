'use client';

import { useState } from 'react';
import { Check, X } from 'lucide-react';
import type { RoadmapWeek } from '@/app/types/shared';
import { summarizeWeekPreview } from '../lib/format';
import { WeekCard } from './WeekCard';

export interface WeekProgress {
  completed: number[];
  skipped: number[];
  customProjects: Record<number, string>;
}

export type WeekProgressUpdater = (prev: WeekProgress) => WeekProgress;

export interface RoadmapTimelineProps {
  weeks: RoadmapWeek[];
  currentWeek?: number;
  progress: WeekProgress;
  onProgressChange: (updater: WeekProgressUpdater) => void;
}

export function RoadmapTimeline({
  weeks,
  currentWeek = 1,
  progress,
  onProgressChange,
}: RoadmapTimelineProps) {
  const orderedWeeks = [...weeks].sort((a, b) => a.week - b.week);
  const [selectedWeek, setSelectedWeek] = useState(
    orderedWeeks.find((w) => w.week === currentWeek)?.week ?? orderedWeeks[0]?.week ?? 1,
  );

  const completedWeeks = new Set(progress.completed);
  const skippedWeeks = new Set(progress.skipped);

  const selected = orderedWeeks.find((w) => w.week === selectedWeek);

  function toggleComplete(weekNumber: number) {
    onProgressChange((current) => {
      const completed = new Set(current.completed);
      const skipped = new Set(current.skipped);

      if (completed.has(weekNumber)) {
        completed.delete(weekNumber);
      } else {
        completed.add(weekNumber);
        skipped.delete(weekNumber);
      }

      return {
        ...current,
        completed: [...completed],
        skipped: [...skipped],
      };
    });
  }

  function toggleSkip(weekNumber: number) {
    onProgressChange((current) => {
      const completed = new Set(current.completed);
      const skipped = new Set(current.skipped);

      if (skipped.has(weekNumber)) {
        skipped.delete(weekNumber);
      } else {
        skipped.add(weekNumber);
        completed.delete(weekNumber);
      }

      return {
        ...current,
        completed: [...completed],
        skipped: [...skipped],
      };
    });
  }

  function saveCustomProject(weekNumber: number, description: string) {
    onProgressChange((current) => ({
      ...current,
      customProjects: { ...current.customProjects, [weekNumber]: description },
    }));
  }

  return (
    <section data-testid="roadmap-timeline" aria-label="Four-week growth plan">
      <div className="relative h-[120px] w-full">
        <div className="absolute left-0 right-0 top-1/2 h-0.5 -translate-y-1/2 bg-gray-200" />

        <div className="relative flex h-full items-center justify-between">
          {orderedWeeks.map((week) => {
            const isCompleted = completedWeeks.has(week.week);
            const isSkipped = skippedWeeks.has(week.week);
            const isSelected = week.week === selectedWeek;
            const hasCustomProject = Boolean(progress.customProjects[week.week]);
            const previewLabel = hasCustomProject
              ? 'Custom Project'
              : summarizeWeekPreview(week.action);

            return (
              <div
                key={week.week}
                className="flex min-w-0 flex-1 flex-col items-center"
              >
                <p className="mb-2 line-clamp-2 max-w-[110px] text-center text-xs leading-snug text-gray-400">
                  {previewLabel}
                </p>

                <button
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  data-testid="timeline-stage"
                  data-week={week.week}
                  data-completed={isCompleted || undefined}
                  data-skipped={isSkipped || undefined}
                  onClick={() => setSelectedWeek(week.week)}
                  className={[
                    'relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 transition',
                    isCompleted
                      ? 'border-emerald-500 bg-emerald-500 text-white'
                      : isSkipped
                        ? 'border-gray-300 bg-gray-100 text-gray-400'
                        : isSelected
                          ? 'border-gray-900 bg-gray-900 shadow-md text-white'
                          : 'border-gray-200 bg-white hover:border-gray-300',
                  ].join(' ')}
                >
                  {isCompleted && <Check size={16} aria-hidden />}
                  {isSkipped && !isCompleted && <X size={16} aria-hidden />}
                </button>

                <p className="mt-2 text-xs text-gray-500">Week {week.week}</p>
              </div>
            );
          })}
        </div>
      </div>

      {selected && (
        <div data-testid="timeline-detail" className="mb-2 mt-6">
          <WeekCard
            week={selected}
            completed={completedWeeks.has(selected.week)}
            skipped={skippedWeeks.has(selected.week)}
            customProject={progress.customProjects[selected.week]}
            onToggleComplete={toggleComplete}
            onToggleSkip={toggleSkip}
            onSaveCustomProject={saveCustomProject}
          />
        </div>
      )}
    </section>
  );
}
