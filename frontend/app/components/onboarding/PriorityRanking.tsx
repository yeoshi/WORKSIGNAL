'use client';

import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
} from '@hello-pangea/dnd';
import type { PriorityFactor } from '@worksignal/shared';
import { GripVertical } from 'lucide-react';
import { priorityFactorLabel } from '../../onboarding/validation';

function reorder(
  list: PriorityFactor[],
  from: number,
  to: number,
): PriorityFactor[] {
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export function PriorityRanking({
  ranking,
  onChange,
}: {
  ranking: PriorityFactor[];
  onChange: (ranking: PriorityFactor[]) => void;
}) {
  function onDragEnd(result: DropResult) {
    const { destination, source } = result;
    if (!destination || destination.index === source.index) return;
    onChange(reorder(ranking, source.index, destination.index));
  }

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <Droppable droppableId="priority-ranking">
        {(droppable) => (
          <ol
            ref={droppable.innerRef}
            {...droppable.droppableProps}
            className="flex flex-col gap-2"
          >
            {ranking.map((factor, index) => (
              <Draggable key={factor} draggableId={factor} index={index}>
                {(draggable, snapshot) => (
                  <li
                    ref={draggable.innerRef}
                    {...draggable.draggableProps}
                    className={`flex items-center gap-3 rounded-xl border bg-ws-card px-3 py-2 transition-shadow ${
                      snapshot.isDragging
                        ? 'border-ws-teal/40 shadow-md'
                        : 'border-ws-line'
                    }`}
                  >
                    <button
                      type="button"
                      {...draggable.dragHandleProps}
                      aria-label={`Drag to reorder ${priorityFactorLabel(factor)}`}
                      className="flex shrink-0 cursor-grab touch-none items-center rounded-md p-1 text-ws-muted hover:bg-ws-paper hover:text-ws-ink active:cursor-grabbing"
                    >
                      <GripVertical className="h-4 w-4" aria-hidden />
                    </button>
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ws-teal-mid font-mono text-xs font-semibold text-white">
                      {index + 1}
                    </span>
                    <span className="flex-1 text-sm font-medium text-ws-ink">
                      {priorityFactorLabel(factor)}
                    </span>
                  </li>
                )}
              </Draggable>
            ))}
            {droppable.placeholder}
          </ol>
        )}
      </Droppable>
    </DragDropContext>
  );
}
