'use client';

export interface RunAgentButtonProps {
  label: string;
  runningLabel?: string;
  running?: boolean;
  disabled?: boolean;
  onClick: () => void;
  testId?: string;
  ariaLabel?: string;
}

export function RunAgentButton({
  label,
  runningLabel = 'Running…',
  running = false,
  disabled = false,
  onClick,
  testId = 'run-agent-button',
  ariaLabel,
}: RunAgentButtonProps) {
  const isDisabled = disabled || running;

  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      disabled={isDisabled}
      className={[
        'inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition',
        isDisabled
          ? 'cursor-not-allowed border-ws-teal/40 bg-ws-teal/10 text-ws-teal'
          : 'border-ws-line bg-ws-card text-ws-ink hover:border-ws-teal/50 hover:bg-ws-paper',
      ].join(' ')}
      aria-label={ariaLabel ?? label}
    >
      {running ? (
        <>
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-ws-teal border-t-transparent" />
          {runningLabel}
        </>
      ) : (
        <>
          <svg
            aria-hidden
            className="h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 3l14 9-14 9V3z" />
          </svg>
          {label}
        </>
      )}
    </button>
  );
}
