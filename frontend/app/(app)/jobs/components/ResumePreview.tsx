'use client';

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
}: ResumePreviewProps) {
  const fileName = resumeFileName(resumeS3Key);
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

      {!compact && decision.resume_instructions && !usingOriginalResume ? (
        <p
          data-testid="resume-instructions"
          className="mt-2 line-clamp-2 text-xs leading-relaxed text-gray-600"
        >
          {decision.resume_instructions}
        </p>
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
      </div>
    </section>
  );
}
