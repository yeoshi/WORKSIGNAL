'use client';

import { useState } from 'react';
import type { Job, MasterDecision, Materials } from '@worksignal/shared';
import { ResumePreview } from './ResumePreview';
import { CoverLetterEditor } from './CoverLetterEditor';

export interface ApplicationMaterialsProps {
  job: Job;
  materials: Materials;
  decision: MasterDecision;
  resumeUrl?: string | null;
  baseResumeUrl?: string | null;
  baseResumeS3Key?: string | null;
  coverLetter: string;
  onCoverLetterChange: (value: string) => void;
  originalCoverLetter: string;
  editable: boolean;
  disabled?: boolean;
  onRegenerate?: () => void;
  coverLetterLoading?: boolean;
  tailoringNotes?: string;
  tailoringLoading?: boolean;
  generationError?: string | null;
  resumeLoading?: boolean;
  resumeGenerationError?: string | null;
  resumeS3Key?: string;
  onCustomResumeUploaded?: (s3Key: string, resumeUrl: string) => void;
}

export function ApplicationMaterials({
  job,
  materials,
  decision,
  resumeUrl,
  baseResumeUrl,
  baseResumeS3Key,
  coverLetter,
  onCoverLetterChange,
  originalCoverLetter,
  editable,
  disabled = false,
  onRegenerate,
  coverLetterLoading = false,
  tailoringNotes,
  tailoringLoading = false,
  generationError = null,
  resumeLoading = false,
  resumeGenerationError = null,
  resumeS3Key,
  onCustomResumeUploaded,
}: ApplicationMaterialsProps) {
  const [usingOriginalResume, setUsingOriginalResume] = useState(false);

  const canUseOriginalResume = Boolean(
    editable && materials.customisation_applied && baseResumeS3Key,
  );

  const activeResumeUrl = usingOriginalResume
    ? baseResumeUrl
    : (resumeUrl ?? (!materials.customisation_applied ? baseResumeUrl : null));
  const activeResumeS3Key = usingOriginalResume
    ? (baseResumeS3Key ?? materials.resume_s3_key)
    : (resumeS3Key ?? materials.resume_s3_key);

  return (
    <section
      data-testid="application-materials"
      className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2.25fr)]"
    >
      <ResumePreview
        materials={materials}
        decision={decision}
        resumeUrl={activeResumeUrl}
        resumeS3Key={activeResumeS3Key}
        compact={!editable}
        editable={editable}
        usingOriginalResume={usingOriginalResume}
        canUseOriginalResume={canUseOriginalResume}
        onUseOriginalResume={() => setUsingOriginalResume(true)}
        onUseCustomisedResume={() => setUsingOriginalResume(false)}
        jobId={job.job_id}
        resumeLoading={resumeLoading}
        resumeGenerationError={resumeGenerationError}
        onCustomResumeUploaded={onCustomResumeUploaded}
      />
      <CoverLetterEditor
        value={coverLetter}
        onChange={onCoverLetterChange}
        decision={decision}
        disabled={disabled}
        originalValue={originalCoverLetter}
        onRegenerate={onRegenerate}
        isLoading={coverLetterLoading}
        tailoringNotes={tailoringNotes}
        tailoringLoading={tailoringLoading}
        generationError={generationError}
        editable={editable}
        company={job.company}
        roleTitle={job.role_title}
      />
    </section>
  );
}
