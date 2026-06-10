// @vitest-environment jsdom

import { createRef } from 'react';
import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AboutYouStep } from './AboutYouStep';
import type { ProfileSectionHandle } from '../lib/profileSectionHandle';

vi.mock('../api', () => ({
  saveCareerProfile: vi.fn(),
}));

describe('AboutYouStep ref API', () => {
  it('returns validation error from validateAndSave when fields are missing', async () => {
    const ref = createRef<ProfileSectionHandle>();

    render(
      <AboutYouStep
        ref={ref}
        hideFooter
        onComplete={() => {}}
        onBack={() => {}}
      />,
    );

    const result = await ref.current?.validateAndSave();

    expect(result).toEqual({
      ok: false,
      message: 'Select your career stage.',
    });
  });

  it('persists when validateAndSave succeeds', async () => {
    const { saveCareerProfile } = await import('../api');
    vi.mocked(saveCareerProfile).mockResolvedValue({ ok: true });

    const ref = createRef<ProfileSectionHandle>();

    render(
      <AboutYouStep
        ref={ref}
        hideFooter
        initialValue={{
          career_stage: 'early_career',
          residency_status: 'citizen',
        }}
        onComplete={() => {}}
        onBack={() => {}}
      />,
    );

    const result = await ref.current?.validateAndSave();

    await waitFor(() => {
      expect(result).toEqual({ ok: true });
      expect(saveCareerProfile).toHaveBeenCalled();
    });
  });
});
