'use client';

/**
 * Form controls for onboarding — Work Signal brand tokens (paper / teal / navy).
 */
import { useState, type ReactNode } from 'react';

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
    'inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50';
  const styles: Record<typeof variant, string> = {
    primary: 'signal-gradient text-white shadow-sm hover:opacity-95',
    secondary:
      'border border-ws-line bg-ws-card text-ws-ink hover:border-ws-teal/40 hover:bg-ws-paper',
    ghost: 'text-ws-muted hover:text-ws-ink',
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
      <label htmlFor={htmlFor} className="text-sm font-medium text-ws-ink">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-ws-muted">{hint}</p>}
      {error && (
        <p role="alert" className="text-xs font-medium text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

export function TextInput({
  id,
  value,
  onChange,
  placeholder,
  type = 'text',
  invalid = false,
  disabled = false,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'number';
  invalid?: boolean;
  disabled?: boolean;
}) {
  return (
    <input
      id={id}
      type={type}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      aria-invalid={invalid || undefined}
      onChange={(e) => onChange(e.target.value)}
      className={[
        'w-full rounded-xl border bg-ws-card px-3 py-2.5 text-sm text-ws-ink outline-none',
        'focus:border-ws-teal-mid focus:ring-2 focus:ring-ws-teal/20',
        'disabled:cursor-not-allowed disabled:opacity-50',
        invalid ? 'border-red-400' : 'border-ws-line',
      ].join(' ')}
    />
  );
}

export function Textarea({
  id,
  value,
  onChange,
  placeholder,
  rows = 4,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      id={id}
      value={value}
      placeholder={placeholder}
      rows={rows}
      onChange={(e) => onChange(e.target.value)}
      className={[
        'w-full resize-y rounded-xl border border-ws-line bg-ws-card px-3 py-2.5 text-sm text-ws-ink outline-none',
        'focus:border-ws-teal-mid focus:ring-2 focus:ring-ws-teal/20',
      ].join(' ')}
    />
  );
}

export function Select<T extends string>({
  id,
  value,
  onChange,
  options,
}: {
  id?: string;
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<{ value: T; label: string }>;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className={[
        'w-full rounded-xl border border-ws-line bg-ws-card px-3 py-2.5 text-sm text-ws-ink outline-none',
        'focus:border-ws-teal-mid focus:ring-2 focus:ring-ws-teal/20',
      ].join(' ')}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

export function DateRangeFields({
  start,
  end,
  onChangeStart,
  onChangeEnd,
}: {
  start: string;
  end: string;
  onChangeStart: (value: string) => void;
  onChangeEnd: (value: string) => void;
}) {
  const isPresent = end.trim().toLowerCase() === 'present';
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <TextInput value={start} onChange={onChangeStart} placeholder="YYYY-MM" />
      <span className="text-ws-muted">–</span>
      <TextInput
        value={isPresent ? '' : end}
        onChange={onChangeEnd}
        placeholder={isPresent ? 'Present' : 'YYYY-MM'}
        disabled={isPresent}
      />
      <label className="flex items-center gap-2 whitespace-nowrap text-xs text-ws-muted">
        <input
          type="checkbox"
          checked={isPresent}
          onChange={(e) => onChangeEnd(e.target.checked ? 'Present' : '')}
          className="h-4 w-4 accent-ws-teal-mid"
        />
        Present
      </label>
    </div>
  );
}

export function RepeatableSection<T>({
  items,
  onChange,
  createItem,
  renderItem,
  addLabel,
  emptyHint,
}: {
  items: T[];
  onChange: (items: T[]) => void;
  createItem: () => T;
  renderItem: (item: T, update: (patch: Partial<T>) => void, index: number) => ReactNode;
  addLabel: string;
  emptyHint?: string;
}) {
  function update(index: number, patch: Partial<T>) {
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function remove(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  function add() {
    onChange([...items, createItem()]);
  }

  return (
    <div className="flex flex-col gap-3">
      {items.length === 0 && emptyHint && (
        <p className="text-sm text-ws-muted">{emptyHint}</p>
      )}
      {items.map((item, index) => (
        <div
          key={index}
          className="relative flex flex-col gap-3 rounded-xl border border-ws-line bg-ws-card p-4"
        >
          <button
            type="button"
            aria-label="Remove"
            onClick={() => remove(index)}
            className="absolute right-3 top-3 text-ws-muted hover:text-red-600"
          >
            ×
          </button>
          {renderItem(item, (patch) => update(index, patch), index)}
        </div>
      ))}
      <Button variant="secondary" onClick={add}>
        + {addLabel}
      </Button>
    </div>
  );
}

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
        'flex w-full flex-wrap items-center gap-2 rounded-xl border border-ws-line bg-ws-card px-2 py-2',
        'focus-within:border-ws-teal-mid focus-within:ring-2 focus-within:ring-ws-teal/20',
      ].join(' ')}
    >
      {values.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-lg bg-ws-teal/15 px-2 py-1 text-xs font-medium text-ws-teal-mid"
        >
          {tag}
          <button
            type="button"
            aria-label={`Remove ${tag}`}
            onClick={() => remove(tag)}
            className="text-ws-teal-mid hover:text-ws-ink"
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
        className="min-w-[8rem] flex-1 border-none bg-transparent px-1 py-0.5 text-sm text-ws-ink outline-none"
      />
    </div>
  );
}

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
              'flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition',
              selected
                ? 'border-ws-teal-mid bg-ws-teal/10'
                : 'border-ws-line bg-ws-card hover:border-ws-teal/30',
            ].join(' ')}
          >
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={selected}
              onChange={() => onChange(opt.value)}
              className="mt-1 h-4 w-4 accent-ws-teal-mid"
            />
            <span className="flex flex-col">
              <span className="text-sm font-medium text-ws-ink">{opt.label}</span>
              {opt.description && (
                <span className="text-xs text-ws-muted">{opt.description}</span>
              )}
            </span>
          </label>
        );
      })}
    </div>
  );
}

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
              'flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition',
              selected
                ? 'border-ws-teal-mid bg-ws-teal/10 text-ws-teal-mid'
                : 'border-ws-line bg-ws-card text-ws-ink hover:border-ws-teal/30',
            ].join(' ')}
          >
            <input
              type="checkbox"
              checked={selected}
              onChange={() => toggle(opt.value)}
              className="h-4 w-4 accent-ws-teal-mid"
            />
            {opt.label}
          </label>
        );
      })}
    </div>
  );
}
