'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { ParsedProfile } from '@/app/types/shared';
import { Logo } from '../components/ui/Logo';
import { Stepper } from '../components/onboarding/Stepper';
import { fetchOnboardingState } from './api';
import { getOnboardingResumeStep } from './lib/onboardingStatus';
import { emptyParsedProfile } from './lib/parsedProfileDefaults';
import { AboutYouStep, type AboutYouValue } from './steps/AboutYouStep';
import { ResumeConfirmStep } from './steps/ResumeConfirmStep';
import { ResumeUploadStep, type ResumeStepResult } from './steps/ResumeUploadStep';
import { TargetsStep } from './steps/TargetsStep';

const STEPS = ['Resume', 'Confirm', 'About you', 'Targets'] as const;

export default function OnboardingPage() {
  const router = useRouter();
  const { status } = useSession();
  const [currentStep, setCurrentStep] = useState(0);
  const [aboutYou, setAboutYou] = useState<AboutYouValue | null>(null);
  const [resumeDraft, setResumeDraft] = useState<ResumeStepResult | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/');
      return;
    }

    if (status !== 'authenticated') {
      return;
    }

    let active = true;

    fetchOnboardingState()
      .then((record) => {
        if (!active) return;

        const resumeStep = getOnboardingResumeStep(record);
        if (resumeStep === -1) {
          router.replace('/dashboard');
          return;
        }

        setCurrentStep(resumeStep);

        if (record?.career_stage && record?.residency_status) {
          setAboutYou({
            career_stage: record.career_stage,
            residency_status: record.residency_status,
            career_switch_context: record.career_switch_context,
          });
        }

        if (record?.profile) {
          const empty = emptyParsedProfile();
          setResumeDraft({
            manualEntry: false,
            s3Key: record.resume_s3_key,
            profile: {
              ...empty,
              ...record.profile,
              basic_info: { ...empty.basic_info!, ...record.profile.basic_info },
            },
          });
        }

        setReady(true);
      })
      .catch(() => {
        if (active) setReady(true);
      });

    return () => {
      active = false;
    };
  }, [status, router]);

  if (status === 'loading' || !ready) {
    return (
      <main
        data-testid="onboarding-loading"
        className="mx-auto flex min-h-screen max-w-2xl items-center justify-center px-4"
        aria-busy="true"
      >
        <p className="text-sm text-ws-muted">Loading onboarding…</p>
      </main>
    );
  }

  return (
    <main
      data-testid="onboarding-page"
      className={[
        'mx-auto flex min-h-screen flex-col gap-8 px-4 py-10 sm:px-6',
        currentStep === 1 ? 'max-w-3xl' : 'max-w-2xl',
      ].join(' ')}
    >
      <header className="flex flex-col gap-6">
        <Logo size="md" />
        <Stepper steps={STEPS} current={currentStep} />
      </header>

      <div className="ws-card p-6 sm:p-8">
        {currentStep === 0 && (
          <ResumeUploadStep
            onBack={() => router.replace('/')}
            onComplete={(result) => {
              setResumeDraft(result);
              setCurrentStep(1);
            }}
          />
        )}

        {currentStep === 1 && (
          <ResumeConfirmStep
            initialProfile={resumeDraft?.profile as ParsedProfile | null | undefined}
            resumeS3Key={resumeDraft?.s3Key}
            manualEntry={resumeDraft?.manualEntry ?? false}
            onBack={() => setCurrentStep(0)}
            onComplete={() => setCurrentStep(2)}
          />
        )}

        {currentStep === 2 && (
          <AboutYouStep
            onBack={() => setCurrentStep(1)}
            onComplete={(value) => {
              setAboutYou(value);
              setCurrentStep(3);
            }}
          />
        )}

        {currentStep === 3 && (
          <TargetsStep
            requiresSponsorship={aboutYou?.residency_status === 'need_sponsorship'}
            onBack={() => setCurrentStep(2)}
            onComplete={() => router.push('/dashboard')}
          />
        )}
      </div>
    </main>
  );
}
