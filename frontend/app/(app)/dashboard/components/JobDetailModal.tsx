'use client';

import { useEffect, useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { JobDetailView } from '../../jobs/components/JobDetailView';
import { JobModalHeader } from '../../jobs/components/JobModalHeader';
import { ActionBar } from '../../jobs/components/ActionBar';
import { useJobDetail } from '../../jobs/hooks/useJobDetail';
import type { JobDetailAction } from '../../jobs/components/jobDetailTypes';

export interface JobDetailModalProps {
  open: boolean;
  jobId: string | null;
  showActions: boolean;
  onClose: () => void;
  /** Kanban-integrated skip — removes job from Needs Decision and closes modal. */
  onSkipJob?: (jobId: string) => Promise<void>;
  /** Kanban-integrated send — moves job to Sent and closes modal. */
  onSendJob?: (jobId: string, coverLetter: string) => Promise<void>;
}

export function JobDetailModal({
  open,
  jobId,
  showActions,
  onClose,
  onSkipJob,
  onSendJob,
}: JobDetailModalProps) {
  const { state, handleAction } = useJobDetail(jobId, open);
  const [coverLetter, setCoverLetter] = useState('');
  const [pendingAction, setPendingAction] = useState<JobDetailAction | null>(null);

  useEffect(() => {
    if (state.status === 'ready') {
      setCoverLetter(state.data.coverLetter);
    }
  }, [state]);

  const runAction = async (action: JobDetailAction) => {
    if (!showActions || !jobId) return;
    setPendingAction(action);
    try {
      if (action === 'skip' && onSkipJob) {
        await onSkipJob(jobId);
        return;
      }
      if (action === 'send' && onSendJob) {
        await onSendJob(jobId, coverLetter);
        return;
      }
      await handleAction(action, coverLetter);
    } finally {
      setPendingAction(null);
    }
  };

  const footer =
    showActions && state.status === 'ready' ? (
      <ActionBar
        hasEmployerEmail={Boolean(state.data.job.employer_email)}
        sourceUrl={state.data.job.source_url}
        onSend={() => runAction('send')}
        onSave={() => runAction('save')}
        onSkip={() => runAction('skip')}
        busy={pendingAction !== null}
        pendingAction={pendingAction}
        embedded
        showSave={false}
      />
    ) : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        state.status === 'ready' ? (
          <JobModalHeader job={state.data.job} />
        ) : (
          'Job detail'
        )
      }
      titleAction={
        state.status === 'ready' && state.data.job.source_url ? (
          <button
            type="button"
            data-testid="job-listing-link"
            onClick={() =>
              window.open(state.data.job.source_url, '_blank', 'noopener,noreferrer')
            }
            className="shrink-0 rounded-lg border border-ws-line bg-ws-card px-3 py-1.5 text-sm font-medium text-ws-ink transition hover:border-ws-teal/40 hover:bg-ws-paper"
          >
            View listing
          </button>
        ) : null
      }
      size="xl"
      scrollBody={false}
      footer={footer}
    >
      {state.status === 'loading' && (
        <p
          data-testid="job-detail-modal-loading"
          className="p-6 text-sm text-ws-muted"
        >
          Loading job…
        </p>
      )}
      {state.status === 'error' && (
        <p
          data-testid="job-detail-modal-error"
          className="p-6 text-sm text-ws-muted"
        >
          We couldn&apos;t load this job right now. {state.message}
        </p>
      )}
      {state.status === 'ready' && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
            <JobDetailView
              data={state.data}
              resumeUrl={state.resumeUrl}
              baseResumeUrl={state.baseResumeUrl}
              baseResumeS3Key={state.baseResumeS3Key}
              showActions={showActions}
              externalActionBar={showActions}
              coverLetter={coverLetter}
              onCoverLetterChange={setCoverLetter}
              embedded
            />
          </div>
        </div>
      )}
    </Modal>
  );
}

export default JobDetailModal;
