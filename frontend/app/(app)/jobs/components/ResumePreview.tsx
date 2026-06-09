import type { Materials, MasterDecision } from '@worksignal/shared';

export interface ResumePreviewProps {
  materials: Materials;
  decision: MasterDecision;
  /** Pre-signed URL to the customised resume, when available. */
  resumeUrl?: string | null;
}

/**
 * Customised resume preview (Req 15.4). Shows the resume customisation
 * instructions from the Master Orchestrator and a link/affordance to the
 * stored resume, flagging when a base-resume fallback was used (Req 14.4/14.5).
 */
export function ResumePreview({ materials, decision, resumeUrl }: ResumePreviewProps) {
  return (
    <section
      data-testid="resume-preview"
      aria-label="Customised resume preview"
      className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Customised resume</h2>
        {!materials.customisation_applied ? (
          <span
            data-testid="resume-base-fallback"
            className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600"
          >
            Base resume (customisation unavailable)
          </span>
        ) : null}
      </div>

      {decision.resume_instructions ? (
        <div className="mt-3" data-testid="resume-instructions">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Tailoring notes
          </p>
          <p className="mt-1 text-sm leading-relaxed text-gray-700">
            {decision.resume_instructions}
          </p>
        </div>
      ) : null}

      <div className="mt-4">
        {resumeUrl ? (
          <a
            data-testid="resume-link"
            href={resumeUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
          >
            View resume PDF
          </a>
        ) : (
          <p className="text-sm text-gray-500" data-testid="resume-pending">
            Resume document: {materials.resume_s3_key}
          </p>
        )}
      </div>
    </section>
  );
}
