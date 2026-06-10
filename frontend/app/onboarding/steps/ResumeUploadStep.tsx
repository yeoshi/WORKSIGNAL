'use client';

/**
 * Step 1 — Upload resume (Req 2.1, 2.3, 2.4).
 */

import { useEffect, useRef, useState } from 'react';
import type { ParsedProfile } from '@/app/types/shared';
import { Button } from '../../components/onboarding/controls';
import { removeCoverLetter, removeResume, uploadCoverLetter, uploadResume } from '../api';
import { hasConfirmedResumeProfile } from '../lib/parsedProfileDefaults';

const PDF_ONLY_MESSAGE = 'Only PDF files are accepted. Please upload a PDF resume.';

export interface ResumeStepResult {
  manualEntry: boolean;
  fileName?: string;
  s3Key?: string;
  coverLetterFileName?: string;
  coverLetterS3Key?: string;
  profile?: ParsedProfile | null;
}

function isPdf(file: File): boolean {
  return (
    file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  );
}

export interface ResumeUploadStepProps {
  onComplete: (result: ResumeStepResult) => void;
  onBack: () => void;
  mode?: 'onboarding' | 'edit';
  embedded?: boolean;
  onResumeChange?: (result: ResumeStepResult) => void;
  existingResumeS3Key?: string;
  existingResumeFileName?: string;
  existingCoverLetterS3Key?: string;
  existingCoverLetterFileName?: string;
  existingProfile?: ParsedProfile | null;
}

