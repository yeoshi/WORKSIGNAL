'use client';

import { Modal } from '../../../components/ui/Modal';
import { JobDetailView } from '../../jobs/components/JobDetailView';
import { useJobDetail } from '../../jobs/hooks/useJobDetail';

export interface JobDetailModalProps {
  open: boolean;
  jobId: string | null;
  showActions: boolean;
  onClose: () => void;
}

export function JobDetailModal({
  open,
  jobId,
  showActions,
  onClose,
}: JobDetailModalProps) {
  const { state, handleAction } = useJobDetail(jobId, open);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={state.status === 'ready' ? state.data.job.role_title : 'Job detail'}
      size="xl"
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
        <JobDetailView
          data={state.data}
          resumeUrl={state.resumeUrl}
          onAction={showActions ? handleAction : undefined}
          showActions={showActions}
          embedded
        />
      )}
    </Modal>
  );
}

export default JobDetailModal;
