'use client';

export interface PillTabOption {
  id: string;
  label: string;
}

export interface PillTabsProps {
  options: PillTabOption[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
  'data-testid'?: string;
}

export function PillTabs({
  options,
  value,
  onChange,
  className = '',
  'data-testid': testId = 'pill-tabs',
}: PillTabsProps) {
  return (
    <div
      data-testid={testId}
      className={['flex flex-wrap gap-2', className].filter(Boolean).join(' ')}
      role="tablist"
    >
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={active}
            data-testid={`${testId}-${option.id}`}
            onClick={() => onChange(option.id)}
            className={[
              'rounded-full px-4 py-1.5 text-sm font-medium transition',
              active
                ? 'bg-gray-900 text-white'
                : 'text-gray-500 hover:text-gray-700',
            ].join(' ')}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
