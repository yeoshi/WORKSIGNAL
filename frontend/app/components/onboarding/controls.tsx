'use client';

/**
 * Small, reusable form controls shared across the onboarding steps.
 *
 * These are intentionally lightweight (no external UI library) and styled to
 * the WORKSIGNAL Linear/Notion aesthetic (design.md → Design System). They are
 * kept modular so component tests (task 21.2) can target individual controls
 * and their validation messaging.
 */
import { useState, type ReactNode } from 'react';

/** Primary / secondary action button. */
export function Button({
  children,
  onClick,
  type = 'button',
  variant = 'primary',
  disabled = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
}) {
  const base =
    'inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50';
  const styles: Record<typeof variant, string> = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700',
    secondary: 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
    ghost: 'text-gray-600 hover:text-gray-900',
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={[base, styles[variant]].join(' ')}
    >
      {children}
    </button>
  );
}

/** A labelled field wrapper with optional error and hint messaging. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-gray-900">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-gray-500">{hint}</p>}
      {error && (
        <p role="alert" className="text-xs font-medium text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

/** A single-line text input. */
export function TextInput({
  id,
  value,
  onChange,
  placeholder,
  type = 'text',
  invalid = false,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'number';
  invalid?: boolean;
}) {
  return (
    <input
      id={id}
      type={type}
      value={value}
      placeholder={placeholder}
      aria-invalid={invalid || undefined}
      onChange={(e) => onChange(e.target.value)}
      className={[
        'w-full rounded-lg border bg-white px-3 py-2 text-sm text-gray-900 outline-none',
        'focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100',
        invalid ? 'border-red-400' : 'border-gray-300',
      ].join(' ')}
    />
  );
}

/**
 * A free-text tag input: type a value and press Enter (or comma) to add it.
 * Used for target roles, industries, dream companies, and custom dealbreakers.
 */
export function TagInput({
  id,
  values,
  onChange,
  placeholder,
}: {
  id?: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState('');

  function add(raw: string) {
    const tag = raw.trim();
    if (tag === '' || values.includes(tag)) {
      setDraft('');
      return;
    }
    onChange([...values, tag]);
    setDraft('');
  }

  function remove(tag: string) {
    onChange(values.filter((v) => v !== tag));
  }

  return (
    <div
      className={[
        'flex w-full flex-wrap items-center gap-2 rounded-lg border border-gray-300 bg-white px-2 py-2',
        'focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100',
      ].join(' ')}
    >
      {values.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700"
        >
          {tag}
          <button
            type="button"
            aria-label={`Remove ${tag}`}
            onClick={() => remove(tag)}
            className="text-indigo-400 hover:text-indigo-700"
          >
            ×
          </button>
        </span>
      ))}
      <input
        id={id}
        value={draft}
        placeholder={values.length === 0 ? placeholder : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add(draft);
          } else if (e.key === 'Backspace' && draft === '' && values.length > 0) {
            remove(values[values.length - 1] as string);
          }
        }}
        onBlur={() => add(draft)}
        className="min-w-[8rem] flex-1 border-none bg-transparent px-1 py-0.5 text-sm text-gray-900 outline-none"
      />
    </div>
  );
}

/** A vertical radio group bound to a string-literal union value. */
export function RadioGroup<T extends string>({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: T | null;
  options: ReadonlyArray<{ value: T; label: string; description?: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={name} className="flex flex-col gap-2">
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <label
            key={opt.value}
            className={[
              'flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition',
              selected
                ? 'border-indigo-500 bg-indigo-50'
                : 'border-gray-200 bg-white hover:border-gray-300',
            ].join(' ')}
          >
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={selected}
              onChange={() => onChange(opt.value)}
              className="mt-1 h-4 w-4 accent-indigo-600"
            />
            <span className="flex flex-col">
              <span className="text-sm font-medium text-gray-900">
                {opt.label}
              </span>
              {opt.description && (
                <span className="text-xs text-gray-500">{opt.description}</span>
              )}
            </span>
          </label>
        );
      })}
    </div>
  );
}

/** A checkbox group returning the selected subset of a string-literal union. */
export function CheckboxGroup<T extends string>({
  name,
  values,
  options,
  onChange,
}: {
  name: string;
  values: T[];
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (values: T[]) => void;
}) {
  function toggle(option: T) {
    if (values.includes(option)) {
      onChange(values.filter((v) => v !== option));
    } else {
      onChange([...values, option]);
    }
  }
  return (
    <div role="group" aria-label={name} className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const selected = values.includes(opt.value);
        return (
          <label
            key={opt.value}
            className={[
              'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition',
              selected
                ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300',
            ].join(' ')}
          >
            <input
              type="checkbox"
              checked={selected}
              onChange={() => toggle(opt.value)}
              className="h-4 w-4 accent-indigo-600"
            />
            {opt.label}
          </label>
        );
      })}
    </div>
  );
}
