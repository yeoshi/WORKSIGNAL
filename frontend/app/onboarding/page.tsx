'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Stepper } from '../components/onboarding/Stepper';
import { fetchOnboardingState } from './api';
import { getOnboardingResumeStep } from './lib/onboardingStatus';
import { AboutYouStep, type AboutYouValue } from './steps/AboutYouStep';
import { ResumeUploadStep } from './steps/ResumeUploadStep';
import { TargetsStep } from './steps/TargetsStep';

const STEPS = ['Resume', 'About you', 'Targets'] as const;

export default function OnboardingPage() {
  const router = useRouter();
  const { status } = useSession();
  const [currentStep, setCurrentStep] = useState(0);
  const [aboutYou, setAboutYou] = useState<AboutYouValue | null>(null);
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
        <p className="text-sm text-gray-500">Loading onboarding…</p>
      </main>
    );
  }

  return (
    <main
      data-testid="onboarding-page"
      className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-4 py-10"
    >
      <header className="flex flex-col gap-4">
        <p className="font-wordmark text-lg font-semibold text-indigo-700">Work Signal</p>
        <Stepper steps={STEPS} current={currentStep} />
      </header>

      {currentStep === 0 && (
        <ResumeUploadStep
          onBack={() => router.replace('/')}
          onComplete={() => setCurrentStep(1)}
        />
      )}

      {currentStep === 1 && (
        <AboutYouStep
          onBack={() => setCurrentStep(0)}
          onComplete={(value) => {
            setAboutYou(value);
            setCurrentStep(2);
          }}
        />
      )}

      {currentStep === 2 && (
        <TargetsStep
          requiresSponsorship={aboutYou?.residency_status === 'need_sponsorship'}
          onBack={() => setCurrentStep(1)}
          onComplete={() => router.push('/dashboard')}
        />
      )}
    </main>
  );
}
