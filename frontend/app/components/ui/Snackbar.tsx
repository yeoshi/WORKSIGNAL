'use client';

import { useEffect } from 'react';

export interface SnackbarProps {
  open: boolean;
  message: string;
  variant?: 'success' | 'error';
  onClose: () => void;
  autoHideMs?: number;
}

export function Snackbar({
  open,
  message,
  variant = 'success',
  onClose,
  autoHideMs = 4000,
}: SnackbarProps) {
  useEffect(() => {
    if (!open) return;

    const timer = window.setTimeout(onClose, autoHideMs);
    return () => window.clearTimeout(timer);
  }, [open, message, autoHideMs, onClose]);

  if (!open) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4"
      role="status"
      aria-live="polite"
    >
      <div
        data-testid="snackbar"
        data-variant={variant}
        className={[
          'pointer-events-auto max-w-md rounded-xl border px-4 py-3 text-sm font-medium shadow-card',
          variant === 'success'
            ? 'border-ws-teal/30 bg-ws-card text-ws-ink'
            : 'border-red-200 bg-ws-card text-red-700',
        ].join(' ')}
      >
        {message}
      </div>
    </div>
  );
}
