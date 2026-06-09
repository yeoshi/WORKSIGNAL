import { describe, it, expect } from 'vitest';
import { Logger, createLogger, type LogEntry } from './logger.js';

function capture() {
  const entries: LogEntry[] = [];
  return {
    entries,
    sink: (e: LogEntry) => entries.push(e),
    fixedNow: () => new Date('2025-01-01T00:00:00.000Z'),
  };
}

describe('structured logger', () => {
  it('emits a JSON entry with timestamp, level, and message', () => {
    const { entries, sink, fixedNow } = capture();
    const log = new Logger({ sink, now: fixedNow });
    log.info('scan complete', { jobs: 5 });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      level: 'info',
      message: 'scan complete',
      jobs: 5,
      timestamp: '2025-01-01T00:00:00.000Z',
    });
  });

  it('merges immutable context into every entry', () => {
    const { entries, sink } = capture();
    const log = new Logger({ sink, context: { userId: 'u1', component: 'PreFilter' } });
    log.warn('discarded job', { jobId: 'j9' });
    expect(entries[0]).toMatchObject({
      userId: 'u1',
      component: 'PreFilter',
      jobId: 'j9',
      level: 'warn',
    });
  });

  it('child() derives a logger with additional context', () => {
    const { entries, sink } = capture();
    const parent = new Logger({ sink, context: { userId: 'u1' } });
    const child = parent.child({ jobId: 'j2' });
    child.info('debate started');
    expect(entries[0]).toMatchObject({ userId: 'u1', jobId: 'j2' });
  });

  it('respects the minimum level', () => {
    const { entries, sink } = capture();
    const log = new Logger({ sink, minLevel: 'warn' });
    log.debug('nope');
    log.info('nope');
    log.warn('yes');
    log.error('yes');
    expect(entries.map((e) => e.level)).toEqual(['warn', 'error']);
  });

  it('serialises Error objects including custom fields', () => {
    const { entries, sink } = capture();
    const log = new Logger({ sink });
    const err = Object.assign(new Error('bad verdict'), { code: 'INVALID_VERDICT' });
    log.error('verdict invalid', err);
    const logged = entries[0] as LogEntry & { error: Record<string, unknown> };
    expect(logged.error.name).toBe('Error');
    expect(logged.error.message).toBe('bad verdict');
    expect(logged.error.code).toBe('INVALID_VERDICT');
    expect(typeof logged.error.stack).toBe('string');
  });

  it('produces JSON-serialisable entries', () => {
    const { entries, sink } = capture();
    const log = new Logger({ sink });
    log.info('ok', { nested: { a: 1 } });
    expect(() => JSON.stringify(entries[0])).not.toThrow();
  });

  it('createLogger factory builds a working logger', () => {
    const { entries, sink } = capture();
    const log = createLogger({ sink });
    log.info('hi');
    expect(entries).toHaveLength(1);
  });
});
