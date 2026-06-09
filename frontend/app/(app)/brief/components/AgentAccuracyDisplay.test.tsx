// @vitest-environment jsdom
/**
 * Component tests for AgentAccuracyDisplay (Req 21.5).
 *
 * Verifies the per-agent accuracy section renders all 4 agents
 * with their correct/total counts and accuracy percentages.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { AgentAccuracyDisplay } from './AgentAccuracyDisplay';
import type { AgentName, AgentAccuracy } from '@worksignal/shared';
import type { BriefGrowthActivity, BriefNetworkActivity } from '../lib/briefTypes';

const mockPerformance: Record<AgentName, AgentAccuracy> = {
    ambition: { correct: 8, incorrect: 2 },
    realism: { correct: 7, incorrect: 3 },
    risk: { correct: 9, incorrect: 1 },
    opportunity: { correct: 6, incorrect: 4 },
};

describe('AgentAccuracyDisplay', () => {
    it('renders agent names with Agent suffix', () => {
        render(<AgentAccuracyDisplay agentPerformance={mockPerformance} />);

        expect(screen.getByText('Ambition Agent')).toBeInTheDocument();
        expect(screen.getByText('Realism Agent')).toBeInTheDocument();
        expect(screen.getByText('Risk Agent')).toBeInTheDocument();
        expect(screen.getByText('Opportunity Agent')).toBeInTheDocument();
    });

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

    it('renders one collapsible Growth Agent card when growth activities exist', () => {
        const growth: BriefGrowthActivity[] = [
            {
                skill: 'SQL & Data Analysis',
                times_flagged: 3,
                projected_match_improvement: '61% → 79%',
                reason: 'Realism Agent flagged this skill gap across 3 distinct job matches.',
                summary: 'Built a four-week roadmap with linked resources.',
            },
        ];

        render(
            <AgentAccuracyDisplay
                agentPerformance={mockPerformance}
                growthActivities={growth}
            />
        );

        expect(screen.getByTestId('agent-activity-growth')).toBeInTheDocument();
        expect(screen.getByText('Growth Agent')).toBeInTheDocument();
        expect(screen.getByText(/1 roadmap built/)).toBeInTheDocument();
        expect(
            screen.queryByText('Built a four-week roadmap with linked resources.')
        ).not.toBeVisible();

        fireEvent.click(screen.getByText('Growth Agent'));

        expect(
            screen.getByText('Built a four-week roadmap with linked resources.')
        ).toBeVisible();
    });

    it('renders one collapsible Network Agent card when network activities exist', () => {
        const network: BriefNetworkActivity[] = [
            {
                company: 'Grab',
                application_count: 2,
                suggestion_count: 3,
                reason: 'You sent 2 applications to Grab this week.',
                summary: 'Drafted 3 personalised outreach messages.',
            },
        ];

        render(
            <AgentAccuracyDisplay
                agentPerformance={mockPerformance}
                networkActivities={network}
            />
        );

        expect(screen.getByTestId('agent-activity-network')).toBeInTheDocument();
        expect(screen.getByText('Network Agent')).toBeInTheDocument();
        expect(screen.getByText(/3 suggestions drafted/)).toBeInTheDocument();

        fireEvent.click(screen.getByText('Network Agent'));

        expect(screen.getByText('Drafted 3 personalised outreach messages.')).toBeVisible();
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
