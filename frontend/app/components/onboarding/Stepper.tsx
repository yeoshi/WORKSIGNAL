/**
 * Onboarding progress stepper.
 *
 * Renders the four onboarding steps with the current step highlighted, using
 * the WORKSIGNAL brand indigo (design.md → Design System).
 */

export interface StepperProps {
  /** Ordered step labels. */
  steps: readonly string[];
  /** Zero-based index of the active step. */
  current: number;
}

export function Stepper({ steps, current }: StepperProps) {
  return (
    <ol className="flex items-center gap-3" aria-label="Onboarding progress">
      {steps.map((label, index) => {
        const isComplete = index < current;
        const isActive = index === current;
        return (
          <li key={label} className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span
                aria-current={isActive ? 'step' : undefined}
                className={[
                  'flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold',
                  isActive
                    ? 'bg-indigo-600 text-white'
                    : isComplete
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'bg-gray-100 text-gray-500',
                ].join(' ')}
              >
                {isComplete ? '✓' : index + 1}
              </span>
              <span
                className={[
                  'hidden text-sm font-medium sm:inline',
                  isActive ? 'text-gray-900' : 'text-gray-500',
                ].join(' ')}
              >
                {label}
              </span>
            </div>
            {index < steps.length - 1 && (
              <span className="h-px w-6 bg-gray-200" aria-hidden />
            )}
          </li>
        );
      })}
    </ol>
  );
}
