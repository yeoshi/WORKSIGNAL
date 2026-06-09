'use client';

import { useState } from 'react';
import { Check, Copy, Download, RefreshCw } from 'lucide-react';
import type { MasterDecision } from '@worksignal/shared';
import { downloadTextFile } from '../lib/downloadTextFile';

const iconButtonClass =
  'rounded-lg p-1.5 text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-40';

export interface CoverLetterEditorProps {
  value: string;
  onChange: (value: string) => void;
  decision: MasterDecision;
  disabled?: boolean;
  originalValue?: string;
  onRegenerate?: () => void;
  editable?: boolean;
  company?: string;
  roleTitle?: string;
}

export function CoverLetterEditor({
  value,
  onChange,
  decision,
  disabled = false,
  originalValue,
  onRegenerate,
  editable = true,
  company = 'company',
  roleTitle = 'role',
}: CoverLetterEditorProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  function handleRegenerate() {
    if (onRegenerate) {
      onRegenerate();
      return;
    }
    if (originalValue !== undefined) {
      onChange(originalValue);
    }
  }

  function handleDownload() {
    const slug = `${company}-${roleTitle}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    downloadTextFile(`cover-letter-${slug || 'draft'}.txt`, value);
  }

  if (!editable) {
    return (
      <section
        data-testid="cover-letter-download"
        aria-label="Cover letter download"
        className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
      >
        <h2 className="text-sm font-semibold text-gray-900">Cover letter</h2>
        <div className="mt-auto pt-3">
          <button
            type="button"
            data-testid="cover-letter-download-btn"
            onClick={handleDownload}
            disabled={!value.trim()}
            className="inline-flex w-full items-center justify-center rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
          >
            Download cover letter
          </button>
        </div>
      </section>
    );
  }

  return (
    <section
      data-testid="cover-letter-editor"
      aria-label="Editable cover letter"
      className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-900">Cover letter</h2>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            data-testid="cover-letter-copy"
            onClick={() => void handleCopy()}
            disabled={disabled}
            className={iconButtonClass}
            aria-label={copied ? 'Copied' : 'Copy cover letter'}
          >
            {copied ? (
              <Check size={16} aria-hidden className="text-emerald-600" />
            ) : (
              <Copy size={16} aria-hidden />
            )}
          </button>
          <button
            type="button"
            data-testid="cover-letter-regenerate"
            onClick={handleRegenerate}
            disabled={disabled}
            className={iconButtonClass}
            aria-label="Regenerate cover letter"
          >
            <RefreshCw size={16} aria-hidden />
          </button>
          <button
            type="button"
            data-testid="cover-letter-download-btn"
            onClick={handleDownload}
            disabled={disabled || !value.trim()}
            className={iconButtonClass}
            aria-label="Download cover letter"
          >
            <Download size={16} aria-hidden />
          </button>
        </div>
      </div>

      {decision.cover_letter_angle ? (
        <p
          data-testid="cover-letter-angle"
          className="mt-2 line-clamp-2 text-xs text-gray-600"
        >
          <span className="font-medium text-gray-700">Angle: </span>
          {decision.cover_letter_angle}
        </p>
      ) : null}

      <label htmlFor="cover-letter-textarea" className="sr-only">
        Cover letter text
      </label>
      <textarea
        id="cover-letter-textarea"
        data-testid="cover-letter-textarea"
        className="mt-3 min-h-52 w-full flex-1 resize-y rounded-lg border border-gray-300 p-3 text-sm leading-relaxed text-gray-800 focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-200"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Write or edit your cover letter here..."
      />
    </section>
  );
}
