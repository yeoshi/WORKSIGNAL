'use client';

/**
 * Step 2 — Upload resume (Req 2.1, 2.3, 2.4).
 *
 * Accepts a PDF resume. Non-PDF selections are rejected client-side with the
 * "only PDF files are accepted" message (Req 2.3). A manual-entry fallback
 * affordance is always available so the user can proceed even if parsing fails
 * or they would rather type their details (Req 2.4).
 */
import { useRef, useState } from 'react';
import { Button } from '../../components/onboarding/controls';
import { uploadResume } from '../api';

const PDF_ONLY_MESSAGE = 'Only PDF files are accepted. Please upload a PDF resume.';

export interface ResumeStepResult {
  /** True when the user chose to enter their profile manually (Req 2.4). */
  manualEntry: boolean;
  /** The selected file name, when a PDF was uploaded. */
  fileName?: string;
}

function isPdf(file: File): boolean {
  return (
    file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  );
}

export function ResumeUploadStep({
  onComplete,
  onBack,
}: {
  onComplete: (result: ResumeStepResult) => void;
  onBack: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseFailed, setParseFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File) {
    setError(null);
    setParseFailed(false);
    if (!isPdf(file)) {
      setFileName(null);
      setError(PDF_ONLY_MESSAGE);
      return;
    }
    setFileName(file.name);
    setBusy(true);
    const result = await uploadResume(file);
    setBusy(false);
    if (result.ok || result.pending) {
      // Upload succeeded, or the route is not wired yet — let the user proceed.
      return;
    }
    // A real, non-pending failure from the parser → offer manual entry (2.4).
    setParseFailed(true);
    setError(result.message);
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold text-gray-900">
          Upload your resume
        </h2>
        <p className="text-sm text-gray-500">
          We parse your resume to understand your background so the agents can
          evaluate jobs against your actual experience. PDF only.
        </p>
      </div>

      <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 px-6 py-10 text-center">
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          aria-label="Resume PDF"
          onChange={onInputChange}
          className="hidden"
        />
        <p className="text-sm text-gray-600">
          {fileName ? (
            <span className="font-medium text-gray-900">{fileName}</span>
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

      {error && (
        <p role="alert" className="text-sm font-medium text-red-600">
          {error}
        </p>
      )}

      {parseFailed && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          We couldn&apos;t read that resume automatically. You can enter your
          profile details manually instead.
        </div>
      )}

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            onClick={() => onComplete({ manualEntry: true })}
          >
            Enter details manually
          </Button>
          <Button
            onClick={() =>
              onComplete({ manualEntry: false, fileName: fileName ?? undefined })
            }
            disabled={!fileName || busy}
          >
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}
