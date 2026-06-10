'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
  const [isDraftingCoverLetter, setIsDraftingCoverLetter] = useState(false);
  const [pendingAction, setPendingAction] = useState<JobDetailAction | null>(null);
  // Overrides state.resumeUrl after a per-job custom resume is uploaded.
  const [customResumeUrl, setCustomResumeUrl] = useState<string | null>(null);
  // Track which jobId we've already auto-drafted for — avoids duplicate calls.
  const draftedForRef = useRef<string | null>(null);

  // Populate cover letter from API once loaded.
  useEffect(() => {
    if (state.status === 'ready') {
      setCoverLetter(state.data.coverLetter);
    }
  }, [state]);

  // Auto-draft cover letter via Bedrock when the job loads and no letter exists yet.
  useEffect(() => {
    if (
      state.status !== 'ready' ||
      !jobId ||
      state.data.coverLetter.trim() !== '' ||
      draftedForRef.current === jobId ||
      isDraftingCoverLetter
    ) {
      return;
    }

    draftedForRef.current = jobId;
    setIsDraftingCoverLetter(true);

    fetch('/api/apply/draft', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ job_id: jobId }),
    })
      .then((r) => r.json())
      .then((data: { cover_letter?: string }) => {
        if (data.cover_letter?.trim()) {
          setCoverLetter(data.cover_letter);
        }
      })
      .catch(() => { /* leave empty — user can type manually */ })
      .finally(() => setIsDraftingCoverLetter(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status, jobId]);

  // Regenerate cover letter on demand (wired to the ↺ button in CoverLetterEditor).
  const regenerateDraft = useCallback(() => {
    if (!jobId || isDraftingCoverLetter) return;
    draftedForRef.current = null; // allow re-draft
    setCoverLetter('');
    setIsDraftingCoverLetter(true);

    fetch('/api/apply/draft', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ job_id: jobId }),
    })
      .then((r) => r.json())
      .then((data: { cover_letter?: string }) => {
        setCoverLetter(data.cover_letter?.trim() ?? '');
      })
      .catch(() => {})
      .finally(() => setIsDraftingCoverLetter(false));
  }, [jobId, isDraftingCoverLetter]);

  // Reset draft tracking and custom resume when the modal closes or switches job.
  useEffect(() => {
    if (!open) {
      draftedForRef.current = null;
      setCoverLetter('');
      setIsDraftingCoverLetter(false);
      setCustomResumeUrl(null);
    }
  }, [open, jobId]);

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
              resumeUrl={customResumeUrl ?? state.resumeUrl}
              baseResumeUrl={state.baseResumeUrl}
              baseResumeS3Key={state.baseResumeS3Key}
              showActions={showActions}
              externalActionBar={showActions}
              coverLetter={coverLetter}
              onCoverLetterChange={setCoverLetter}
              onRegenerate={regenerateDraft}
              isDraftingCoverLetter={isDraftingCoverLetter}
              onCustomResumeUploaded={(_key, url) => setCustomResumeUrl(url)}
              embedded
            />
          </div>
        </div>
      )}
    </Modal>
  );
}

export default JobDetailModal;
