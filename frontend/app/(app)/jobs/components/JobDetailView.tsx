'use client';

import { useEffect, useState } from 'react';
import { JobHeader } from './JobHeader';
import { DebateCardList } from './DebateCardList';
import { DecisionSummary } from './DecisionSummary';
import { ApplicationMaterials } from './ApplicationMaterials';
import { ActionBar } from './ActionBar';
import type { JobDetailAction, JobDetailData } from './jobDetailTypes';

export interface JobDetailViewProps {
  data: JobDetailData;
  resumeUrl?: string | null;
  baseResumeUrl?: string | null;
  baseResumeS3Key?: string | null;
  onAction?: (action: JobDetailAction, coverLetter: string) => void | Promise<void>;
  showActions?: boolean;
  embedded?: boolean;
  /** When true, omits the inline action bar (parent renders it in a sticky footer). */
  externalActionBar?: boolean;
  /** Controlled cover letter (used with external action bar). */
  coverLetter?: string;
  onCoverLetterChange?: (value: string) => void;
  /** Called when the user clicks ↺ to regenerate the cover letter via Bedrock. */
  onRegenerate?: () => void;
  /** True while the cover letter is streaming — shows a loading state. */
  coverLetterLoading?: boolean;
  /** Streamed resume tailoring notes (Needs Decision modal only). */
  tailoringNotes?: string;
  /** True while tailoring notes are streaming. */
  tailoringLoading?: boolean;
  /** Shown when cover letter / tailoring generation fails. */
  generationError?: string | null;
  /** True while resume is streaming or being saved as PDF. */
  resumeLoading?: boolean;
  /** Shown when resume generation or PDF persistence fails. */
  resumeGenerationError?: string | null;
  /** Active resume S3 key override (customised resume). */
  resumeS3Key?: string;
  /** Called after the user uploads a custom resume for this specific job. */
  onCustomResumeUploaded?: (s3Key: string, resumeUrl: string) => void;
}

export function JobDetailView({
  data,
  resumeUrl,
  baseResumeUrl,
  baseResumeS3Key,
  onAction,
  showActions = true,
  embedded = false,
  externalActionBar = false,
  coverLetter: controlledCoverLetter,
  onCoverLetterChange,
  onRegenerate,
  coverLetterLoading = false,
  tailoringNotes,
  tailoringLoading = false,
  generationError = null,
  resumeLoading = false,
  resumeGenerationError = null,
  resumeS3Key,
  onCustomResumeUploaded,
}: JobDetailViewProps) {
  const { job, verdicts, decision, materials } = data;
  const [internalCoverLetter, setInternalCoverLetter] = useState(data.coverLetter);
  const coverLetter = controlledCoverLetter ?? internalCoverLetter;
  const setCoverLetter = onCoverLetterChange ?? setInternalCoverLetter;
  const [pendingAction, setPendingAction] = useState<JobDetailAction | null>(null);

  useEffect(() => {
    if (controlledCoverLetter === undefined) {
      setInternalCoverLetter(data.coverLetter);
    }
  }, [data.coverLetter, controlledCoverLetter]);

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
      className={[
        'mx-auto flex w-full min-w-0 flex-col gap-6',
        embedded ? 'max-w-full p-0' : 'max-w-4xl p-4 pb-28 sm:p-6',
      ].join(' ')}
    >
      {!embedded && <JobHeader job={job} />}
      <DebateCardList verdicts={verdicts} />
      <DecisionSummary decision={decision} />
      <ApplicationMaterials
        job={job}
        materials={materials}
        decision={decision}
        resumeUrl={resumeUrl}
        baseResumeUrl={baseResumeUrl}
        baseResumeS3Key={baseResumeS3Key}
        coverLetter={coverLetter}
        onCoverLetterChange={setCoverLetter}
        originalCoverLetter={data.coverLetter}
        editable={showActions}
        disabled={pendingAction !== null}
        onRegenerate={onRegenerate}
        coverLetterLoading={coverLetterLoading}
        tailoringNotes={tailoringNotes}
        tailoringLoading={tailoringLoading}
        generationError={generationError}
        resumeLoading={resumeLoading}
        resumeGenerationError={resumeGenerationError}
        resumeS3Key={resumeS3Key}
        onCustomResumeUploaded={onCustomResumeUploaded}
      />
      {showActions && !externalActionBar && (
        <ActionBar
          hasEmployerEmail={Boolean(job.employer_email)}
          sourceUrl={job.source_url}
          onSend={() => handle('send')}
          onSave={() => handle('save')}
          onSkip={() => handle('skip')}
          busy={pendingAction !== null}
          pendingAction={pendingAction}
          showSave={false}
        />
      )}
    </main>
  );
}
