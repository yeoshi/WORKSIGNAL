/**
 * Onboarding progress stepper — Work Signal brand (teal / navy palette).
 */

export interface StepperProps {
  steps: readonly string[];
  current: number;
}

export function Stepper({ steps, current }: StepperProps) {
  return (
    <ol className="flex flex-wrap items-center gap-2 sm:gap-3" aria-label="Onboarding progress">
      {steps.map((label, index) => {
        const isComplete = index < current;
        const isActive = index === current;
        return (
          <li key={label} className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2">
              <span
                aria-current={isActive ? 'step' : undefined}
                className={[
                  'flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold',
                  isActive
                    ? 'signal-gradient text-white shadow-sm'
                    : isComplete
                      ? 'bg-ws-teal/20 text-ws-teal-mid'
                      : 'bg-ws-line text-ws-muted',
                ].join(' ')}
              >
                {isComplete ? '✓' : index + 1}
              </span>
              <span
                className={[
                  'hidden text-sm font-medium sm:inline',
                  isActive ? 'text-ws-ink' : 'text-ws-muted',
                ].join(' ')}
              >
                {label}
              </span>
            </div>
            {index < steps.length - 1 && (
              <span className="h-px w-4 bg-ws-line sm:w-6" aria-hidden />
            )}
          </li>
        );
      })}
    </ol>
  );
}
