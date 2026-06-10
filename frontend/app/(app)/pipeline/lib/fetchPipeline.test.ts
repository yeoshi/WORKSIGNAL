/**
 * @vitest-environment node
 */

import { describe, it, expect, vi } from 'vitest';
import { loadPipelineWithRetry } from './fetchPipeline';
import type { Application } from '@/app/types/shared';

/**
 * Validates: Requirements 17.2
 *
 * If pipeline fails to load, retry automatically in the background without
 * notifying the user.
 */

function makeApplication(overrides: Partial<Application> = {}): Application {
    return {
        application_id: 'app-001',
        user_id: 'user-001',
        job_id: 'job-001',
        verdict_id: 'verdict-001',
        company: 'TestCo',
        role_title: 'Engineer',
        customised_resume_s3_key: 's3://bucket/resume.pdf',
        customisation_applied: true,
        cover_letter_text: 'Cover letter',
        sent_at: '2024-06-15T10:00:00.000Z',
        recipient_email: 'hr@testco.com',
        email_thread_id: 'thread-001',
        status: 'sent',
        redirect_source_url: null,
        redirected_at: null,
        status_updated_at: '2024-06-15T10:00:00.000Z',
        classification_confidence: 0,
        ...overrides,
    };
}

describe('loadPipelineWithRetry', () => {
    it('calls onSuccess with applications on first successful fetch', async () => {
        const apps = [makeApplication()];
        const fetcher = vi.fn().mockResolvedValue(apps);
        const onSuccess = vi.fn();

        await loadPipelineWithRetry({
            fetcher,
            onSuccess,
            delay: () => Promise.resolve(),
        });

        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(onSuccess).toHaveBeenCalledWith(apps);
    });

    it('retries silently after failure and eventually succeeds', async () => {
        const apps = [makeApplication()];
        const fetcher = vi
            .fn()
            .mockRejectedValueOnce(new Error('Network error'))
            .mockRejectedValueOnce(new Error('Timeout'))
            .mockResolvedValueOnce(apps);

        const onSuccess = vi.fn();
        const onAttemptError = vi.fn();

        await loadPipelineWithRetry({
            fetcher,
            onSuccess,
            onAttemptError,
            delay: () => Promise.resolve(),
        });

        expect(fetcher).toHaveBeenCalledTimes(3);
        expect(onAttemptError).toHaveBeenCalledTimes(2);
        expect(onSuccess).toHaveBeenCalledWith(apps);
    });

    it('never throws — failures are swallowed silently (Req 17.2)', async () => {
        const fetcher = vi.fn().mockRejectedValue(new Error('Always fails'));
        const onSuccess = vi.fn();

        // With maxAttempts, it gives up silently without throwing
        await expect(
            loadPipelineWithRetry({
                fetcher,
                onSuccess,
                maxAttempts: 3,
                delay: () => Promise.resolve(),
            })
        ).resolves.toBeUndefined();

        expect(onSuccess).not.toHaveBeenCalled();
    });

    it('stops retrying when cancelled', async () => {
        let attempt = 0;
        const fetcher = vi.fn().mockImplementation(() => {
            attempt++;
            return Promise.reject(new Error(`Fail ${attempt}`));
        });

        const onSuccess = vi.fn();
        let cancelled = false;

        await loadPipelineWithRetry({
            fetcher,
            onSuccess,
            isCancelled: () => cancelled,
            maxAttempts: 10,
            delay: async () => {
                // Cancel after the first retry delay
                cancelled = true;
            },
        });

        // Should have attempted once, then waited (during which we set cancelled),
        // then stopped without more attempts
        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(onSuccess).not.toHaveBeenCalled();
    });

    it('does not call onSuccess if cancelled between fetch and callback', async () => {
        const apps = [makeApplication()];
        let cancelled = false;
        const fetcher = vi.fn().mockImplementation(async () => {
            cancelled = true; // cancel before returning
            return apps;
        });
        const onSuccess = vi.fn();

        await loadPipelineWithRetry({
            fetcher,
            onSuccess,
            isCancelled: () => cancelled,
            delay: () => Promise.resolve(),
        });

        expect(onSuccess).not.toHaveBeenCalled();
    });

    it('respects maxAttempts and gives up silently', async () => {
        const fetcher = vi.fn().mockRejectedValue(new Error('Fail'));
        const onSuccess = vi.fn();

        await loadPipelineWithRetry({
            fetcher,
            onSuccess,
            maxAttempts: 5,
            delay: () => Promise.resolve(),
        });

        expect(fetcher).toHaveBeenCalledTimes(5);
        expect(onSuccess).not.toHaveBeenCalled();
    });

    it('calls delay between retries', async () => {
        const fetcher = vi
            .fn()
            .mockRejectedValueOnce(new Error('Fail'))
            .mockResolvedValueOnce([]);

        const onSuccess = vi.fn();
        const delay = vi.fn().mockResolvedValue(undefined);

        await loadPipelineWithRetry({
            fetcher,
            onSuccess,
            delay,
            retryDelayMs: 3000,
        });

        expect(delay).toHaveBeenCalledWith(3000);
        expect(delay).toHaveBeenCalledTimes(1);
    });
});
