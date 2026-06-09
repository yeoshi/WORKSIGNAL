import { beforeEach, describe, expect, it } from 'vitest';
import {
  filterSkippedActionNeeded,
  loadSkippedJobIds,
  markJobSkipped,
} from './skippedJobsStorage';

describe('skippedJobsStorage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('persists skipped job ids', () => {
    markJobSkipped('job-006');
    expect(loadSkippedJobIds().has('job-006')).toBe(true);
  });

  it('filters skipped items from action needed list', () => {
    markJobSkipped('job-006');
    const filtered = filterSkippedActionNeeded([
      { job_id: 'job-006', company: 'ByteDance' },
      { job_id: 'job-007', company: 'Grab' },
    ]);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.job_id).toBe('job-007');
  });
});
