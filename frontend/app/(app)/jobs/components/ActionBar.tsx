import type { JobDetailAction } from './jobDetailTypes';

export interface ActionBarProps {
  hasEmployerEmail: boolean;
  sourceUrl: string;
  onSend: () => void;
  onSkip: () => void;
  onSave: () => void;
  busy?: boolean;
  pendingAction?: JobDetailAction | null;
  /** Flat layout for modal footers (no floating card chrome). */
  embedded?: boolean;
  /** When false, hides Save (Needs Decision flow: send or skip only). */
  showSave?: boolean;
}

/**
 * Action bar offering Send, Skip, and Save (Req 15.5). When no employer email
 * is available, the Send affordance becomes a redirect link to the job's
 * source URL so the user can apply through the employer's form (Req 16.6).
 */
export function ActionBar({
  hasEmployerEmail,
  sourceUrl,
  onSend,
  onSkip,
  onSave,
  busy = false,
  pendingAction = null,
  embedded = false,
  showSave = true,
}: ActionBarProps) {
  const label = (action: JobDetailAction, fallback: string) =>
    pendingAction === action ? `${fallback}…` : fallback;

  return (
    <div
      data-testid="action-bar"
      role="group"
      aria-label="Application actions"
      className={[
        'flex w-full min-w-0 flex-wrap items-center gap-2 sm:gap-3',
        embedded
          ? 'p-0'
          : 'sticky bottom-4 rounded-2xl border border-gray-200 bg-white p-3 shadow-lg sm:p-4',
      ].join(' ')}
    >
      {hasEmployerEmail ? (
        <button
          type="button"
          data-testid="action-send"
          onClick={onSend}
          disabled={busy}
          className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {label('send', 'Send application')}
        </button>
      ) : (
        <a
          data-testid="action-redirect"
          href={sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          Apply on employer site
        </a>
      )}

      {showSave ? (
        <button
          type="button"
          data-testid="action-save"
          onClick={onSave}
          disabled={busy}
          className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50"
        >
          {label('save', 'Save')}
        </button>
      ) : null}

      <button
        type="button"
        data-testid="action-skip"
        onClick={onSkip}
        disabled={busy}
        className="rounded-lg px-5 py-2.5 text-sm font-semibold text-gray-500 hover:bg-gray-50 disabled:opacity-50"
      >
        {label('skip', 'Skip')}
      </button>

      {!hasEmployerEmail ? (
        <p data-testid="redirect-note" className="basis-full text-xs text-gray-500">
          No employer email found — your resume and cover letter are ready for
          manual submission on the employer site.
        </p>
      ) : null}
    </div>
  );
}
