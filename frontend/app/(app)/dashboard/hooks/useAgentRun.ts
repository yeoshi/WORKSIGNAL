'use client';

import { useState, useRef, useCallback } from 'react';
import type { AgentRunEvent } from '../../../api/agent/run/route';

export type RunState = 'idle' | 'running' | 'complete' | 'error';

export interface AgentRunState {
    state: RunState;
    events: AgentRunEvent[];
    error: string | null;
    start: () => void;
    reset: () => void;
}

export function useAgentRun(onComplete?: () => void): AgentRunState {
    const [state, setState] = useState<RunState>('idle');
    const [events, setEvents] = useState<AgentRunEvent[]>([]);
    const [error, setError] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);

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

        (async () => {
            try {
                const res = await fetch('/api/agent/run', { signal: ctrl.signal });
                if (!res.ok || !res.body) {
                    const text = await res.text().catch(() => '');
                    let msg = text || `HTTP ${res.status}`;
                    try {
                        const payload = JSON.parse(text) as { message?: string };
                        if (payload.message) msg = payload.message;
                    } catch {
                        // not JSON — use raw text
                    }
                    throw new Error(msg);
                }

                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';

                for (let reading = true; reading;) {
                    const { done, value } = await reader.read();
                    if (done) { reading = false; continue; }

                    buffer += decoder.decode(value, { stream: true });
                    const parts = buffer.split('\n\n');
                    buffer = parts.pop() ?? '';

                    for (const part of parts) {
                        const line = part.trim();
                        if (!line.startsWith('data:')) continue;
                        try {
                            const event = JSON.parse(line.slice(5).trim()) as AgentRunEvent;
                            setEvents((prev) => [...prev, event]);

                            if (event.type === 'run_complete') {
                                setState('complete');
                                onComplete?.();
                            }
                            if (event.type === 'error') {
                                setState('error');
                                setError(event.message);
                            }
                        } catch {
                            // malformed SSE line — skip
                        }
                    }
                }
            } catch (err) {
                if ((err as Error).name === 'AbortError') return;
                const msg = err instanceof Error ? err.message : String(err);
                setState('error');
                setError(msg);
                setEvents((prev) => [...prev, { type: 'error', message: msg }]);
            }
        })();
    }, [onComplete]);

    return { state, events, error, start, reset };
}
