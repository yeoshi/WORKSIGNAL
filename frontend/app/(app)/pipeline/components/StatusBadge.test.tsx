/**
 * @vitest-environment jsdom
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from './StatusBadge';
import type { ApplicationStatus } from '@/app/types/shared';

/**
 * Validates: Requirements 17.1
 *
 * StatusBadge renders the correct label and styling for every
 * ApplicationStatus value.
 */
describe('StatusBadge', () => {
    const statusLabelMap: Record<ApplicationStatus, string> = {
        sent: 'Sent',
        opened: 'Opened',
        callback: 'Callback',
        rejected: 'Rejected',
        ghosted: 'Ghosted',
        redirected_external: 'Redirected',
        needs_review: 'Needs review',
        delivery_failed: 'Delivery failed',
    };

    const allStatuses: ApplicationStatus[] = [
        'sent',
        'opened',
        'callback',
        'rejected',
        'ghosted',
        'redirected_external',
        'needs_review',
        'delivery_failed',
    ];

    it.each(allStatuses)('renders correct label for status "%s"', (status) => {
        render(<StatusBadge status={status} />);
        const badge = screen.getByTestId('status-badge');
        expect(badge).toBeDefined();
        expect(badge.textContent).toBe(statusLabelMap[status]);
    });

    it.each(allStatuses)('sets data-status attribute for status "%s"', (status) => {
        render(<StatusBadge status={status} />);
        const badge = screen.getByTestId('status-badge');
        expect(badge.getAttribute('data-status')).toBe(status);
    });

    it('renders as an inline-flex span with rounded-full styling', () => {
        render(<StatusBadge status="sent" />);
        const badge = screen.getByTestId('status-badge');
        expect(badge.tagName.toLowerCase()).toBe('span');
        expect(badge.className).toContain('inline-flex');
        expect(badge.className).toContain('rounded-full');
    });

    it('applies colour classes appropriate to the status', () => {
        render(<StatusBadge status="callback" />);
        const badge = screen.getByTestId('status-badge');
        // callback uses green colouring
        expect(badge.className).toContain('text-green-700');
        expect(badge.className).toContain('bg-green-50');
    });

    it('applies different colour classes for rejected status', () => {
        render(<StatusBadge status="rejected" />);
        const badge = screen.getByTestId('status-badge');
        expect(badge.className).toContain('text-red-700');
        expect(badge.className).toContain('bg-red-50');
    });
});
