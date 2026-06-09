// @vitest-environment jsdom

import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NetworkView } from './NetworkView';
import { loadArchivedCompanies } from '../lib/networkStorage';

vi.mock('../lib/fetchNetwork', () => ({
  fetchNetworkOnce: vi.fn(),
}));

vi.mock('../../../lib/confetti', () => ({
  fireCelebrationConfetti: vi.fn(),
}));

import { fetchNetworkOnce } from '../lib/fetchNetwork';
import { fireCelebrationConfetti } from '../../../lib/confetti';

const mockNetworkData = {
  company: 'Grab',
  application_count: 2,
  suggestionSet: {
    company: 'Grab',
    suggestions: [
      { name: 'Li Wei', type: 'alumni' as const, context: 'PM', outreach_draft: 'Hi' },
      { name: 'Sarah Koh', type: 'community' as const, context: 'PM', outreach_draft: 'Hi' },
    ],
    upcoming_events: [],
  },
};

const companyItems = [
  { company: 'Grab', application_count: 2, suggestion_count: 2 },
];

async function resolveNetwork() {
  await act(async () => {
    await Promise.resolve();
  });
}

async function reachOutToAll() {
  const checkboxes = screen.getAllByRole('checkbox');
  fireEvent.click(checkboxes[0]!);
  await act(async () => {});
  fireEvent.click(checkboxes[1]!);
  await act(async () => {});
}

describe('NetworkView celebration', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.mocked(fetchNetworkOnce).mockResolvedValue(mockNetworkData);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('shows confetti and celebration when all connections are reached out', async () => {
    render(<NetworkView companyItems={companyItems} />);
    await resolveNetwork();
    await reachOutToAll();

    expect(screen.getByTestId('network-celebration')).toBeInTheDocument();
    expect(screen.getByText('Yay — you reached out to everyone!')).toBeInTheDocument();
    expect(screen.getByText(/Archiving/)).toHaveTextContent('Grab');
    expect(fireCelebrationConfetti).toHaveBeenCalled();
  });

  it('archives company after celebration delay', async () => {
    render(<NetworkView companyItems={companyItems} />);
    await resolveNetwork();
    await reachOutToAll();

    await act(async () => {
      vi.advanceTimersByTime(2500);
    });

    expect(loadArchivedCompanies()).toEqual(new Set(['Grab']));
    expect(screen.queryByTestId('network-celebration')).not.toBeInTheDocument();
  });

  it('clears celebration when last reach-out is undone', async () => {
    render(<NetworkView companyItems={companyItems} />);
    await resolveNetwork();
    await reachOutToAll();

    expect(screen.getByTestId('network-celebration')).toBeInTheDocument();

    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[1]!);
    await act(async () => {});

    expect(screen.queryByTestId('network-celebration')).not.toBeInTheDocument();
  });
});
