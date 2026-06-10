'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { ParsedProfile } from '@/app/types/shared';
import type { ProfileSectionHandle } from '../../../onboarding/lib/profileSectionHandle';
import type { OnboardingRecord } from '../../../onboarding/lib/onboardingStatus';
import { deriveFileNameFromS3Key } from '../../../onboarding/lib/deriveFileNameFromS3Key';
import { ResumeConfirmStep } from '../../../onboarding/steps/ResumeConfirmStep';
import {
  ResumeUploadStep,
  type ResumeStepResult,
} from '../../../onboarding/steps/ResumeUploadStep';
import { buildResumeDraft } from '../lib/profileState';

export const ProfileResumeTab = forwardRef<
  ProfileSectionHandle,
  { record: OnboardingRecord }
>(function ProfileResumeTab({ record }, ref) {
  const confirmRef = useRef<ProfileSectionHandle>(null);
  const [resumeDraft, setResumeDraft] = useState<ResumeStepResult>(() =>
    buildResumeDraft(record),
  );

  useEffect(() => {
    setResumeDraft(buildResumeDraft(record));
  }, [record]);

  useImperativeHandle(ref, () => ({
    async validateAndSave() {
      return confirmRef.current?.validateAndSave() ?? {
        ok: false,
        message: 'Profile details are not ready to save.',
      };
    },
  }));

  function handleResumeChange(result: ResumeStepResult) {
    setResumeDraft((prev) => ({
      ...prev,
      ...result,
      profile: result.profile ?? prev.profile,
    }));
  }

  return (
    <div className="flex flex-col gap-10" data-testid="profile-resume-tab">
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-wordmark text-xl font-semibold text-ws-ink">
            Documents
          </h2>
          <p className="text-sm text-ws-muted">
            Your uploaded resume and cover letter sample. Remove or replace either
            file at any time.
          </p>
        </div>
        <ResumeUploadStep
          embedded
          mode="edit"
          existingResumeS3Key={record.resume_s3_key}
          existingResumeFileName={deriveFileNameFromS3Key(record.resume_s3_key)}
          existingCoverLetterS3Key={record.cover_letter_sample_s3_key}
          existingCoverLetterFileName={deriveFileNameFromS3Key(
            record.cover_letter_sample_s3_key,
          )}
          existingProfile={resumeDraft.profile}
          onResumeChange={handleResumeChange}
          onBack={() => {}}
          onComplete={() => {}}
        />
      </section>

      <section className="flex flex-col gap-4 border-t border-ws-line pt-10">
        <div className="flex flex-col gap-1">
          <h2 className="font-wordmark text-xl font-semibold text-ws-ink">
            Parsed profile details
          </h2>
          <p className="text-sm text-ws-muted">
            Review and edit the information we extracted from your resume.
          </p>
        </div>
        <ResumeConfirmStep
          ref={confirmRef}
          key={resumeDraft.s3Key ?? resumeDraft.fileName ?? 'profile-details'}
          embedded
          hideFooter
          requireWorkExperience={false}
          initialProfile={resumeDraft.profile as ParsedProfile | null | undefined}
          resumeS3Key={resumeDraft.s3Key}
          manualEntry={resumeDraft.manualEntry ?? false}
          onBack={() => {}}
          onComplete={() => {}}
        />
      </section>
    </div>
  );
});
