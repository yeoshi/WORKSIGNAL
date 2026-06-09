'use client';

import { Modal } from '../../../components/ui/Modal';
import { RelaxationSuggestionPrompt } from './RelaxationSuggestionPrompt';
import type { DashboardIssue } from '../types';

export interface IssuesModalProps {
  open: boolean;
  onClose: () => void;
  issues: DashboardIssue[];
  onApprove: (suggestionId: string) => void | Promise<void>;
  onReject: (suggestionId: string) => void | Promise<void>;
}

export function IssuesModal({
  open,
  onClose,
  issues,
  onApprove,
  onReject,
}: IssuesModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Your agents flagged something"
      size="lg"
    >
      <div
        data-testid="issues-modal-body"
        className="max-h-[70vh] space-y-4 overflow-y-auto"
      >
        {issues.length === 0 ? (
          <p className="text-sm text-ws-muted">No issues right now.</p>
        ) : (
          <>
            <p className="text-sm font-medium text-ws-ink">
              Your agents flagged {issues.length} item
              {issues.length === 1 ? '' : 's'}
            </p>
            <div className="flex flex-col gap-4">
              {issues.map((issue) => {
                if (issue.type === 'relaxation_suggestion') {
                  return (
                    <RelaxationSuggestionPrompt
                      key={issue.suggestion.suggestion_id}
                      suggestion={issue.suggestion}
                      onApprove={onApprove}
                      onReject={onReject}
                      variant="card"
                    />
                  );
                }
                return null;
              })}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

export default IssuesModal;
