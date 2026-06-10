'use client';

import { useCallback, useRef, useState } from 'react';

export type StreamState = 'idle' | 'running' | 'complete' | 'error';

export interface UseAgentStreamOptions<T extends { type: string }> {
  url: string;
  /** Event `type` values that mark a successful completion. */
  completeTypes?: string[];
  onComplete?: (events: T[]) => void;
}

export interface AgentStreamState<T extends { type: string }> {
  state: StreamState;
  events: T[];
  error: string | null;
  start: () => void;
  reset: () => void;
}

export function useAgentStream<T extends { type: string }>(
  options: UseAgentStreamOptions<T>,
): AgentStreamState<T> {
  const { url, completeTypes = ['complete', 'run_complete'], onComplete } = options;
  const [state, setState] = useState<StreamState>('idle');
  const [events, setEvents] = useState<T[]>([]);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState('idle');
    setEvents([]);
    setError(null);
  }, []);

  const start = useCallback(() => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setState('running');
    setEvents([]);
    setError(null);

    void (async () => {
      try {
        const res = await fetch(url, { signal: ctrl.signal });
        if (!res.ok || !res.body) {
          const text = await res.text().catch(() => '');
          let msg = text || `HTTP ${res.status}`;
          try {
            const payload = JSON.parse(text) as { message?: string };
            if (payload.message) msg = payload.message;
          } catch {
            // not JSON
          }
          throw new Error(msg);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        const collected: T[] = [];

        for (let reading = true; reading;) {
          const { done, value } = await reader.read();
          if (done) {
            reading = false;
            continue;
          }

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() ?? '';

          for (const part of parts) {
            const line = part.trim();
            if (!line.startsWith('data:')) continue;
            try {
              const event = JSON.parse(line.slice(5).trim()) as T;
              collected.push(event);
              setEvents((prev) => [...prev, event]);

              if (completeTypes.includes(event.type)) {
                setState('complete');
                onCompleteRef.current?.(collected);
              }
              if (event.type === 'error' && 'message' in event) {
                setState('error');
                setError(String((event as { message?: string }).message ?? 'Error'));
              }
            } catch {
              // malformed SSE line
            }
          }
        }

        if (collected.length > 0 && !completeTypes.some((t) => collected.some((e) => e.type === t))) {
          const last = collected[collected.length - 1];
          if (last?.type !== 'error') {
            setState('complete');
            onCompleteRef.current?.(collected);
          }
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        const msg = err instanceof Error ? err.message : String(err);
        setState('error');
        setError(msg);
        setEvents((prev) => [...prev, { type: 'error', message: msg } as unknown as T]);
      }
    })();
  }, [url, completeTypes]);

  return { state, events, error, start, reset };
}
