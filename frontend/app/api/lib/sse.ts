/**
 * Shared Server-Sent Events helpers for in-process agent run routes.
 *
 * Format: `data: <JSON>\n\n` per event (same as /api/agent/run).
 */

export type SseEmit<T extends { type: string }> = (event: T) => Promise<void>;

export function createSseResponse<T extends { type: string }>(
  run: (emit: SseEmit<T>) => Promise<void>,
): Response {
  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();

  const emit: SseEmit<T> = async (event) => {
    try {
      await writer.write(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
    } catch {
      // client disconnected
    }
  };

  void run(emit)
    .catch(async (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      await emit({ type: 'error', message: msg } as T);
    })
    .finally(() => {
      void writer.close();
    });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
