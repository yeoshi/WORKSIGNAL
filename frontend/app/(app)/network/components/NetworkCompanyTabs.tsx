'use client';

import { CheckCircle2 } from 'lucide-react';

export interface NetworkCompanyTabOption {
  id: string;
  label: string;
  completed?: boolean;
}

export interface NetworkCompanyTabsProps {
  options: NetworkCompanyTabOption[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
  'data-testid'?: string;
}

export function NetworkCompanyTabs({
  options,
  value,
  onChange,
  className = '',
  'data-testid': testId = 'network-company-tabs',
}: NetworkCompanyTabsProps) {
  return (
    <div
      data-testid={testId}
      className={['flex flex-wrap gap-2', className].filter(Boolean).join(' ')}
      role="tablist"
    >
      {options.map((option) => {
        const active = option.id === value;
        const completed = option.completed;

        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={active}
            data-testid={`${testId}-${option.id}`}
            data-completed={completed || undefined}
            onClick={() => onChange(option.id)}
            className={[
              'inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition',
              active && completed
                ? 'bg-emerald-600 text-white'
                : active
                  ? 'bg-gray-900 text-white'
                  : completed
                    ? 'text-emerald-600 hover:text-emerald-700'
                    : 'text-gray-500 hover:text-gray-700',
            ].join(' ')}
          >
            {completed && (
              <CheckCircle2
                size={12}
                aria-hidden
                className={active ? 'text-white' : 'text-emerald-500'}
              />
            )}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
