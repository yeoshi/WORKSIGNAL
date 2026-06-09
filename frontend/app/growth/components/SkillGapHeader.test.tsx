// @vitest-environment jsdom
/**
 * Component tests for SkillGapHeader (Req 19.5).
 *
 * Verifies the Growth roadmap view renders:
 * - Identified skill gap name
 * - Projected match-score improvement
 * - Optional "times flagged" context
 */

import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SkillGapHeader } from './SkillGapHeader';

describe('SkillGapHeader', () => {
    it('renders the skill name', () => {
        render(
            <SkillGapHeader
                skill="TypeScript"
                projectedMatchImprovement="74% -> 89%"
            />
        );

        expect(screen.getByTestId('skill-gap-name')).toHaveTextContent('TypeScript');
    });

    it('renders the projected match-score improvement', () => {
        render(
            <SkillGapHeader
                skill="React"
                projectedMatchImprovement="60% -> 82%"
            />
        );

        expect(screen.getByTestId('projected-improvement-value')).toHaveTextContent('60% -> 82%');
    });

    it('renders times flagged when provided', () => {
        render(
            <SkillGapHeader
                skill="AWS"
                projectedMatchImprovement="50% -> 75%"
                timesFlagged={5}
            />
        );

        expect(screen.getByTestId('times-flagged')).toHaveTextContent('Flagged across 5 jobs');
    });

    it('does not render times flagged when not provided', () => {
        render(
            <SkillGapHeader
                skill="Docker"
                projectedMatchImprovement="40% -> 65%"
            />
        );

        expect(screen.queryByTestId('times-flagged')).not.toBeInTheDocument();
    });

    it('renders singular "job" for timesFlagged = 1', () => {
        render(
            <SkillGapHeader
                skill="Kubernetes"
                projectedMatchImprovement="55% -> 70%"
                timesFlagged={1}
            />
        );

        expect(screen.getByTestId('times-flagged')).toHaveTextContent('Flagged across 1 job');
    });
});
