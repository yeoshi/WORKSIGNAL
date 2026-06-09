// @vitest-environment jsdom
/**
 * Component tests for ThresholdAdjustments (Req 21.5).
 *
 * Verifies:
 * - Adjustment items render with agent, parameter, old/new values, reason
 * - Empty state message when no adjustments
 */

import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ThresholdAdjustments } from './ThresholdAdjustments';
import type { RecalibrationAdjustment } from '@worksignal/shared';

const mockAdjustments: RecalibrationAdjustment[] = [
    {
        agent: 'realism',
        parameter: 'match_threshold',
        old_value: 80,
        new_value: 75,
        reason: 'Callback rate below 5% for two consecutive weeks',
    },
    {
        agent: 'risk',
        parameter: 'red_flag_weight',
        old_value: '0.8',
        new_value: '0.6',
        reason: 'Too many false positives on risk flags',
    },
];

describe('ThresholdAdjustments', () => {
    it('renders all adjustment items', () => {
        render(<ThresholdAdjustments adjustments={mockAdjustments} />);
        const items = screen.getAllByTestId('threshold-adjustment-item');
        expect(items).toHaveLength(2);
    });

    it('renders agent labels and threshold values visually', () => {
        render(<ThresholdAdjustments adjustments={mockAdjustments} />);
        const items = screen.getAllByTestId('threshold-adjustment-item');

        expect(screen.getByText('Realism Agent')).toBeInTheDocument();
        expect(screen.getByText('Risk Agent')).toBeInTheDocument();
        expect(screen.getByText('Match threshold')).toBeInTheDocument();
        expect(screen.getByText('Red flag weight')).toBeInTheDocument();
        expect(items[0]).toHaveTextContent('80');
        expect(items[0]).toHaveTextContent('75');
        expect(items[1]).toHaveTextContent('80%');
        expect(items[1]).toHaveTextContent('60%');
    });

    it('renders plain-English adjustment summaries', () => {
        render(<ThresholdAdjustments adjustments={mockAdjustments} />);
        expect(
            screen.getByText(/Realism Agent was filtering out too many matches/)
        ).toBeInTheDocument();
        expect(
            screen.getByText('Too many false positives on risk flags')
        ).toBeInTheDocument();
    });

    it('renders empty state when no adjustments', () => {
        render(<ThresholdAdjustments adjustments={[]} />);
        expect(screen.getByTestId('no-adjustments')).toHaveTextContent(
            'No threshold adjustments this week'
        );
    });

    it('does not render adjustment items in empty state', () => {
        render(<ThresholdAdjustments adjustments={[]} />);
        expect(screen.queryByTestId('threshold-adjustment-item')).not.toBeInTheDocument();
    });
});
