import { Archive, CheckCircle2 } from 'lucide-react';

export interface ArchivedRoadmapsPanelProps {
  skills: string[];
}

export function ArchivedRoadmapsPanel({ skills }: ArchivedRoadmapsPanelProps) {
  if (skills.length === 0) {
    return (
      <div
        data-testid="growth-archive-empty"
        className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-8 py-12 text-center"
      >
        <Archive size={28} className="text-gray-300" aria-hidden />
        <h3 className="text-sm font-semibold text-gray-700">No completed roadmaps yet</h3>
        <p className="max-w-sm text-sm text-gray-500">
          When you finish a growth plan, it will appear here automatically.
        </p>
      </div>
    );
  }

  return (
    <div data-testid="growth-archive-panel">
      <p className="mb-4 text-sm text-gray-500">
        {skills.length} completed roadmap{skills.length === 1 ? '' : 's'}
      </p>
      <ul className="flex flex-col gap-2">
        {skills.map((skill) => (
          <li
            key={skill}
            data-testid="growth-archived-skill"
            className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3"
          >
            <CheckCircle2 size={18} className="shrink-0 text-emerald-500" aria-hidden />
            <span className="text-sm font-medium text-gray-600">{skill}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
