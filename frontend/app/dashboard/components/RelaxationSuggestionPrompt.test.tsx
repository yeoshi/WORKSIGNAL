/**
 * @vitest-environment jsdom
 */

/**
 * Component tests for RelaxationSuggestionPrompt.
 *
 * Validates:
 * - Req 9.6: WORKSIGNAL derives a Filter_Relaxation_Suggestion and presents it
 *   to the user with rationale/evidence.
 * - Req 9.7: Apply the suggested adjustment only after the user explicitly approves.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RelaxationSuggestionPrompt } from './RelaxationSuggestionPrompt';
import type { Filter_Relaxation_Suggestion } from '@worksignal/shared';

function makePendingSuggestion(
    overrides?: Partial<Filter_Relaxation_Suggestion>,
): Filter_Relaxation_Suggestion {
    return {
        suggestion_id: 'sug-001',
        user_id: 'user-123',
        created_at: '2024-06-01T00:00:00Z',
        scan_run_id: 'run-abc',
        target_non_negotiable: 'min_salary',
        current_value: 7000,
        proposed_value: 5600,
        rationale: '8 of 12 scanned jobs would pass with a lower salary threshold.',
        evidence_job_ids: ['job-1', 'job-2', 'job-3'],
        approval_state: 'pending',
        ...overrides,
    };
}

describe('RelaxationSuggestionPrompt', () => {
    describe('Req 9.6 — Suggestion rendering with rationale and evidence', () => {
        it('renders the suggestion rationale text', () => {
            const suggestion = makePendingSuggestion();
            render(
                <RelaxationSuggestionPrompt
                    suggestion={suggestion}
                    onApprove={vi.fn()}
                    onReject={vi.fn()}
                />,
            );

            expect(
                screen.getByText(
                    '8 of 12 scanned jobs would pass with a lower salary threshold.',
                ),
            ).toBeTruthy();
        });

        it('renders the current and proposed values', () => {
            const suggestion = makePendingSuggestion({
                current_value: 7000,
                proposed_value: 5600,
            });
            render(
                <RelaxationSuggestionPrompt
                    suggestion={suggestion}
                    onApprove={vi.fn()}
                    onReject={vi.fn()}
                />,
            );

            const currentEl = screen.getByTestId('relaxation-current-value');
            const proposedEl = screen.getByTestId('relaxation-proposed-value');
            expect(currentEl.textContent).toBe('7000');
            expect(proposedEl.textContent).toBe('5600');
        });

        it('renders the target non-negotiable label', () => {
            const suggestion = makePendingSuggestion({
                target_non_negotiable: 'work_arrangement',
            });
            render(
                <RelaxationSuggestionPrompt
                    suggestion={suggestion}
                    onApprove={vi.fn()}
                    onReject={vi.fn()}
                />,
            );

            expect(screen.getByText('Work arrangement')).toBeTruthy();
        });

        it('renders evidence job count when evidence exists', () => {
            const suggestion = makePendingSuggestion({
                evidence_job_ids: ['j1', 'j2', 'j3', 'j4', 'j5'],
            });
            render(
                <RelaxationSuggestionPrompt
                    suggestion={suggestion}
                    onApprove={vi.fn()}
                    onReject={vi.fn()}
                />,
            );

            expect(screen.getByText('Based on 5 scanned jobs.')).toBeTruthy();
        });

        it('does not render evidence line when no evidence job ids', () => {
            const suggestion = makePendingSuggestion({ evidence_job_ids: [] });
            render(
                <RelaxationSuggestionPrompt
                    suggestion={suggestion}
                    onApprove={vi.fn()}
                    onReject={vi.fn()}
                />,
            );

            expect(screen.queryByText(/Based on \d+ scanned/)).toBeNull();
        });
    });

    describe('Req 9.7 — Approve/Reject interactions', () => {
        it('calls onApprove with suggestion_id when Approve is clicked', async () => {
            const onApprove = vi.fn();
            const suggestion = makePendingSuggestion();
            render(
                <RelaxationSuggestionPrompt
                    suggestion={suggestion}
                    onApprove={onApprove}
                    onReject={vi.fn()}
                />,
            );

            fireEvent.click(screen.getByRole('button', { name: /approve/i }));

            await waitFor(() => {
                expect(onApprove).toHaveBeenCalledWith('sug-001');
            });
        });

        it('calls onReject with suggestion_id when Reject is clicked', async () => {
            const onReject = vi.fn();
            const suggestion = makePendingSuggestion();
            render(
                <RelaxationSuggestionPrompt
                    suggestion={suggestion}
                    onApprove={vi.fn()}
                    onReject={onReject}
                />,
            );

            fireEvent.click(screen.getByRole('button', { name: /reject/i }));

            await waitFor(() => {
                expect(onReject).toHaveBeenCalledWith('sug-001');
            });
        });

        it('does not render approve/reject buttons for already-approved suggestions', () => {
            const suggestion = makePendingSuggestion({ approval_state: 'approved' });
            render(
                <RelaxationSuggestionPrompt
                    suggestion={suggestion}
                    onApprove={vi.fn()}
                    onReject={vi.fn()}
                />,
            );

            expect(screen.queryByRole('button', { name: /approve/i })).toBeNull();
            expect(screen.queryByRole('button', { name: /reject/i })).toBeNull();
            expect(
                screen.getByTestId('relaxation-resolved-state').textContent,
            ).toContain('Approved');
        });

        it('does not render approve/reject buttons for rejected suggestions', () => {
            const suggestion = makePendingSuggestion({ approval_state: 'rejected' });
            render(
                <RelaxationSuggestionPrompt
                    suggestion={suggestion}
                    onApprove={vi.fn()}
                    onReject={vi.fn()}
                />,
            );

            expect(screen.queryByRole('button', { name: /approve/i })).toBeNull();
            expect(screen.queryByRole('button', { name: /reject/i })).toBeNull();
            expect(
                screen.getByTestId('relaxation-resolved-state').textContent,
            ).toContain('unchanged');
        });

        it('non-negotiables remain unchanged while pending (buttons present, no mutation)', () => {
            const suggestion = makePendingSuggestion({ approval_state: 'pending' });
            const onApprove = vi.fn();
            const onReject = vi.fn();
            render(
                <RelaxationSuggestionPrompt
                    suggestion={suggestion}
                    onApprove={onApprove}
                    onReject={onReject}
                />,
            );

            // While pending, the current value is still displayed (non-negotiables unchanged)
            const currentEl = screen.getByTestId('relaxation-current-value');
            expect(currentEl.textContent).toBe('7000');

            // Buttons are rendered — the user can choose but nothing mutates yet
            expect(screen.getByRole('button', { name: /approve/i })).toBeTruthy();
            expect(screen.getByRole('button', { name: /reject/i })).toBeTruthy();

            // Neither handler has been called (non-negotiables unchanged until explicit action)
            expect(onApprove).not.toHaveBeenCalled();
            expect(onReject).not.toHaveBeenCalled();
        });
    });
});
