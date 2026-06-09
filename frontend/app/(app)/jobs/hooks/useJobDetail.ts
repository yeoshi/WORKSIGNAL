'use client';

import { useCallback, useEffect, useState } from 'react';
import { normalizeJobDetail } from '../lib/normalizeJobDetail';
import type { JobDetailAction } from '../components/jobDetailTypes';

export type JobDetailLoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready';
      data: NonNullable<ReturnType<typeof normalizeJobDetail>>;
      resumeUrl: string | null;
      baseResumeUrl: string | null;
      baseResumeS3Key: string | null;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

export function useJobDetail(jobId: string | null, enabled = true) {
  const [state, setState] = useState<JobDetailLoadState>({ status: 'idle' });

  useEffect(() => {
    if (!enabled || !jobId) {
      setState({ status: 'idle' });
      return;
    }

    let cancelled = false;
    setState({ status: 'loading' });

    async function load() {
      try {
        const res = await fetch(`/api/jobs/${encodeURIComponent(jobId!)}`, {
          headers: { accept: 'application/json' },
        });
        if (!res.ok) {
          throw new Error(`Request failed (${res.status})`);
        }
        const raw: unknown = await res.json();
        const data = normalizeJobDetail(raw);
        if (!data) {
          throw new Error('Invalid job detail payload');
        }
        const resumeUrl =
          isRecord(raw) && typeof raw.resumeUrl === 'string'
            ? raw.resumeUrl
            : null;
        const baseResumeUrl =
          isRecord(raw) && typeof raw.baseResumeUrl === 'string'
            ? raw.baseResumeUrl
            : null;
        const baseResumeS3Key =
          isRecord(raw) && typeof raw.baseResumeS3Key === 'string'
            ? raw.baseResumeS3Key
            : isRecord(raw) && typeof raw.base_resume_s3_key === 'string'
              ? raw.base_resume_s3_key
              : null;
        if (!cancelled) {
          setState({ status: 'ready', data, resumeUrl, baseResumeUrl, baseResumeS3Key });
        }
      } catch (err) {
        if (!cancelled) {
          setState({
            status: 'error',
            message:
              err instanceof Error ? err.message : 'Could not load this job.',
          });
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [jobId, enabled]);

  const handleAction = useCallback(
    async (action: JobDetailAction, coverLetter: string) => {
      if (!jobId) return;
      try {
        await fetch(`/api/jobs/${encodeURIComponent(jobId)}/${action}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ coverLetter }),
        });
      } catch {
        // Endpoints may be unavailable in some environments.
      }
    },
    [jobId],
  );

  return { state, handleAction };
}
