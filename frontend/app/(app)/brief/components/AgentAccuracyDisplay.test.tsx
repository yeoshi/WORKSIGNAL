// @vitest-environment jsdom
/**
 * Component tests for AgentAccuracyDisplay (Req 21.5).
 *
 * Verifies the per-agent accuracy section renders all 4 agents
 * with their correct/total counts and accuracy percentages.
 */

import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { AgentAccuracyDisplay } from './AgentAccuracyDisplay';
import type { AgentName, AgentAccuracy } from '@worksignal/shared';

const mockPerformance: Record<AgentName, AgentAccuracy> = {
    ambition: { correct: 8, incorrect: 2 },
    realism: { correct: 7, incorrect: 3 },
    risk: { correct: 9, incorrect: 1 },
    opportunity: { correct: 6, incorrect: 4 },
};

describe('AgentAccuracyDisplay', () => {
    it('renders all four agent accuracy cards', () => {
        render(<AgentAccuracyDisplay agentPerformance={mockPerformance} />);

        expect(screen.getByTestId('agent-accuracy-ambition')).toBeInTheDocument();
        expect(screen.getByTestId('agent-accuracy-realism')).toBeInTheDocument();
        expect(screen.getByTestId('agent-accuracy-risk')).toBeInTheDocument();
        expect(screen.getByTestId('agent-accuracy-opportunity')).toBeInTheDocument();
    });

    it('renders correct accuracy percentages', () => {
        render(<AgentAccuracyDisplay agentPerformance={mockPerformance} />);

        // ambition: 8/10 = 80%
        expect(screen.getByTestId('agent-accuracy-ambition')).toHaveTextContent('80%');
        // realism: 7/10 = 70%
        expect(screen.getByTestId('agent-accuracy-realism')).toHaveTextContent('70%');
        // risk: 9/10 = 90%
        expect(screen.getByTestId('agent-accuracy-risk')).toHaveTextContent('90%');
        // opportunity: 6/10 = 60%
        expect(screen.getByTestId('agent-accuracy-opportunity')).toHaveTextContent('60%');
    });

    it('renders correct/total evaluation counts', () => {
        render(<AgentAccuracyDisplay agentPerformance={mockPerformance} />);

        expect(screen.getByTestId('agent-accuracy-ambition')).toHaveTextContent(
            '8 correct / 10 total evaluations'
        );
        expect(screen.getByTestId('agent-accuracy-risk')).toHaveTextContent(
            '9 correct / 10 total evaluations'
        );
    });

    it('handles zero evaluations gracefully', () => {
        const zeroPerf: Record<AgentName, AgentAccuracy> = {
            ambition: { correct: 0, incorrect: 0 },
            realism: { correct: 0, incorrect: 0 },
            risk: { correct: 0, incorrect: 0 },
            opportunity: { correct: 0, incorrect: 0 },
        };
        render(<AgentAccuracyDisplay agentPerformance={zeroPerf} />);

        expect(screen.getByTestId('agent-accuracy-ambition')).toHaveTextContent('0%');
        expect(screen.getByTestId('agent-accuracy-ambition')).toHaveTextContent(
            '0 correct / 0 total evaluations'
        );
    });
});
