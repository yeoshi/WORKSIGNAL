'use client';

import { useState } from 'react';
import { JobHeader } from './JobHeader';
import { DebateCardList } from './DebateCardList';
import { DecisionSummary } from './DecisionSummary';
import { ResumePreview } from './ResumePreview';
import { CoverLetterEditor } from './CoverLetterEditor';
import { ActionBar } from './ActionBar';
import type { JobDetailAction, JobDetailData } from './jobDetailTypes';

export interface JobDetailViewProps {
  data: JobDetailData;
  /** Pre-signed resume URL, when available. */
  resumeUrl?: string | null;
  /**
   * Invoked for Send/Skip/Save. The edited cover-letter text is passed for
   * every action so Send uses the edited text verbatim (Req 15.6).
   */
  onAction?: (action: JobDetailAction, coverLetter: string) => void | Promise<void>;
}

/**
 * Presentational assembly of the Job Detail hero screen (Req 15.1–15.6, 16.6).
 * Holds the editable cover-letter state and threads it into every action so
 * the edited text reaches Send verbatim. Fully prop-driven for testability.
 */
export function JobDetailView({ data, resumeUrl, onAction }: JobDetailViewProps) {
  const { job, verdicts, decision, materials } = data;
  const [coverLetter, setCoverLetter] = useState(data.coverLetter);
  const [pendingAction, setPendingAction] = useState<JobDetailAction | null>(null);

  const handle = async (action: JobDetailAction) => {
    if (!onAction) return;
    setPendingAction(action);
    try {
      await onAction(action, coverLetter);
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <main
      data-testid="job-detail-view"
      className="mx-auto flex max-w-4xl flex-col gap-6 p-4 pb-28 sm:p-6"
    >
      <JobHeader job={job} />
      <DebateCardList verdicts={verdicts} />
      <DecisionSummary decision={decision} />
      <ResumePreview materials={materials} decision={decision} resumeUrl={resumeUrl} />
      <CoverLetterEditor
        value={coverLetter}
        onChange={setCoverLetter}
        decision={decision}
        disabled={pendingAction !== null}
      />
      <ActionBar
        hasEmployerEmail={Boolean(job.employer_email)}
        sourceUrl={job.source_url}
        onSend={() => handle('send')}
        onSave={() => handle('save')}
        onSkip={() => handle('skip')}
        busy={pendingAction !== null}
        pendingAction={pendingAction}
      />
    </main>
  );
}
