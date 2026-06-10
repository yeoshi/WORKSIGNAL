'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Materials } from '@worksignal/shared';
import { Modal } from '../../../components/ui/Modal';
import { JobDetailView } from '../../jobs/components/JobDetailView';
import { JobModalHeader } from '../../jobs/components/JobModalHeader';
import { ActionBar } from '../../jobs/components/ActionBar';
import { useJobDetail } from '../../jobs/hooks/useJobDetail';
import type { JobDetailAction } from '../../jobs/components/jobDetailTypes';

export interface JobDetailModalProps {
  open: boolean;
  jobId: string | null;
  showActions: boolean;
  onClose: () => void;
  /** Kanban-integrated skip — removes job from Needs Decision and closes modal. */
  onSkipJob?: (jobId: string) => Promise<void>;
  /** Kanban-integrated send — moves job to Sent and closes modal. */
  onSendJob?: (jobId: string, coverLetter: string) => Promise<void>;
}

export function JobDetailModal({
  open,
  jobId,
  showActions,
  onClose,
  onSkipJob,
  onSendJob,
}: JobDetailModalProps) {
  const { state, handleAction } = useJobDetail(jobId, open);
  const [coverLetter, setCoverLetter] = useState('');
  const [tailoringNotes, setTailoringNotes] = useState('');
  const [pendingAction, setPendingAction] = useState<JobDetailAction | null>(null);
  const [customResumeUrl, setCustomResumeUrl] = useState<string | null>(null);
  const [customResumeS3Key, setCustomResumeS3Key] = useState<string | null>(null);
  const [materialsState, setMaterialsState] = useState<Materials | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [ensuringMaterials, setEnsuringMaterials] = useState(false);
  const ensureStartedForRef = useRef<string | null>(null);
  const resumeEnsureStartedForRef = useRef<string | null>(null);
  const [resumeGenerating, setResumeGenerating] = useState(false);

  useEffect(() => {
    if (state.status !== 'ready') return;

    setMaterialsState(state.data.materials);
    setCoverLetter(state.data.coverLetter);
    setTailoringNotes(state.data.tailoringNotes);
    setCustomResumeUrl(state.resumeUrl);
    setCustomResumeS3Key(
      state.data.materials.customisation_applied
        ? state.data.materials.resume_s3_key
        : null,
    );
    setGenerationError(null);
  }, [state]);

  const regenerateDraft = useCallback(async () => {
    if (!showActions || !jobId || regenerating) return;

    setRegenerating(true);
    setGenerationError(null);
    try {
      const res = await fetch(
        `/api/jobs/${encodeURIComponent(jobId)}/materials/regenerate`,
        { method: 'POST' },
      );
      const data = (await res.json()) as {
        ok?: boolean;
        coverLetterText?: string;
        tailoringNotes?: string;
        resumeS3Key?: string | null;
        resumeUrl?: string | null;
        customisationApplied?: boolean;
        message?: string;
      };

      if (!res.ok || !data.ok) {
        throw new Error(data.message ?? 'Could not regenerate materials.');
      }

      if (data.coverLetterText) setCoverLetter(data.coverLetterText);
      if (data.tailoringNotes) setTailoringNotes(data.tailoringNotes);
      if (data.resumeUrl) setCustomResumeUrl(data.resumeUrl);
      if (data.resumeS3Key) {
        setCustomResumeS3Key(data.resumeS3Key);
        setMaterialsState((prev) => ({
          ...(prev ?? {
            resume_s3_key: data.resumeS3Key!,
            cover_letter_text: data.coverLetterText ?? '',
            customisation_applied: Boolean(data.customisationApplied),
          }),
          resume_s3_key: data.resumeS3Key!,
          cover_letter_text: data.coverLetterText ?? prev?.cover_letter_text ?? '',
          customisation_applied: Boolean(data.customisationApplied),
        }));
      }
    } catch (error) {
      setGenerationError(
        error instanceof Error ? error.message : 'Could not regenerate materials.',
      );
    } finally {
      setRegenerating(false);
    }
  }, [showActions, jobId, regenerating]);

  useEffect(() => {
    if (!open) {
      ensureStartedForRef.current = null;
      resumeEnsureStartedForRef.current = null;
      setCoverLetter('');
      setTailoringNotes('');
      setCustomResumeUrl(null);
      setCustomResumeS3Key(null);
      setMaterialsState(null);
      setGenerationError(null);
      setRegenerating(false);
      setEnsuringMaterials(false);
      setResumeGenerating(false);
    }
  }, [open, jobId]);

  // Cover letter exists but tailored resume PDF is missing (e.g. prior failed save).
  useEffect(() => {
    if (!open || !showActions || !jobId || state.status !== 'ready') return;
    if (!coverLetter.trim()) return;
    if (customResumeUrl || state.resumeUrl) return;
    if (ensuringMaterials || regenerating) return;
    if (resumeEnsureStartedForRef.current === jobId) return;

    resumeEnsureStartedForRef.current = jobId;
    let cancelled = false;
    setResumeGenerating(true);
    setGenerationError(null);

    void (async () => {
      const pollTimer = setInterval(() => {
        void fetch(`/api/jobs/${encodeURIComponent(jobId)}`, {
          headers: { accept: 'application/json' },
        })
          .then((res) => (res.ok ? res.json() : null))
          .then((raw: Record<string, unknown> | null) => {
            if (!raw || cancelled) return;
            if (typeof raw.resumeUrl === 'string') {
              setCustomResumeUrl(raw.resumeUrl);
            }
            const materials = raw.materials as Record<string, unknown> | undefined;
            if (materials?.resume_s3_key && materials.customisation_applied) {
              setCustomResumeS3Key(String(materials.resume_s3_key));
              setMaterialsState((prev) => ({
                ...(prev ?? {
                  resume_s3_key: String(materials.resume_s3_key),
                  cover_letter_text: coverLetter,
                  customisation_applied: true,
                }),
                resume_s3_key: String(materials.resume_s3_key),
                customisation_applied: true,
              }));
            }
          })
          .catch(() => undefined);
      }, 1500);

      try {
        const res = await fetch(
          `/api/jobs/${encodeURIComponent(jobId)}/materials/resume`,
          { method: 'POST' },
        );
        const data = (await res.json()) as {
          ok?: boolean;
          resumeS3Key?: string | null;
          resumeUrl?: string | null;
          message?: string;
        };

        if (!res.ok || !data.ok) {
          throw new Error(data.message ?? 'Could not generate tailored resume.');
        }

        if (data.resumeUrl) setCustomResumeUrl(data.resumeUrl);
        if (data.resumeS3Key) {
          setCustomResumeS3Key(data.resumeS3Key);
          setMaterialsState((prev) => ({
            ...(prev ?? {
              resume_s3_key: data.resumeS3Key!,
              cover_letter_text: coverLetter,
              customisation_applied: true,
            }),
            resume_s3_key: data.resumeS3Key!,
            customisation_applied: true,
          }));
        }
      } catch (error) {
        if (!cancelled) {
          setGenerationError(
            error instanceof Error ? error.message : 'Could not generate tailored resume.',
          );
        }
      } finally {
        clearInterval(pollTimer);
        if (!cancelled) setResumeGenerating(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    open,
    showActions,
    jobId,
    state,
    coverLetter,
    customResumeUrl,
    ensuringMaterials,
    regenerating,
  ]);

  // Generate immediately if materials are missing; poll in parallel for partial saves.
  useEffect(() => {
    if (!open || !showActions || !jobId || state.status !== 'ready') return;
    if (state.data.coverLetter.trim()) return;
    if (ensureStartedForRef.current === jobId) return;

    ensureStartedForRef.current = jobId;
    let cancelled = false;
    setEnsuringMaterials(true);
    setGenerationError(null);

    function applyFetchedMaterials(raw: Record<string, unknown>): boolean {
      const materials = raw.materials as Record<string, unknown> | undefined;
      const cl =
        (typeof raw.coverLetterText === 'string' && raw.coverLetterText) ||
        (materials && typeof materials.cover_letter_text === 'string'
          ? (materials.cover_letter_text as string)
          : '');
      const tn =
        typeof raw.tailoringNotes === 'string'
          ? raw.tailoringNotes
          : typeof raw.tailoring_notes === 'string'
            ? raw.tailoring_notes
            : '';

      if (tn.trim()) setTailoringNotes(tn);
      if (cl.trim()) setCoverLetter(cl);
      if (typeof raw.resumeUrl === 'string') setCustomResumeUrl(raw.resumeUrl);
      if (materials && typeof materials.resume_s3_key === 'string') {
        setCustomResumeS3Key(materials.resume_s3_key);
        setMaterialsState({
          resume_s3_key: materials.resume_s3_key,
          cover_letter_text: cl || (materials.cover_letter_text as string) || '',
          customisation_applied: Boolean(materials.customisation_applied),
        });
      }

      return Boolean(cl.trim());
    }

    async function pollJobMaterials(): Promise<boolean> {
      const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, {
        headers: { accept: 'application/json' },
      });
      if (!res.ok) return false;
      const raw = (await res.json()) as Record<string, unknown>;
      return applyFetchedMaterials(raw);
    }

    void (async () => {
      try {
        if (await pollJobMaterials()) return;

        const pollTimer = setInterval(() => {
          void pollJobMaterials();
        }, 1500);

        try {
          const res = await fetch(
            `/api/jobs/${encodeURIComponent(jobId)}/materials/regenerate`,
            { method: 'POST' },
          );
          const data = (await res.json()) as {
            ok?: boolean;
            coverLetterText?: string;
            tailoringNotes?: string;
            resumeS3Key?: string | null;
            resumeUrl?: string | null;
            customisationApplied?: boolean;
            message?: string;
          };

          if (!res.ok || !data.ok) {
            throw new Error(data.message ?? 'Could not generate materials.');
          }

          if (data.coverLetterText) setCoverLetter(data.coverLetterText);
          if (data.tailoringNotes) setTailoringNotes(data.tailoringNotes);
          if (data.resumeUrl) setCustomResumeUrl(data.resumeUrl);
          if (data.resumeS3Key) {
            setCustomResumeS3Key(data.resumeS3Key);
            setMaterialsState((prev) => ({
              ...(prev ?? {
                resume_s3_key: data.resumeS3Key!,
                cover_letter_text: data.coverLetterText ?? '',
                customisation_applied: Boolean(data.customisationApplied),
              }),
              resume_s3_key: data.resumeS3Key!,
              cover_letter_text: data.coverLetterText ?? prev?.cover_letter_text ?? '',
              customisation_applied: Boolean(data.customisationApplied),
            }));
          }
        } finally {
          clearInterval(pollTimer);
        }
      } catch (error) {
        if (!cancelled) {
          setGenerationError(
            error instanceof Error ? error.message : 'Could not generate materials.',
          );
        }
      } finally {
        if (!cancelled) setEnsuringMaterials(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, showActions, jobId, state]);

  const runAction = async (action: JobDetailAction) => {
    if (!showActions || !jobId) return;
    setPendingAction(action);
    try {
      if (action === 'skip' && onSkipJob) {
        await onSkipJob(jobId);
        return;
      }
      if (action === 'send' && onSendJob) {
        await onSendJob(jobId, coverLetter);
        return;
      }
      await handleAction(action, coverLetter);
    } finally {
      setPendingAction(null);
    }
  };

  const footer =
    showActions && state.status === 'ready' ? (
      <ActionBar
        hasEmployerEmail={Boolean(state.data.job.employer_email)}
        sourceUrl={state.data.job.source_url}
        onSend={() => runAction('send')}
        onSave={() => runAction('save')}
        onSkip={() => runAction('skip')}
        busy={pendingAction !== null}
        pendingAction={pendingAction}
        embedded
        showSave={false}
      />
    ) : null;

  const viewData =
    state.status === 'ready' && materialsState
      ? { ...state.data, materials: materialsState }
      : state.status === 'ready'
        ? state.data
        : null;

  const activeResumeS3Key =
    customResumeS3Key ?? materialsState?.resume_s3_key ?? viewData?.materials.resume_s3_key;

  const materialsLoading = ensuringMaterials || regenerating;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        state.status === 'ready' ? (
          <JobModalHeader job={state.data.job} />
        ) : (
          'Job detail'
        )
      }
      titleAction={
        state.status === 'ready' && state.data.job.source_url ? (
          <button
            type="button"
            data-testid="job-listing-link"
            onClick={() =>
              window.open(state.data.job.source_url, '_blank', 'noopener,noreferrer')
            }
            className="shrink-0 rounded-lg border border-ws-line bg-ws-card px-3 py-1.5 text-sm font-medium text-ws-ink transition hover:border-ws-teal/40 hover:bg-ws-paper"
          >
            View listing
          </button>
        ) : null
      }
      size="xl"
      scrollBody={false}
      footer={footer}
    >
      {state.status === 'loading' && (
        <p
          data-testid="job-detail-modal-loading"
          className="p-6 text-sm text-ws-muted"
        >
          Loading job…
        </p>
      )}
      {state.status === 'error' && (
        <p
          data-testid="job-detail-modal-error"
          className="p-6 text-sm text-ws-muted"
        >
          We couldn&apos;t load this job right now. {state.message}
        </p>
      )}
      {state.status === 'ready' && viewData && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
            <JobDetailView
              data={viewData}
              resumeUrl={customResumeUrl ?? state.resumeUrl}
              resumeS3Key={activeResumeS3Key}
              baseResumeUrl={state.baseResumeUrl}
              baseResumeS3Key={state.baseResumeS3Key}
              showActions={showActions}
              externalActionBar={showActions}
              coverLetter={coverLetter}
              onCoverLetterChange={setCoverLetter}
              onRegenerate={() => void regenerateDraft()}
              coverLetterLoading={materialsLoading && !coverLetter.trim()}
              tailoringNotes={showActions ? tailoringNotes : undefined}
              tailoringLoading={materialsLoading && !tailoringNotes.trim()}
              generationError={showActions ? generationError : null}
              resumeLoading={
                resumeGenerating ||
                (materialsLoading && !customResumeUrl && !state.resumeUrl)
              }
              resumeGenerationError={showActions ? generationError : null}
              onCustomResumeUploaded={(key, url) => {
                setCustomResumeUrl(url);
                setCustomResumeS3Key(key);
                setMaterialsState((prev) =>
                  prev
                    ? { ...prev, resume_s3_key: key, customisation_applied: true }
                    : prev,
                );
              }}
              embedded
            />
          </div>
        </div>
      )}
    </Modal>
  );
}

export default JobDetailModal;
