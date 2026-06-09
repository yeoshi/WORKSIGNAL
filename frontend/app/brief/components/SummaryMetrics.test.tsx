// @vitest-environment jsdom
/**
 * Component tests for SummaryMetrics (Req 21.5).
 *
 * Verifies the Weekly Brief displays:
 * - Applications sent count
 * - Callbacks received count
 * - Callback rate percentage
 */

import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SummaryMetrics } from './SummaryMetrics';
import type { RecalibrationMetrics } from '@worksignal/shared';

const mockMetrics: RecalibrationMetrics = {
    applications_sent: 12,
    callbacks: 3,
    rejections: 2,
    ghosted: 5,
    callback_rate: 0.25,
};

describe('SummaryMetrics', () => {
    it('renders applications sent', () => {
        render(<SummaryMetrics metrics={mockMetrics} />);
        expect(screen.getByTestId('metric-applications-sent')).toHaveTextContent('12');
    });

    it('renders callbacks received', () => {
        render(<SummaryMetrics metrics={mockMetrics} />);
        expect(screen.getByTestId('metric-callbacks')).toHaveTextContent('3');
    });

    it('renders callback rate as percentage', () => {
        render(<SummaryMetrics metrics={mockMetrics} />);
        expect(screen.getByTestId('metric-callback-rate')).toHaveTextContent('25.0%');
    });

    it('renders zero callbacks correctly', () => {
        const zeroMetrics: RecalibrationMetrics = {
            ...mockMetrics,
            callbacks: 0,
            callback_rate: 0,
        };
        render(<SummaryMetrics metrics={zeroMetrics} />);
        expect(screen.getByTestId('metric-callbacks')).toHaveTextContent('0');
        expect(screen.getByTestId('metric-callback-rate')).toHaveTextContent('0.0%');
    });
});