export function ResumeUploadStep({
  onComplete,
  onBack,
  mode = 'onboarding',
  embedded = false,
  onResumeChange,
  existingResumeS3Key,
  existingResumeFileName,
  existingCoverLetterS3Key,
  existingCoverLetterFileName,
  existingProfile,
}: ResumeUploadStepProps) {
  const isEdit = mode === 'edit';
  const inputRef = useRef<HTMLInputElement>(null);
  const coverLetterInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [coverLetterError, setCoverLetterError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [coverLetterFileName, setCoverLetterFileName] = useState<string | null>(null);
  const [coverLetterS3Key, setCoverLetterS3Key] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<ResumeStepResult | null>(null);
  const [parseFailed, setParseFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [coverLetterBusy, setCoverLetterBusy] = useState(false);
  const [resumeRemoved, setResumeRemoved] = useState(false);
  const [coverLetterRemoved, setCoverLetterRemoved] = useState(false);
  const [storedResumeS3Key, setStoredResumeS3Key] = useState<string | undefined>(
    existingResumeS3Key,
  );
  const [storedCoverLetterS3Key, setStoredCoverLetterS3Key] = useState<
    string | undefined
  >(existingCoverLetterS3Key);

  useEffect(() => {
    if (!isEdit) return;

    setStoredResumeS3Key(existingResumeS3Key);
    setStoredCoverLetterS3Key(existingCoverLetterS3Key);

    if (!resumeRemoved && existingResumeFileName) {
      setFileName(existingResumeFileName);
    }
    if (!coverLetterRemoved && existingCoverLetterFileName) {
      setCoverLetterFileName(existingCoverLetterFileName);
      setCoverLetterS3Key(existingCoverLetterS3Key ?? null);
    }
  }, [
    isEdit,
    existingResumeS3Key,
    existingResumeFileName,
    existingCoverLetterS3Key,
    existingCoverLetterFileName,
    resumeRemoved,
    coverLetterRemoved,
  ]);

  const activeResumeS3Key = uploaded?.s3Key ?? (resumeRemoved ? undefined : storedResumeS3Key);
  const activeCoverLetterS3Key =
    coverLetterS3Key ?? (coverLetterRemoved ? undefined : storedCoverLetterS3Key);
  const activeResumeFileName = uploaded?.fileName ?? (resumeRemoved ? null : fileName);
  const activeCoverLetterFileName = coverLetterRemoved ? null : coverLetterFileName;
  const hasCurrentResume = Boolean(activeResumeFileName || activeResumeS3Key);
  const hasCurrentCoverLetter = Boolean(
    activeCoverLetterFileName || activeCoverLetterS3Key,
  );
  const hasStoredProfile = hasConfirmedResumeProfile(existingProfile);

  async function handleFile(file: File) {
    setError(null);
    setParseFailed(false);
    setResumeRemoved(false);

    if (!isPdf(file)) {
      setFileName(null);
      setError(PDF_ONLY_MESSAGE);
      return;
    }

    setFileName(file.name);
    setBusy(true);
    const result = await uploadResume(file);
    setBusy(false);

    if (!result.ok) {
      setParseFailed(true);
      setError(result.message);
      return;
    }

    const data = result.data;
    setStoredResumeS3Key(data?.s3Key);
    const nextUpload: ResumeStepResult = {
      manualEntry: false,
      fileName: file.name,
      s3Key: data?.s3Key,
      coverLetterFileName: coverLetterFileName ?? undefined,
      coverLetterS3Key: activeCoverLetterS3Key,
      profile: data?.profile ?? null,
    };
    setUploaded(nextUpload);
    onResumeChange?.(nextUpload);

    if (data?.parseFailed) {
      setParseFailed(true);
      setError(
        'We could not read that resume automatically. Review and enter your details on the next step.',
      );
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
  }

  async function handleCoverLetter(file: File) {
    setCoverLetterError(null);
    setCoverLetterRemoved(false);

    if (!isPdf(file)) {
      setCoverLetterFileName(null);
      setCoverLetterS3Key(null);
      setCoverLetterError(PDF_ONLY_MESSAGE);
      return;
    }

    setCoverLetterFileName(file.name);
    setCoverLetterBusy(true);
    const result = await uploadCoverLetter(file);
    setCoverLetterBusy(false);

    if (!result.ok) {
      setCoverLetterS3Key(null);
      setCoverLetterError(result.message);
      return;
    }

    const nextKey = result.data?.s3Key ?? null;
    setCoverLetterS3Key(nextKey);
    setStoredCoverLetterS3Key(nextKey ?? undefined);
    const coverUpdate = {
      coverLetterFileName: file.name,
      coverLetterS3Key: nextKey ?? undefined,
    };
    setUploaded((prev) => (prev ? { ...prev, ...coverUpdate } : prev));
    onResumeChange?.({
      manualEntry: false,
      fileName: activeResumeFileName ?? undefined,
      s3Key: activeResumeS3Key,
      profile: uploaded?.profile ?? existingProfile ?? null,
      ...coverUpdate,
    });
  }

  function onCoverLetterInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleCoverLetter(file);
  }

  async function handleRemoveResume() {
    setResumeRemoved(true);
    setFileName(null);
    setUploaded(null);
    setStoredResumeS3Key(undefined);
    setError(null);
    setParseFailed(false);
    if (inputRef.current) inputRef.current.value = '';

    if (existingResumeS3Key || activeResumeS3Key) {
      const result = await removeResume();
      if (!result.ok) {
        setError(result.message);
        return;
      }
    }

    onResumeChange?.({
      manualEntry: false,
      profile: existingProfile ?? null,
      coverLetterFileName: activeCoverLetterFileName ?? undefined,
      coverLetterS3Key: activeCoverLetterS3Key,
    });
  }

  async function handleRemoveCoverLetter() {
    setCoverLetterRemoved(true);
    setCoverLetterFileName(null);
    setCoverLetterS3Key(null);
    setStoredCoverLetterS3Key(undefined);
    setCoverLetterError(null);
    if (coverLetterInputRef.current) coverLetterInputRef.current.value = '';

    if (existingCoverLetterS3Key || activeCoverLetterS3Key) {
      const result = await removeCoverLetter();
      if (!result.ok) {
        setCoverLetterError(result.message);
      }
    }
  }

  function proceedToConfirm(result: ResumeStepResult) {
    onComplete({
      ...result,
      coverLetterFileName: coverLetterRemoved
        ? undefined
        : (coverLetterFileName ?? result.coverLetterFileName),
      coverLetterS3Key: coverLetterRemoved
        ? undefined
        : (activeCoverLetterS3Key ?? result.coverLetterS3Key),
    });
  }

  function handleContinue() {
    if (uploaded) {
      proceedToConfirm(uploaded);
      return;
    }

    if (isEdit) {
      proceedToConfirm({
        manualEntry: false,
        fileName: activeResumeFileName ?? undefined,
        s3Key: activeResumeS3Key,
        profile: existingProfile ?? null,
        coverLetterFileName: activeCoverLetterFileName ?? undefined,
        coverLetterS3Key: activeCoverLetterS3Key,
      });
      return;
    }

    if (fileName) {
      proceedToConfirm({
        manualEntry: false,
        fileName,
        profile: null,
      });
    }
  }

  const canContinue =
    !busy &&
    !coverLetterBusy &&
    (Boolean(uploaded) ||
      (isEdit && (hasCurrentResume || hasStoredProfile)) ||
      (!isEdit && Boolean(fileName)));

  function renderResumeSection() {
    if (isEdit && hasCurrentResume) {
      return (
        <div
          data-testid="current-resume-card"
          className="flex flex-col gap-3 rounded-xl border border-ws-teal/25 bg-ws-teal/5 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0 text-left">
            <p className="text-xs font-medium uppercase tracking-wide text-ws-muted">
              Current resume
            </p>
            <p className="truncate text-sm font-medium text-ws-ink">
              {activeResumeFileName ?? 'Resume on file'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="ghost" onClick={() => void handleRemoveResume()}>
              Remove
            </Button>
            <Button
              variant="secondary"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
            >
              Replace
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-ws-line bg-ws-paper px-6 py-10 text-center">
        <p className="text-sm text-ws-muted">
          {fileName ? (
            <span className="font-medium text-ws-ink">{fileName}</span>
          ) : (
            'Drop your resume here or choose a file'
          )}
        </p>
        <Button
          variant="secondary"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          {busy ? 'Uploading…' : fileName ? 'Choose a different PDF' : 'Choose PDF'}
        </Button>
      </div>
    );
  }

  function renderCoverLetterSection() {
    if (isEdit && hasCurrentCoverLetter) {
      return (
        <div
          data-testid="current-cover-letter-card"
          className="flex flex-col gap-3 rounded-xl border border-ws-line bg-ws-card px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0 text-left">
            <p className="text-xs font-medium uppercase tracking-wide text-ws-muted">
              Current cover letter sample
            </p>
            <p className="truncate text-sm font-medium text-ws-ink">
              {activeCoverLetterFileName ?? 'Cover letter on file'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="ghost" onClick={() => void handleRemoveCoverLetter()}>
              Remove
            </Button>
            <Button
              variant="secondary"
              onClick={() => coverLetterInputRef.current?.click()}
              disabled={coverLetterBusy || busy}
            >
              Replace
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-ws-line bg-ws-card px-6 py-8 text-center">
        <p className="text-sm text-ws-muted">
          {coverLetterFileName ? (
            <span className="font-medium text-ws-ink">{coverLetterFileName}</span>
          ) : (
            'Add a sample cover letter'
          )}
        </p>
        <Button
          variant="secondary"
          onClick={() => coverLetterInputRef.current?.click()}
          disabled={coverLetterBusy || busy}
        >
          {coverLetterBusy
            ? 'Uploading…'
            : coverLetterFileName
              ? 'Choose a different PDF'
              : 'Choose PDF'}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {!embedded && (
        <div className="flex flex-col gap-2">
          <h2 className="font-wordmark text-2xl font-semibold text-ws-ink">
            {isEdit ? 'Update your resume' : 'Upload your resume'}
          </h2>
          <p className="text-sm text-ws-muted">
            {isEdit
              ? 'Your saved documents are shown below. Remove or replace them, or continue with what you have.'
              : 'We parse your resume to understand your background so the agents can evaluate jobs against your actual experience. PDF only.'}
          </p>
          {isEdit && hasStoredProfile && !hasCurrentResume && (
            <p className="text-sm text-ws-muted">
              Your profile details are saved. Upload a new PDF to replace them, or
              continue to edit your details.
            </p>
          )}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        aria-label="Resume PDF"
        onChange={onInputChange}
        className="hidden"
      />

      {renderResumeSection()}

      {error && (
        <p role="alert" className="text-sm font-medium text-red-600">
          {error}
        </p>
      )}

      {parseFailed && (
        <div className="rounded-xl border border-ws-teal/30 bg-ws-teal/10 px-4 py-3 text-sm text-ws-teal-mid">
          You can enter your profile details manually on the next step and confirm
          before continuing.
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h3 className="font-wordmark text-lg font-semibold text-ws-ink">
          Cover letter sample <span className="text-sm font-normal text-ws-muted">(optional)</span>
        </h3>
        <p className="text-sm text-ws-muted">
          Upload a cover letter you have written before. We use it to match your tone
          and style when drafting new cover letters. PDF only.
        </p>
      </div>

      <input
        ref={coverLetterInputRef}
        type="file"
        accept="application/pdf,.pdf"
        aria-label="Cover letter sample PDF"
        onChange={onCoverLetterInputChange}
        className="hidden"
      />

      {renderCoverLetterSection()}

      {coverLetterError && (
        <p role="alert" className="text-sm font-medium text-red-600">
          {coverLetterError}
        </p>
      )}

      {!embedded && (
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={onBack}>
            {isEdit ? 'Cancel' : 'Back'}
          </Button>
          <div className="flex items-center gap-3">
            {!isEdit && (
              <Button
                variant="secondary"
                onClick={() =>
                  proceedToConfirm({ manualEntry: true, profile: null })
                }
              >
                Enter details manually
              </Button>
            )}
            <Button onClick={handleContinue} disabled={!canContinue}>
              Continue
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
