'use client';

import { useState } from 'react';
import {
  Award,
  BookOpen,
  CalendarDays,
  CheckCircle,
  ExternalLink,
  Hammer,
} from 'lucide-react';
import type { RoadmapResourceType, RoadmapWeek } from '@worksignal/shared';
import { formatWeekMetadataStrip } from '../lib/format';

const TYPE_ICON_CONFIG: Record<
  RoadmapResourceType,
  { Icon: typeof BookOpen; className: string }
> = {
  course: { Icon: BookOpen, className: 'bg-blue-50 text-blue-500' },
  project: { Icon: Hammer, className: 'bg-violet-50 text-violet-500' },
  certification: { Icon: Award, className: 'bg-amber-50 text-amber-500' },
  event: { Icon: CalendarDays, className: 'bg-gray-100 text-gray-500' },
};

export interface WeekCardProps {
  week: RoadmapWeek;
  completed?: boolean;
  skipped?: boolean;
  customProject?: string;
  onToggleComplete?: (week: number) => void;
  onToggleSkip?: (week: number) => void;
  onSaveCustomProject?: (week: number, description: string) => void;
}

export function WeekCard({
  week,
  completed = false,
  skipped = false,
  customProject,
  onToggleComplete,
  onToggleSkip,
  onSaveCustomProject,
}: WeekCardProps) {
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customDraft, setCustomDraft] = useState('');

  const { Icon, className: iconClassName } =
    TYPE_ICON_CONFIG[week.type] ?? TYPE_ICON_CONFIG.course;

  const displayTitle = customProject
    ? `[Custom] ${customProject}`
    : week.action;

  function handleSaveCustom() {
    const trimmed = customDraft.trim();
    if (!trimmed) return;
    onSaveCustomProject?.(week.week, trimmed);
    setShowCustomInput(false);
    setCustomDraft('');
  }

  return (
    <article
      data-testid="week-card"
      data-week={week.week}
      className={[
        'rounded-xl border p-5 transition-colors',
        completed
          ? 'border-emerald-200 bg-emerald-50'
          : 'border-gray-200 bg-white',
      ].join(' ')}
    >
      <div className="flex items-start gap-3">
        <div
          data-testid="week-type-badge"
          data-resource-type={week.type}
          className={[
            'flex h-12 w-12 shrink-0 items-center justify-center rounded-lg',
            iconClassName,
          ].join(' ')}
        >
          <Icon size={22} aria-hidden />
        </div>
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <p
            data-testid="week-action"
            className="flex-1 text-sm font-semibold leading-snug text-gray-900"
          >
            {displayTitle}
          </p>
          {customProject && (
            <span
              data-testid="week-custom-badge"
              className="shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-600"
            >
              Custom
            </span>
          )}
        </div>
      </div>

      <div className="mt-3">
        <span
          data-testid="week-metadata"
          className="inline-flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500"
        >
          {formatWeekMetadataStrip(week.cost, week.time_hours, week.type)}
        </span>
      </div>

      <div className="mt-3 flex flex-row flex-wrap items-center gap-2">
        <a
          data-testid="week-resource-link"
          href={week.resource_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-50"
        >
          Open resource
          <ExternalLink size={14} aria-hidden className="text-gray-500" />
        </a>
        {week.type === 'project' && !customProject && (
          <button
            type="button"
            data-testid="week-custom-project-button"
            onClick={() => setShowCustomInput(true)}
            className="text-sm text-indigo-600 underline-offset-2 hover:text-indigo-700 hover:underline"
          >
            Use my own project
          </button>
        )}
      </div>

      {showCustomInput && (
        <div className="mt-3 flex gap-2">
          <input
            type="text"
            data-testid="week-custom-input"
            value={customDraft}
            onChange={(e) => setCustomDraft(e.target.value)}
            placeholder="Describe your project..."
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400"
          />
          <button
            type="button"
            data-testid="week-custom-save"
            onClick={handleSaveCustom}
            className="shrink-0 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Save
          </button>
        </div>
      )}

      <div className="mt-3 flex items-start justify-between gap-4 border-t border-gray-100 pt-3">
        <div className="flex flex-col">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              data-testid="week-complete-checkbox"
              checked={completed}
              disabled={skipped}
              onChange={() => onToggleComplete?.(week.week)}
              className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
            />
            Mark Week {week.week} as complete
          </label>
          {completed && (
            <p
              data-testid="week-complete-message"
              className="mt-1 flex items-center gap-1 text-xs text-emerald-600"
            >
              <CheckCircle size={12} aria-hidden />
              Added to your resume profile
            </p>
          )}
        </div>
        {skipped ? (
          <button
            type="button"
            data-testid="week-skip-button"
            onClick={() => onToggleSkip?.(week.week)}
            className="shrink-0 text-xs text-gray-400 transition hover:text-gray-600"
          >
            Undo skip
          </button>
        ) : (
          <button
            type="button"
            data-testid="week-skip-button"
            onClick={() => onToggleSkip?.(week.week)}
            className="shrink-0 text-xs text-gray-400 transition hover:text-gray-600"
          >
            Skip
          </button>
        )}
      </div>
    </article>
  );
}
