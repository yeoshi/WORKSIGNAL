import type { MasterDecision } from '@worksignal/shared';

export interface CoverLetterEditorProps {
  value: string;
  onChange: (value: string) => void;
  decision: MasterDecision;
  disabled?: boolean;
}

/**
 * Editable cover-letter field (Req 15.4). The current value is controlled by
 * the parent so the edited text can be passed verbatim into Send (Req 15.6).
 */
export function CoverLetterEditor({
  value,
  onChange,
  decision,
  disabled = false,
}: CoverLetterEditorProps) {
  return (
    <section
      data-testid="cover-letter-editor"
      aria-label="Editable cover letter"
      className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Cover letter</h2>
        <span className="text-xs text-gray-500">Editable</span>
      </div>

      {decision.cover_letter_angle ? (
        <p
          data-testid="cover-letter-angle"
          className="mt-2 text-sm text-gray-600"
        >
          <span className="font-medium text-gray-700">Suggested angle: </span>
          {decision.cover_letter_angle}
        </p>
      ) : null}

      <label htmlFor="cover-letter-textarea" className="sr-only">
        Cover letter text
      </label>
      <textarea
        id="cover-letter-textarea"
        data-testid="cover-letter-textarea"
        className="mt-3 h-64 w-full resize-y rounded-lg border border-gray-300 p-3 text-sm leading-relaxed text-gray-800 focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-200"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Write or edit your cover letter here..."
      />
    </section>
  );
}
