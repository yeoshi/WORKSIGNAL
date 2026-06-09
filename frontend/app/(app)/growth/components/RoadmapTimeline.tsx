'use client';

import { useState } from 'react';
import type { RoadmapWeek } from '@worksignal/shared';
import { WeekCard } from './WeekCard';

export interface RoadmapTimelineProps {
  weeks: RoadmapWeek[];
  /** Current week for progress fill (1–4). Defaults to 1. */
  currentWeek?: number;
}

export function RoadmapTimeline({
  weeks,
  currentWeek = 1,
}: RoadmapTimelineProps) {
  const orderedWeeks = [...weeks].sort((a, b) => a.week - b.week);
  const [selectedWeek, setSelectedWeek] = useState(
    orderedWeeks[0]?.week ?? 1,
  );
  const progress = Math.min(100, (currentWeek / 4) * 100);
  const selected = orderedWeeks.find((w) => w.week === selectedWeek);

  return (
    <section data-testid="roadmap-timeline" aria-label="Four-week growth plan">
      <h2 className="ws-section-label">Four-week plan</h2>

      <div className="relative mb-8 mt-6">
        <div className="h-3 overflow-hidden rounded-full bg-ws-dark/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-ws-teal via-ws-teal-mid to-ws-teal-deep"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-4 grid grid-cols-4 gap-2">
          {orderedWeeks.map((week) => (
            <button
              key={week.week}
              type="button"
              data-testid="timeline-stage"
              data-week={week.week}
              onClick={() => setSelectedWeek(week.week)}
              className={[
                'flex flex-col items-center gap-1 rounded-lg px-2 py-2 text-center transition',
                selectedWeek === week.week
                  ? 'bg-ws-teal/15 ring-1 ring-ws-teal/40'
                  : 'hover:bg-ws-paper',
              ].join(' ')}
            >
              <span className="font-mono text-[10px] uppercase tracking-widest text-ws-teal-mid">
                Week {week.week}
              </span>
              <span className="line-clamp-2 text-xs text-ws-muted">
                {week.action}
              </span>
            </button>
          ))}
        </div>
      </div>

      {selected && (
        <div data-testid="timeline-detail">
          <WeekCard week={selected} />
        </div>
      )}
    </section>
  );
}
