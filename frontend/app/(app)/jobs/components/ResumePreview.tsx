'use client';

import { useRef, useState } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import type { Materials, MasterDecision } from '@worksignal/shared';
import { resumeFileName } from '../lib/resumeFileName';

export interface ResumePreviewProps {
  materials: Materials;
  decision: MasterDecision;
  /** Pre-signed URL to the active resume (customised or original). */
  resumeUrl?: string | null;
  /** S3 key for the active resume file. */
  resumeS3Key: string;
  compact?: boolean;
  editable?: boolean;
  usingOriginalResume?: boolean;
  canUseOriginalResume?: boolean;
  onUseOriginalResume?: () => void;
  onUseCustomisedResume?: () => void;
  /** Job ID — enables per-job custom resume upload when provided. */
  jobId?: string | null;
  /** Called after a custom resume is successfully uploaded. */
  onCustomResumeUploaded?: (s3Key: string, resumeUrl: string) => void;
  /** True while resume is streaming or being saved as PDF. */
  resumeLoading?: boolean;
  /** Error from resume generation or PDF persistence. */
  resumeGenerationError?: string | null;
}

export function ResumePreview({
  materials,
  decision,
  resumeUrl,
  resumeS3Key,
  compact = false,
  editable = false,
  usingOriginalResume = false,
  canUseOriginalResume = false,
  onUseOriginalResume,
  onUseCustomisedResume,
  jobId,
  onCustomResumeUploaded,
  resumeLoading = false,
  resumeGenerationError = null,
}: ResumePreviewProps) {
  const fileName = resumeFileName(resumeS3Key);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !jobId) return;

    setUploading(true);
    setUploadError(null);

    const form = new FormData();
    form.append('resume', file);

    try {
      const res = await fetch(`/api/jobs/${jobId}/resume`, { method: 'POST', body: form });
      const data = (await res.json()) as { ok?: boolean; s3Key?: string; resumeUrl?: string; message?: string };

      if (!res.ok || !data.ok) throw new Error(data.message ?? 'Upload failed');

      onCustomResumeUploaded?.(data.s3Key ?? '', data.resumeUrl ?? '');
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }
  const showCustomisedBadge =
    materials.customisation_applied && !usingOriginalResume;

  return (
    <section
      data-testid="resume-preview"
      aria-label="Customised resume preview"
      className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-900">
          {usingOriginalResume ? 'Original resume' : 'Customised resume'}
        </h2>
        {showCustomisedBadge ? (
          <span
            data-testid="resume-customised-badge"
            className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700"
          >
            Tailored
          </span>
        ) : null}
        {!materials.customisation_applied && !usingOriginalResume ? (
          <span
            data-testid="resume-base-fallback"
            className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600"
          >
            Base resume
          </span>
        ) : null}
      </div>

      {resumeS3Key ? (
        <p className="mt-2 truncate text-xs text-gray-400" title={fileName}>
          {fileName}
        </p>
      ) : null}

      {!compact && decision.resume_instructions && !usingOriginalResume ? (
        <p
          data-testid="resume-instructions"
          className="mt-1 line-clamp-2 text-xs leading-relaxed text-gray-600"
        >
          {decision.resume_instructions}
        </p>
      ) : null}

      {resumeGenerationError ? (
        <p
          role="alert"
          data-testid="resume-generation-error"
          className="mt-2 text-xs text-red-600"
        >
          {resumeGenerationError}
        </p>
      ) : null}

      {!compact ? (
        <div className="mt-3 min-h-0 flex-1">
          {resumeUrl ? (
            <>
              <button
                type="button"
                data-testid="resume-preview-toggle"
                onClick={() => setPreviewOpen((open) => !open)}
                className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
              >
                {previewOpen ? 'Hide preview' : 'Show preview'}
              </button>
              {previewOpen ? (
                <div
                  data-testid="resume-preview-pdf"
                  className="relative mt-2 overflow-hidden rounded-lg border border-gray-200 bg-gray-50"
                >
                  {resumeLoading ? (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70">
                      <Loader2
                        size={20}
                        className="animate-spin text-gray-500"
                        aria-hidden
                      />
                      <span className="sr-only">Updating resume preview…</span>
                    </div>
                  ) : null}
                  <iframe
                    title="Resume preview"
                    src={`${resumeUrl}#toolbar=0&navpanes=0`}
                    className="h-72 w-full"
                  />
                </div>
              ) : null}
            </>
          ) : resumeLoading ? (
            <div
              data-testid="resume-loading"
              className="flex h-72 items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50"
            >
              <p className="flex items-center gap-2 text-xs text-gray-500">
                <Loader2 size={14} className="animate-spin" aria-hidden />
                Tailoring your resume…
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-auto space-y-2 pt-3">
        {resumeUrl ? (
          <a
            data-testid="resume-download"
            href={resumeUrl}
            download={fileName}
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-full items-center justify-center rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
          >
            Download resume
          </a>
        ) : (
          <button
            type="button"
            data-testid="resume-download"
            disabled
            className="inline-flex w-full cursor-not-allowed items-center justify-center rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-400"
          >
            Download resume
          </button>
        )}

        {editable && canUseOriginalResume ? (
          usingOriginalResume ? (
            <button
              type="button"
              data-testid="resume-use-customised"
              onClick={onUseCustomisedResume}
              className="inline-flex w-full items-center justify-center rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Use customised resume
            </button>
          ) : (
            <button
              type="button"
              data-testid="resume-use-original"
              onClick={onUseOriginalResume}
              className="inline-flex w-full items-center justify-center rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Use original resume
            </button>
          )
        ) : null}

        {/* Per-job custom resume upload */}
        {editable && jobId ? (
          <>
            <input
              ref={fileInputRef}
              id={`resume-upload-${jobId}`}
              type="file"
              accept=".pdf,application/pdf"
              className="sr-only"
              onChange={(e) => void handleUpload(e)}
            />
            <label
              htmlFor={`resume-upload-${jobId}`}
              className={[
                'inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition',
                uploading
                  ? 'cursor-not-allowed text-gray-400'
                  : 'text-indigo-600 hover:bg-indigo-50',
              ].join(' ')}
            >
              {uploading ? (
                <>
                  <Loader2 size={14} className="animate-spin" aria-hidden />
                  Uploading…
                </>
              ) : (
                <>
                  <Upload size={14} aria-hidden />
                  Upload custom resume
                </>
              )}
            </label>
            {uploadError ? (
              <p className="text-center text-xs text-red-500">{uploadError}</p>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  );
}
