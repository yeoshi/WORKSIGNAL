'use client';

import { useEffect, type ReactNode } from 'react';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  /** Optional action rendered beside the close control in the header. */
  titleAction?: ReactNode;
  children: ReactNode;
  size?: 'md' | 'lg' | 'xl';
  /** When false, children manage their own scroll regions (e.g. sticky footers). */
  scrollBody?: boolean;
  footer?: ReactNode;
}

const sizeClasses = {
  md: 'max-w-2xl',
  lg: 'max-w-4xl',
  xl: 'max-w-5xl',
};

export function Modal({
  open,
  onClose,
  title,
  titleAction,
  children,
  size = 'lg',
  scrollBody = true,
  footer,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={typeof title === 'string' ? title : undefined}
    >
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-ws-dark/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={[
          'relative z-10 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-ws-card shadow-modal sm:rounded-2xl',
          sizeClasses[size],
        ].join(' ')}
      >
        {title ? (
          <div className="flex items-center justify-between border-b border-ws-line px-5 py-4 sm:px-6">
            <div className="min-w-0 flex-1 pr-4">
              {typeof title === 'string' ? (
                <h2 className="font-wordmark text-xl font-semibold text-ws-ink">
                  {title}
                </h2>
              ) : (
                title
              )}
            </div>
            <div className="flex items-center gap-2">
              {titleAction}
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-2 text-ws-muted transition hover:bg-ws-paper hover:text-ws-ink"
                aria-label="Close"
              >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
              </button>
            </div>
          </div>
        ) : null}
        <div
          className={[
            scrollBody ? 'flex-1 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6' : 'flex min-h-0 flex-1 flex-col',
          ].join(' ')}
        >
          {scrollBody ? (
            children
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">{children}</div>
          )}
        </div>
        {footer ? (
          <div className="shrink-0 border-t border-ws-line bg-ws-card px-5 py-4 sm:px-6">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
