'use client';

import { useCallback } from 'react';
import type { Application } from '@worksignal/shared';
import type { ActionNeededItem } from '../types';

export interface UseKanbanActionsOptions {
  actionNeeded: ActionNeededItem[];
  removeActionNeeded: (jobId: string) => void;
  prependApplication: (app: Application) => void;
  reloadDashboard: () => void;
  reloadPipeline: () => void;
}

function buildSentApplication(
  item: ActionNeededItem,
  userId = 'demo-user-001',
): Application {
  const now = new Date().toISOString();
  return {
    application_id: `app-opt-${item.job_id}`,
    user_id: userId,
    job_id: item.job_id,
    verdict_id: `verdict-${item.job_id}`,
    company: item.company,
    role_title: item.role_title,
    customised_resume_s3_key: '',
    customisation_applied: false,
    cover_letter_text: '',
    sent_at: now,
    recipient_email: item.has_employer_email ? 'employer@example.com' : null,
    email_thread_id: null,
    status: 'sent',
    redirect_source_url: item.has_employer_email ? null : item.source_url ?? null,
    redirected_at: item.has_employer_email ? null : now,
    status_updated_at: now,
    classification_confidence: 0,
  };
}

export function useKanbanActions({
  actionNeeded,
  removeActionNeeded,
  prependApplication,
  reloadDashboard,
  reloadPipeline,
}: UseKanbanActionsOptions) {
  const findItem = useCallback(
    (jobId: string) => actionNeeded.find((i) => i.job_id === jobId),
    [actionNeeded],
  );

  const moveToSent = useCallback(
    (jobId: string) => {
      const item = findItem(jobId);
      if (item) {
        removeActionNeeded(jobId);
        prependApplication(buildSentApplication(item));
      }
    },
    [findItem, removeActionNeeded, prependApplication],
  );

  const send = useCallback(
    async (jobId: string) => {
      try {
        await fetch(`/api/jobs/${encodeURIComponent(jobId)}/send`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ coverLetter: '' }),
        });
      } catch {
        // Tolerate missing backend in dev.
      }
      moveToSent(jobId);
      reloadDashboard();
      reloadPipeline();
    },
    [moveToSent, reloadDashboard, reloadPipeline],
  );

  const skip = useCallback(
    async (jobId: string) => {
      try {
        await fetch(`/api/jobs/${encodeURIComponent(jobId)}/skip`, {
          method: 'POST',
        });
      } catch {
        // Tolerate missing backend in dev.
      }
      removeActionNeeded(jobId);
      reloadDashboard();
      reloadPipeline();
    },
    [removeActionNeeded, reloadDashboard, reloadPipeline],
  );

  const save = useCallback(async (_jobId: string) => {
    // No backend route yet — noop consistent with job detail page.
  }, []);

  const markSent = useCallback(
    async (jobId: string) => {
      try {
        await fetch(`/api/jobs/${encodeURIComponent(jobId)}/mark-sent`, {
          method: 'POST',
        });
      } catch {
        // Tolerate missing backend in dev.
      }
      moveToSent(jobId);
      reloadDashboard();
      reloadPipeline();
    },
    [moveToSent, reloadDashboard, reloadPipeline],
  );

  return { send, skip, save, markSent };
}
