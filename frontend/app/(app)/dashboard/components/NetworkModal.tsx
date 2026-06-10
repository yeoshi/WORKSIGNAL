'use client';

import { useState, type ReactNode } from 'react';
import { RunAgentButton } from '@/app/components/ui/RunAgentButton';
import { Modal } from '../../../components/ui/Modal';
import { NetworkView } from '../../network/components/NetworkView';
import { NetworkRunPanel } from '../../network/components/NetworkRunPanel';
import { useNetworkAgentRun } from '../../network/hooks/useNetworkAgentRun';
import type { NetworkCardItem } from '../types';

export interface NetworkModalProps {
  open: boolean;
  onClose: () => void;
  companies?: NetworkCardItem[];
  onViewPipeline?: (company: string) => void;
}

export function NetworkModal({
  open,
  onClose,
  companies = [],
  onViewPipeline,
}: NetworkModalProps) {
  const [archiveAction, setArchiveAction] = useState<ReactNode | null>(null);
  const {
    stream,
    companyItems,
    companiesLoading,
    mergeCompanies,
    runCompletedEmpty,
    running,
  } = useNetworkAgentRun(companies);

  const titleAction = (
    <div className="flex flex-wrap items-center gap-2">
      {archiveAction}
      <RunAgentButton
        label="Run Network Agent"
        runningLabel="Running…"
        running={running}
        onClick={stream.start}
        testId="run-network-agent-button"
        ariaLabel="Run Network Agent"
      />
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Network"
      titleAction={titleAction}
      size="xl"
    >
      {(running || stream.events.length > 0) && (
        <NetworkRunPanel events={stream.events} error={stream.error} />
      )}
      {companiesLoading ? (
        <div
          data-testid="network-companies-loading"
          className="h-20 animate-pulse rounded bg-ws-line/60"
        />
      ) : (
        <NetworkView
          companyItems={companyItems}
          onTitleActionChange={setArchiveAction}
          mergeRunCompanies={mergeCompanies}
          runCompletedEmpty={runCompletedEmpty}
          runError={stream.state === 'error' ? stream.error : null}
          onViewPipeline={(company) => {
            onClose();
            onViewPipeline?.(company);
          }}
        />
      )}
    </Modal>
  );
}
