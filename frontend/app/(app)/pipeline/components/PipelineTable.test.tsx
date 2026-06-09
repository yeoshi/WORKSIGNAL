/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PipelineTable } from './PipelineTable';
import type { Application } from '@worksignal/shared';

/**
 * Validates: Requirements 17.1
 *
 * PipelineTable renders each application's company, role, sent date, and
 * status in a tabular layout.
 */

function makeApplication(overrides: Partial<Application> = {}): Application {
    return {
        application_id: 'app-001',
        user_id: 'user-001',
        job_id: 'job-001',
        verdict_id: 'verdict-001',
        company: 'Acme Corp',
        role_title: 'Software Engineer',
        customised_resume_s3_key: 's3://bucket/resume.pdf',
        customisation_applied: true,
        cover_letter_text: 'Dear hiring manager...',
        sent_at: '2024-06-15T10:00:00.000Z',
        recipient_email: 'hr@acme.com',
        email_thread_id: 'thread-001',
        status: 'sent',
        redirect_source_url: null,
        redirected_at: null,
        status_updated_at: '2024-06-15T10:00:00.000Z',
        classification_confidence: 0,
        ...overrides,
    };
}

describe('PipelineTable', () => {
    it('shows loading indicator when loading with no data', () => {
        render(<PipelineTable applications={[]} isLoading={true} />);
        expect(screen.getByTestId('pipeline-loading')).toBeDefined();
        expect(screen.getByTestId('pipeline-loading').textContent).toContain(
            'Loading your pipeline'
        );
    });

    it('shows empty state when no applications and not loading', () => {
        render(<PipelineTable applications={[]} isLoading={false} />);
        expect(screen.getByTestId('pipeline-empty')).toBeDefined();
        expect(screen.getByTestId('pipeline-empty').textContent).toContain(
            'No applications yet'
        );
    });

    it('renders a table with Company, Role, Sent, and Status columns', () => {
        const app = makeApplication();
        render(<PipelineTable applications={[app]} />);

        const table = screen.getByTestId('pipeline-table');
        expect(table).toBeDefined();

        // Verify column headers
        const headers = table.querySelectorAll('th');
        const headerTexts = Array.from(headers).map((h) => h.textContent?.trim());
        expect(headerTexts).toContain('Company');
        expect(headerTexts).toContain('Role');
        expect(headerTexts).toContain('Sent');
        expect(headerTexts).toContain('Status');
    });

    it('renders application company and role title in table cells', () => {
        const app = makeApplication({
            company: 'Google Singapore',
            role_title: 'Frontend Developer',
        });
        render(<PipelineTable applications={[app]} />);

        const row = screen.getByTestId('pipeline-row');
        expect(row.textContent).toContain('Google Singapore');
        expect(row.textContent).toContain('Frontend Developer');
    });

    it('renders formatted sent date (short month day)', () => {
        const app = makeApplication({ sent_at: '2024-03-20T08:30:00.000Z' });
        render(<PipelineTable applications={[app]} />);

        const row = screen.getByTestId('pipeline-row');
        expect(row.textContent).toMatch(/20 Mar/);
    });

    it('renders a status badge for each application', () => {
        const app = makeApplication({ status: 'callback' });
        render(<PipelineTable applications={[app]} />);

        const badge = screen.getByTestId('status-badge');
        expect(badge.textContent).toBe('Callback');
        expect(badge.getAttribute('data-status')).toBe('callback');
    });

    it('renders multiple rows for multiple applications', () => {
        const apps = [
            makeApplication({ application_id: 'app-1', company: 'Company A' }),
            makeApplication({ application_id: 'app-2', company: 'Company B' }),
            makeApplication({ application_id: 'app-3', company: 'Company C' }),
        ];
        render(<PipelineTable applications={apps} />);

        const rows = screen.getAllByTestId('pipeline-row');
        expect(rows.length).toBe(3);
    });

    it('calls onRowSelect when a row is clicked', () => {
        const app = makeApplication();
        const onRowSelect = vi.fn();
        render(<PipelineTable applications={[app]} onRowSelect={onRowSelect} />);

        const row = screen.getByTestId('pipeline-row');
        fireEvent.click(row);
        expect(onRowSelect).toHaveBeenCalledWith(app);
    });

    it('supports keyboard activation with Enter key', () => {
        const app = makeApplication();
        const onRowSelect = vi.fn();
        render(<PipelineTable applications={[app]} onRowSelect={onRowSelect} />);

        const row = screen.getByTestId('pipeline-row');
        fireEvent.keyDown(row, { key: 'Enter' });
        expect(onRowSelect).toHaveBeenCalledWith(app);
    });
});
