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
    <Modal open={open} onClose={onClose} title="Attention needed" size="lg">
      <div
        data-testid="issues-modal-body"
        className="max-h-[70vh] space-y-4 overflow-y-auto"
      >
        {issues.length === 0 ? (
          <p className="text-sm text-ws-muted">No issues right now.</p>
        ) : (
          issues.map((issue) => {
            if (issue.type === 'relaxation_suggestion') {
              return (
                <RelaxationSuggestionPrompt
                  key={issue.suggestion.suggestion_id}
                  suggestion={issue.suggestion}
                  onApprove={onApprove}
                  onReject={onReject}
                />
              );
            }
            return null;
          })
        )}
      </div>
    </Modal>
  );
}

export default IssuesModal;
