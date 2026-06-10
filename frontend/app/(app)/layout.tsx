import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { AppShell } from '../components/shell/AppShell';
import { getAuthenticatedUser } from '../api/lib/auth';
import { loadOnboardingUser } from '../api/lib/onboardingPersistence';
import {
  isOnboardingComplete,
  type OnboardingRecord,
} from '../onboarding/lib/onboardingStatus';

export default async function AuthenticatedLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getAuthenticatedUser();

  if (user) {
    let isComplete = false;
    try {
      const record = await loadOnboardingUser(user.userId);
      isComplete = isOnboardingComplete(record as OnboardingRecord | null);
    } catch (error) {
      console.error('Onboarding check failed:', error);
      isComplete = false;
    }

    if (!isComplete) {
      redirect('/onboarding');
    }
  }

  return <AppShell>{children}</AppShell>;
}
