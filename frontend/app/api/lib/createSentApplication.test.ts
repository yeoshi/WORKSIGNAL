import { describe, expect, it, vi } from 'vitest';
import { createSentApplication } from './createSentApplication';

describe('createSentApplication', () => {
  it('persists Applications row with status sent', async () => {
    const put = vi.fn().mockResolvedValue(undefined);
    const query = vi.fn().mockResolvedValue([{ verdict_id: 'verdict-1' }]);
    const db = { put, query };

    const result = await createSentApplication({
      db: db as never,
      userId: 'user-1',
      jobId: 'job-1',
      job: {
        company: 'Grab',
        role_title: 'Analyst',
        source_url: 'https://grab.com/jobs/1',
      },
      redirectSourceUrl: 'https://grab.com/jobs/1',
    });

    expect(result.application_id).toBeTruthy();
    expect(put).toHaveBeenCalledWith(
      'Applications',
      expect.objectContaining({
        user_id: 'user-1',
        job_id: 'job-1',
        company: 'Grab',
        role_title: 'Analyst',
        status: 'sent',
        verdict_id: 'verdict-1',
        redirect_source_url: 'https://grab.com/jobs/1',
      }),
    );
    expect(put.mock.calls[0]![1].redirected_at).toBeTruthy();
  });
});
