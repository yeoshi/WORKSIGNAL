// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import OnboardingPage from './page';

const mockReplace = vi.fn();
const mockPush = vi.fn();
const mockUseSession = vi.fn();

vi.mock('next-auth/react', () => ({
  useSession: () => mockUseSession(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: mockPush,
  }),
}));

vi.mock('./api', () => ({
  fetchOnboardingState: vi.fn(),
}));

vi.mock('./steps/ResumeUploadStep', () => ({
  ResumeUploadStep: () => <div data-testid="resume-step">Resume step</div>,
}));

vi.mock('./steps/AboutYouStep', () => ({
  AboutYouStep: () => <div data-testid="about-step">About step</div>,
}));

vi.mock('./steps/TargetsStep', () => ({
  TargetsStep: () => <div data-testid="targets-step">Targets step</div>,
}));

import { fetchOnboardingState } from './api';

describe('OnboardingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects unauthenticated users to the landing page', () => {
    mockUseSession.mockReturnValue({ status: 'unauthenticated' });

    render(<OnboardingPage />);

    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('starts on the resume step for a fresh user', async () => {
    mockUseSession.mockReturnValue({ status: 'authenticated' });
    vi.mocked(fetchOnboardingState).mockResolvedValue(null);

    render(<OnboardingPage />);

    expect(await screen.findByTestId('resume-step')).toBeInTheDocument();
    expect(screen.getByText('Resume')).toBeInTheDocument();
  });

  it('redirects completed users to the dashboard', async () => {
    mockUseSession.mockReturnValue({ status: 'authenticated' });
    vi.mocked(fetchOnboardingState).mockResolvedValue({
      career_stage: 'early_career',
      residency_status: 'citizen',
      profile: {
        target_roles: ['Product Manager'],
        priority_ranking: [
          'salary',
          'growth',
          'balance',
          'brand',
          'purpose',
          'stability',
        ],
      },
      non_negotiables: {
        min_salary: 5000,
        employment_type: ['full_time'],
        work_arrangement: 'any',
        custom: [],
        ep_sponsorship_required: false,
      },
    });

    render(<OnboardingPage />);

    await vi.waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/dashboard');
    });
  });
});
