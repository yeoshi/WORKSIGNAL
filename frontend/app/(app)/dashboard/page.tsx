'use client';

import { useMemo, useState } from 'react';
import { DashboardHeader } from './components/DashboardHeader';
import { InsightRail } from './components/InsightCards';
import { PipelineKanban } from './components/PipelineKanban';
import { GrowthModal } from './components/GrowthModal';
import { NetworkModal } from './components/NetworkModal';
import { BriefModal } from './components/BriefModal';
import { IssuesModal } from './components/IssuesModal';
import { JobDetailModal } from './components/JobDetailModal';
import { useDashboardData } from './useDashboardData';
import { usePipeline } from '../pipeline/hooks/usePipeline';
import { useKanbanActions } from './hooks/useKanbanActions';
import { Metric } from '../../components/ui/Metric';
import {
  buildDashboardIssues,
  countPendingIssues,
} from './lib/buildDashboardIssues';

export default function DashboardPage() {
  const { data, state, removeActionNeeded, approveSuggestion, rejectSuggestion, reload } =
    useDashboardData();
  const {
    applications,
    isLoading: pipelineLoading,
    reload: reloadPipeline,
    prependApplication,
  } = usePipeline();

  const [growthOpen, setGrowthOpen] = useState(false);
  const [networkOpen, setNetworkOpen] = useState(false);
  const [briefOpen, setBriefOpen] = useState(false);
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedJobShowActions, setSelectedJobShowActions] = useState(false);

  const actionNeeded = data?.action_needed ?? [];

  const { send, skip, save, markSent } = useKanbanActions({
    actionNeeded,
    removeActionNeeded,
    prependApplication,
    reloadDashboard: reload,
    reloadPipeline,
  });

  const issues = useMemo(
    () => (data ? buildDashboardIssues(data) : []),
    [data],
  );
  const issueCount = data ? countPendingIssues(data) : 0;

  const callbacks = data?.pipeline.by_status.callback ?? 0;
  const callbackRate = data?.intelligence.callback_rate;

  const handleOpenJob = (jobId: string, opts: { showActions: boolean }) => {
    setSelectedJobId(jobId);
    setSelectedJobShowActions(opts.showActions);
  };

  const handleCloseJob = () => {
    setSelectedJobId(null);
    setSelectedJobShowActions(false);
  };

  return (
    <main className="mx-auto min-w-0 max-w-[1600px] space-y-5 overflow-x-hidden p-4 sm:space-y-6 sm:p-6 lg:px-8">
      {state === 'loading' && (
        <p
          data-testid="dashboard-loading"
          className="ws-card p-6 text-sm text-ws-muted"
        >
          Loading your dashboard…
        </p>
      )}

      {state === 'error' && (
        <p
          data-testid="dashboard-error"
          className="ws-card p-6 text-sm text-ws-muted"
        >
          We couldn&apos;t load your dashboard just yet.
        </p>
      )}

      {state === 'ready' && data && (
        <>
          <DashboardHeader
            agentStatus={data.agent_status}
            issueCount={issueCount}
            onOpenIssues={() => setIssuesOpen(true)}
          />

          <div className="grid min-w-0 grid-cols-1 items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(220px,26%)] lg:gap-5">
            <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
              <div className="grid min-w-0 grid-cols-3 gap-2 sm:gap-4">
                <Metric
                  bordered
                  label="Total"
                  value={data.pipeline.total}
                  subtext="applications"
                />
                <Metric
                  bordered
                  label="Callbacks"
                  value={callbacks}
                  subtext="this cycle"
                />
                <Metric
                  bordered
                  label="Rate"
                  value={
                    callbackRate === null
                      ? '—'
                      : `${Math.round(callbackRate * 100)}%`
                  }
                  highlight={
                    callbackRate != null && callbackRate >= 0.15
                  }
                />
              </div>

              <PipelineKanban
                applications={applications}
                actionNeeded={data.action_needed}
                isLoading={pipelineLoading}
                onOpenJob={handleOpenJob}
                onSend={send}
                onSkip={skip}
                onSave={save}
                onMarkSent={markSent}
              />
            </div>

            <InsightRail
              expanded
              growth={data.growth}
              network={data.network}
              intelligence={data.intelligence}
              onOpenGrowth={() => setGrowthOpen(true)}
              onOpenNetwork={() => setNetworkOpen(true)}
              onOpenBrief={() => setBriefOpen(true)}
            />
          </div>
        </>
      )}

      <GrowthModal open={growthOpen} onClose={() => setGrowthOpen(false)} />
      <NetworkModal open={networkOpen} onClose={() => setNetworkOpen(false)} />
      <BriefModal open={briefOpen} onClose={() => setBriefOpen(false)} />
      <IssuesModal
        open={issuesOpen}
        onClose={() => setIssuesOpen(false)}
        issues={issues}
        onApprove={approveSuggestion}
        onReject={rejectSuggestion}
      />
      <JobDetailModal
        open={selectedJobId !== null}
        jobId={selectedJobId}
        showActions={selectedJobShowActions}
        onClose={handleCloseJob}
      />
    </main>
  );
}
