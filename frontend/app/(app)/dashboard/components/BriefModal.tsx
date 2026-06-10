'use client';

import { useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { BriefView } from '../../brief/components/BriefView';

export interface BriefModalProps {
  open: boolean;
  onClose: () => void;
}

export function BriefModal({ open, onClose }: BriefModalProps) {
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRunCalibration() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch('/api/brief/run', { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { message?: string };
        throw new Error(body.message ?? `Server error ${res.status}`);
      }
      setRefreshSignal((s) => s + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Calibration failed');
    } finally {
      setRunning(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Weekly Brief" size="xl">
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <span />
          <div className="flex flex-col items-end gap-1">
            <button
              onClick={handleRunCalibration}
              disabled={running}
              className="inline-flex items-center gap-2 rounded-md bg-ws-accent px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {running && (
                <svg
                  className="h-4 w-4 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden
                >
                  <circle cx="12" cy="12" r="10" strokeOpacity={0.25} />
                  <path d="M12 2a10 10 0 0 1 10 10" />
                </svg>
              )}
              {running ? 'Running…' : 'Run Calibration Agent'}
            </button>
            {error && (
              <p className="text-xs text-rose-600">{error}</p>
            )}
          </div>
        </div>
        <BriefView showHeader showIntro refreshSignal={refreshSignal} />
      </div>
    </Modal>
  );
}
