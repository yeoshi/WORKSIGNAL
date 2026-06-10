'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ResidencyStatus } from '@worksignal/shared';
import { PillTabs } from '../../components/ui/PillTabs';
import { Snackbar } from '../../components/ui/Snackbar';
import { fetchOnboardingState } from '../../onboarding/api';
import type { ProfileSectionHandle } from '../../onboarding/lib/profileSectionHandle';
import type { OnboardingRecord } from '../../onboarding/lib/onboardingStatus';
import { AboutYouStep } from '../../onboarding/steps/AboutYouStep';
import { TargetsStep } from '../../onboarding/steps/TargetsStep';
import { ProfileResumeTab } from './components/ProfileResumeTab';
import {
  buildAboutYou,
  buildTargetsInitial,
} from './lib/profileState';

const PROFILE_TABS = [
  { id: 'resume', label: 'Resume & cover letter' },
  { id: 'about', label: 'About you' },
  { id: 'targets', label: 'Targets' },
] as const;

type ProfileTabId = (typeof PROFILE_TABS)[number]['id'];

export default function ProfilePage() {
  const router = useRouter();
  const { status } = useSession();
  const [activeTab, setActiveTab] = useState<ProfileTabId>('resume');
  const [record, setRecord] = useState<OnboardingRecord | null>(null);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [liveResidency, setLiveResidency] = useState<ResidencyStatus | null>(null);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    variant: 'success' | 'error';
  }>({ open: false, message: '', variant: 'success' });

  const resumeRef = useRef<ProfileSectionHandle>(null);
  const aboutRef = useRef<ProfileSectionHandle>(null);
  const targetsRef = useRef<ProfileSectionHandle>(null);

  const reload = useCallback(async () => {
    const next = await fetchOnboardingState();
    if (next) {
      setRecord(next);
      if (next.residency_status) {
        setLiveResidency(next.residency_status);
      }
    }
  }, []);

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
      .then((data) => {
        if (!active) return;
        const next = data ?? {};
        setRecord(next);
        if (next.residency_status) {
          setLiveResidency(next.residency_status);
        }
        setReady(true);
      })
      .catch(() => {
        if (active) {
          setRecord({});
          setReady(true);
        }
      });

    return () => {
      active = false;
    };
  }, [status, router]);

  const aboutYou = useMemo(
    () => (record ? buildAboutYou(record) : null),
    [record],
  );

  const targetsInitial = useMemo(
    () => (record ? buildTargetsInitial(record) : undefined),
    [record],
  );

  const requiresSponsorship =
    (liveResidency ?? aboutYou?.residency_status) === 'need_sponsorship';

  function showSnackbar(message: string, variant: 'success' | 'error') {
    setSnackbar({ open: true, message, variant });
  }

  async function handleSaveAll() {
    setSaving(true);

    // Save targets (including min salary) first so a failure in another tab
    // cannot block persisting the value the user just edited.
    const targetsResult = await targetsRef.current?.validateAndSave();
    if (!targetsResult?.ok) {
      setActiveTab('targets');
      showSnackbar(targetsResult?.message ?? 'Could not save Targets.', 'error');
      setSaving(false);
      return;
    }

    const aboutResult = await aboutRef.current?.validateAndSave();
    if (!aboutResult?.ok) {
      setActiveTab('about');
      showSnackbar(aboutResult?.message ?? 'Could not save About you.', 'error');
      setSaving(false);
      return;
    }

    const resumeResult = await resumeRef.current?.validateAndSave();
    if (!resumeResult?.ok) {
      setActiveTab('resume');
      showSnackbar(
        resumeResult?.message ?? 'Could not save resume and profile details.',
        'error',
      );
      setSaving(false);
      return;
    }

    const next = await fetchOnboardingState();
    if (next) {
      setRecord(next);
      if (next.residency_status) {
        setLiveResidency(next.residency_status);
      }
    }

    const savedSalary = next?.non_negotiables?.min_salary;
    if (typeof savedSalary === 'number' && targetsResult.savedMinSalary != null) {
      if (savedSalary !== targetsResult.savedMinSalary) {
        setActiveTab('targets');
        showSnackbar(
          `Minimum salary did not stick (saved as $${savedSalary}). Try again.`,
          'error',
        );
        setSaving(false);
        return;
      }
    }

    showSnackbar(
      typeof savedSalary === 'number'
        ? `Profile saved (min salary $${savedSalary.toLocaleString()})`
        : 'Profile saved',
      'success',
    );
    setSaving(false);
  }

  if (status === 'loading' || !ready || !record) {
    return (
      <main
        data-testid="profile-loading"
        className="mx-auto flex min-h-[50vh] max-w-3xl items-center justify-center px-4"
        aria-busy="true"
      >
        <p className="text-sm text-ws-muted">Loading profile…</p>
      </main>
    );
  }

  return (
    <main
      data-testid="profile-page"
      className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-10 sm:px-6"
    >
      <header className="flex flex-col gap-2">
        <h1 className="font-wordmark text-3xl font-semibold text-ws-ink">Profile</h1>
        <p className="text-sm text-ws-muted">
          Update your resume, cover letter, and job-search preferences.
        </p>
      </header>

      <PillTabs
        data-testid="profile-tabs"
        options={[...PROFILE_TABS]}
        value={activeTab}
        onChange={(id) => setActiveTab(id as ProfileTabId)}
      />

      <div className="ws-card p-6 sm:p-8">
        <div className={activeTab === 'resume' ? undefined : 'hidden'}>
          <ProfileResumeTab ref={resumeRef} record={record} />
        </div>

        <div className={activeTab === 'about' ? undefined : 'hidden'}>
          <AboutYouStep
            ref={aboutRef}
            embedded
            hideFooter
            initialValue={aboutYou ?? undefined}
            onResidencyChange={setLiveResidency}
            onComplete={() => {}}
            onBack={() => {}}
          />
        </div>

        <div className={activeTab === 'targets' ? undefined : 'hidden'}>
          <TargetsStep
            key={`targets-${record.updated_at ?? ''}-${record.non_negotiables?.min_salary ?? ''}`}
            ref={targetsRef}
            embedded
            hideFooter
            requiresSponsorship={requiresSponsorship}
            initialValue={targetsInitial}
            onComplete={() => {}}
            onBack={() => {}}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          data-testid="profile-save-all"
          onClick={() => void handleSaveAll()}
          disabled={saving}
          className="inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 signal-gradient text-white shadow-sm hover:opacity-95"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>

      <Snackbar
        open={snackbar.open}
        message={snackbar.message}
        variant={snackbar.variant}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
      />
    </main>
  );
}
