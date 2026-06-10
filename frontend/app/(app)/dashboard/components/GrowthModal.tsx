'use client';

import { useState, type ReactNode } from 'react';
import { RunAgentButton } from '@/app/components/ui/RunAgentButton';
import { Modal } from '../../../components/ui/Modal';
import { GrowthView } from '../../growth/components/GrowthView';
import { GrowthRunPanel } from '../../growth/components/GrowthRunPanel';
import { useGrowthAgentRun } from '../../growth/hooks/useGrowthAgentRun';
import type { GrowthCardItem } from '../types';

export interface GrowthModalProps {
  open: boolean;
  onClose: () => void;
  skills?: GrowthCardItem[];
}

export function GrowthModal({ open, onClose, skills: _skills = [] }: GrowthModalProps) {
  const [archiveAction, setArchiveAction] = useState<ReactNode | null>(null);
  const { stream, mergeData, running } = useGrowthAgentRun();

  const titleAction = (
    <div className="flex flex-wrap items-center gap-2">
      {archiveAction}
      <RunAgentButton
        label="Run Growth Agent"
        runningLabel="Running…"
        running={running}
        onClick={stream.start}
        testId="run-growth-agent-button"
        ariaLabel="Run Growth Agent"
      />
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Growth roadmap"
      titleAction={titleAction}
      size="xl"
    >
      {(running || stream.events.length > 0) && (
        <GrowthRunPanel events={stream.events} error={stream.error} />
      )}
      <GrowthView
        onTitleActionChange={setArchiveAction}
        mergeRunData={mergeData}
        runError={stream.state === 'error' ? stream.error : null}
      />
    </Modal>
  );
}
