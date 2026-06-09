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

    it('renders prior and new values', () => {
        render(<ThresholdAdjustments adjustments={mockAdjustments} />);
        const priorValues = screen.getAllByTestId('prior-value');
        const newValues = screen.getAllByTestId('new-value');

        expect(priorValues[0]).toHaveTextContent('80');
        expect(newValues[0]).toHaveTextContent('75');
        expect(priorValues[1]).toHaveTextContent('0.8');
        expect(newValues[1]).toHaveTextContent('0.6');
    });

    it('renders agent labels and parameters', () => {
        render(<ThresholdAdjustments adjustments={mockAdjustments} />);
        expect(screen.getByText('Realism')).toBeInTheDocument();
        expect(screen.getByText('match_threshold')).toBeInTheDocument();
        expect(screen.getByText('Risk')).toBeInTheDocument();
        expect(screen.getByText('red_flag_weight')).toBeInTheDocument();
    });

    it('renders adjustment reasons', () => {
        render(<ThresholdAdjustments adjustments={mockAdjustments} />);
        expect(
            screen.getByText('Callback rate below 5% for two consecutive weeks')
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
