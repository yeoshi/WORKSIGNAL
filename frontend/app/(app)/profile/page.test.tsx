// @vitest-environment jsdom

import { forwardRef, useImperativeHandle } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ProfilePage from './page';
import { PRIORITY_FACTORS } from '@/app/types/shared';
import type { ProfileSectionHandle } from '../../onboarding/lib/profileSectionHandle';

const mockReplace = vi.fn();
const mockUseSession = vi.fn();
const mockResumeSave = vi.fn();
const mockAboutSave = vi.fn();
const mockTargetsSave = vi.fn();

vi.mock('next-auth/react', () => ({
  useSession: () => mockUseSession(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: vi.fn(),
  }),
}));

vi.mock('../../onboarding/api', () => ({
  fetchOnboardingState: vi.fn(),
}));

vi.mock('./components/ProfileResumeTab', () => ({
  ProfileResumeTab: forwardRef<ProfileSectionHandle>(function MockResumeTab(_props, ref) {
    useImperativeHandle(ref, () => ({
      validateAndSave: mockResumeSave,
    }));
    return <div data-testid="profile-resume-tab">Resume tab</div>;
  }),
}));

vi.mock('../../onboarding/steps/AboutYouStep', () => ({
  AboutYouStep: forwardRef<ProfileSectionHandle>(function MockAboutStep(_props, ref) {
    useImperativeHandle(ref, () => ({
      validateAndSave: mockAboutSave,
    }));
    return <div data-testid="about-tab">About tab</div>;
  }),
}));

vi.mock('../../onboarding/steps/TargetsStep', () => ({
  TargetsStep: forwardRef<ProfileSectionHandle>(function MockTargetsStep(_props, ref) {
    useImperativeHandle(ref, () => ({
      validateAndSave: mockTargetsSave,
    }));
    return <div data-testid="targets-tab">Targets tab</div>;
  }),
}));

import { fetchOnboardingState } from '../../onboarding/api';

const completeRecord = {
  resume_s3_key: 'resumes/user-1/Tan Yeo Shi Lee CV.pdf',
  career_stage: 'early_career' as const,
  residency_status: 'citizen' as const,
  profile: {
    current_role: 'Analyst',
    years_experience: 2,
    skills: [],
    target_roles: ['Product Manager'],
    priority_ranking: [...PRIORITY_FACTORS],
  },
  non_negotiables: {
    min_salary: 5000,
    employment_type: ['full_time' as const],
    work_arrangement: 'any' as const,
    custom: [],
    ep_sponsorship_required: false,
  },
};

describe('ProfilePage save all', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResumeSave.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 10)),
    );
    mockAboutSave.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 10)),
    );
    mockTargetsSave.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 10)),
    );
  });

  it('redirects unauthenticated users to the landing page', () => {
    mockUseSession.mockReturnValue({ status: 'unauthenticated' });

    render(<ProfilePage />);

    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('saves all sections and shows a success snackbar', async () => {
    mockUseSession.mockReturnValue({ status: 'authenticated' });
    vi.mocked(fetchOnboardingState).mockResolvedValue(completeRecord);

    render(<ProfilePage />);

    await screen.findByTestId('profile-page');

    fireEvent.click(screen.getByTestId('profile-save-all'));

    expect(screen.getByTestId('profile-save-all')).toHaveTextContent('Saving…');

    await waitFor(() => {
      expect(mockAboutSave).toHaveBeenCalled();
      expect(mockResumeSave).toHaveBeenCalled();
      expect(mockTargetsSave).toHaveBeenCalled();
      expect(screen.getByTestId('snackbar')).toHaveTextContent('Profile saved');
    });
  });

  it('switches to the failing tab and shows an error snackbar', async () => {
    mockUseSession.mockReturnValue({ status: 'authenticated' });
    vi.mocked(fetchOnboardingState).mockResolvedValue(completeRecord);
    mockAboutSave.mockResolvedValue({ ok: false, message: 'Select your career stage.' });

    render(<ProfilePage />);

    await screen.findByTestId('profile-page');

    fireEvent.click(screen.getByTestId('profile-tabs-targets'));
    fireEvent.click(screen.getByTestId('profile-save-all'));

    await waitFor(() => {
      expect(screen.getByTestId('snackbar')).toHaveTextContent(
        'Select your career stage.',
      );
      expect(screen.getByTestId('snackbar')).toHaveAttribute('data-variant', 'error');
    });
  });

  it('keeps all tabs mounted when switching', async () => {
    mockUseSession.mockReturnValue({ status: 'authenticated' });
    vi.mocked(fetchOnboardingState).mockResolvedValue(completeRecord);

    render(<ProfilePage />);

    await screen.findByTestId('profile-page');

    fireEvent.click(screen.getByTestId('profile-tabs-about'));

    expect(screen.getByTestId('profile-resume-tab')).toBeInTheDocument();
    expect(screen.getByTestId('about-tab')).toBeInTheDocument();
    expect(screen.getByTestId('targets-tab')).toBeInTheDocument();
  });
});
