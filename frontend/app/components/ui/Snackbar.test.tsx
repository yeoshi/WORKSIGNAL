// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Snackbar } from './Snackbar';

describe('Snackbar', () => {
  it('renders the message when open', () => {
    render(
      <Snackbar
        open
        message="Profile saved"
        variant="success"
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByTestId('snackbar')).toHaveTextContent('Profile saved');
    expect(screen.getByTestId('snackbar')).toHaveAttribute('data-variant', 'success');
  });

  it('does not render when closed', () => {
    render(
      <Snackbar
        open={false}
        message="Profile saved"
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('snackbar')).not.toBeInTheDocument();
  });
});
