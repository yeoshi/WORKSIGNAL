// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { NetworkCelebration } from './NetworkCelebration';

describe('NetworkCelebration', () => {
  it('renders celebration copy with company name', () => {
    render(<NetworkCelebration company="Grab" />);

    expect(screen.getByTestId('network-celebration')).toBeInTheDocument();
    expect(screen.getByText('Yay — you reached out to everyone!')).toBeInTheDocument();
    expect(screen.getByText(/Grab/)).toBeInTheDocument();
  });
});
