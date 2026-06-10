// @vitest-environment jsdom

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TopBar } from './TopBar';

const mockSignOut = vi.fn();

vi.mock('next-auth/react', () => ({
  signOut: (...args: unknown[]) => mockSignOut(...args),
  useSession: () => ({
    data: { user: { name: 'Yeoshi Tan' } },
  }),
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    onClick?: () => void;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('../ui/Logo', () => ({
  Logo: () => <div data-testid="logo">Logo</div>,
}));

describe('TopBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows Profile link above Sign out in the settings menu', () => {
    render(<TopBar />);

    fireEvent.click(screen.getByLabelText('Settings menu'));

    const profileLink = screen.getByRole('link', { name: 'Profile' });
    const signOutButton = screen.getByRole('button', { name: 'Sign out' });

    expect(profileLink).toHaveAttribute('href', '/profile');
    expect(
      profileLink.compareDocumentPosition(signOutButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
