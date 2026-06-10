'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchOnboardingState } from '../../onboarding/api';
import { isOnboardingComplete } from '../../onboarding/lib/onboardingStatus';
import { DashboardHeader } from './components/DashboardHeader';
import { InsightRail } from './components/InsightCards';
import { PipelineKanban } from './components/PipelineKanban';
import { GrowthModal } from './components/GrowthModal';
import { NetworkModal } from './components/NetworkModal';
import { BriefModal } from './components/BriefModal';
import { IssuesModal } from './components/IssuesModal';
import { JobDetailModal } from './components/JobDetailModal';
import { AgentRunModal } from './components/AgentRunModal';
import { CoverLetterModal } from './components/CoverLetterModal';
import { useDashboardData } from './useDashboardData';
import { useAgentRun } from './hooks/useAgentRun';
import { usePipeline } from '../pipeline/hooks/usePipeline';
import { useKanbanActions } from './hooks/useKanbanActions';
import { Metric } from '../../components/ui/Metric';
import {
  buildDashboardIssues,
  countPendingIssues,
} from './lib/buildDashboardIssues';

function DashboardPageContent() {
  const router = useRouter();
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
  const [agentRunOpen, setAgentRunOpen] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedJobShowActions, setSelectedJobShowActions] = useState(false);
  const [applyJobId, setApplyJobId] = useState<string | null>(null);

  const agentRun = useAgentRun(reload);

  const handleApply = useCallback((jobId: string) => {
    setApplyJobId(jobId);
  }, []);

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

  const handleModalSkip = useCallback(
    async (jobId: string) => {
      await skip(jobId);
      handleCloseJob();
    },
    [skip],
  );

  const handleModalSend = useCallback(
    async (jobId: string, coverLetter: string) => {
      await send(jobId, coverLetter);
      handleCloseJob();
    },
    [send],
  );

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
            onRunAgent={() => { setAgentRunOpen(true); agentRun.start(); }}
            agentRunning={agentRun.state === 'running'}
          />

          <div className="grid min-w-0 grid-cols-1 items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(220px,26%)] lg:gap-5">
            <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
              <div className="grid min-w-0 grid-cols-3 gap-2 sm:gap-4">
                <Metric
                  bordered
                  label="Total"
                  value={data.pipeline.total}
                  secondarySubtext="applications"
                />
                <Metric
                  bordered
                  label="Callbacks"
                  value={callbacks}
                />
                <Metric
                  bordered
                  label="Callback Rate"
                  value={
                    callbackRate == null
                      ? '—'
                      : `${Math.round(callbackRate * 100)}%`
                  }
                  valueClassName={
                    callbackRate != null && callbackRate > 0.08
                      ? 'text-emerald-600'
                      : undefined
                  }
                  secondarySubtext={
                    callbackRate != null ? 'vs. 8% SG avg' : undefined
                  }
                />
              </div>

              <PipelineKanban
                applications={applications}
                actionNeeded={data.action_needed}
                isLoading={pipelineLoading}
                onOpenJob={handleOpenJob}
                onApply={handleApply}
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

      <GrowthModal
        open={growthOpen}
        onClose={() => setGrowthOpen(false)}
        skills={data?.growth ?? []}
      />
      <NetworkModal
        open={networkOpen}
        onClose={() => setNetworkOpen(false)}
        companies={data?.network ?? []}
        onViewPipeline={(company) => {
          router.push(
            `/dashboard?company=${encodeURIComponent(company)}#pipeline`,
          );
        }}
      />
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
        onSkipJob={selectedJobShowActions ? handleModalSkip : undefined}
        onSendJob={selectedJobShowActions ? handleModalSend : undefined}
      />
      <AgentRunModal
        open={agentRunOpen}
        state={agentRun.state}
        events={agentRun.events}
        onClose={() => { setAgentRunOpen(false); agentRun.reset(); }}
      />
      {(() => {
        const applyItem = actionNeeded.find((i) => i.job_id === applyJobId);
        return (
          <CoverLetterModal
            open={applyJobId !== null}
            jobId={applyJobId}
            jobTitle={applyItem?.role_title ?? ''}
            company={applyItem?.company ?? ''}
            hasEmployerEmail={applyItem?.has_employer_email ?? false}
            sourceUrl={applyItem?.source_url ?? null}
            onClose={() => setApplyJobId(null)}
            onSent={(jobId) => {
              markSent(jobId);
              setApplyJobId(null);
            }}
          />
        );
      })()}
    </main>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);

  useEffect(() => {
    let isComplete = false;

    void (async () => {
      try {
        const record = await fetchOnboardingState();
        isComplete = isOnboardingComplete(record);
      } catch (error) {
        console.error('Onboarding check failed:', error);
        isComplete = false;
      }

      if (!isComplete) {
        router.replace('/onboarding');
        return;
      }

      setOnboardingComplete(true);
    })();
  }, [router]);

  if (onboardingComplete !== true) {
    return (
      <main className="mx-auto min-w-0 max-w-[1600px] space-y-5 overflow-x-hidden p-4 sm:space-y-6 sm:p-6 lg:px-8">
        <p
          data-testid="dashboard-loading"
          className="ws-card p-6 text-sm text-ws-muted"
        >
          Loading your dashboard…
        </p>
      </main>
    );
  }

  return <DashboardPageContent />;
}
