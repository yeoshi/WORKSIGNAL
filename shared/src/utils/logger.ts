/**
 * Structured JSON logger for WORKSIGNAL.
 *
 * Emits one JSON object per line (newline-delimited JSON), which is the format
 * CloudWatch Logs Insights and most log aggregators parse natively. A logger
 * carries immutable `context` fields (e.g. `userId`, `jobId`, `component`) that
 * are merged into every entry, so call sites only supply the event-specific
 * fields.
 *
 * Supports the internal analytics logging of discarded jobs (Requirement 9.2)
 * and the logging of invalid agent output detected after completion
 * (Requirement 11.4), among general operational logging.
 */

/** Severity levels in ascending order of importance. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/** Arbitrary structured fields attached to a log entry or logger context. */
export type LogFields = Record<string, unknown>;

/** A fully-formed structured log entry as emitted to the sink. */
export interface LogEntry extends LogFields {
  timestamp: string;
  level: LogLevel;
  message: string;
}

/** Destination for emitted entries; defaults to the console. */
export type LogSink = (entry: LogEntry) => void;

export interface LoggerOptions {
  /** Minimum level to emit; entries below this are dropped. Default `info`. */
  minLevel?: LogLevel;
  /** Immutable context fields merged into every entry. */
  context?: LogFields;
  /** Custom sink. Defaults to writing JSON lines via `console`. */
  sink?: LogSink;
  /** Clock injection for deterministic tests. Defaults to `() => new Date()`. */
  now?: () => Date;
}

const defaultSink: LogSink = (entry) => {
  const line = JSON.stringify(entry);
  if (entry.level === 'error') {
    console.error(line);
  } else if (entry.level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
};

/**
 * Serialise an `Error` into a plain, JSON-safe object so stack traces and
 * custom fields (such as a WorkSignalError `code`) survive `JSON.stringify`.
 */
function serialiseError(err: Error): LogFields {
  const base: LogFields = {
    name: err.name,
    message: err.message,
    stack: err.stack,
  };
  // Capture own enumerable props (e.g. `code`, `details` on WorkSignalError).
  for (const key of Object.keys(err) as Array<keyof typeof err>) {
    base[key as string] = (err as unknown as Record<string, unknown>)[
      key as string
    ];
  }
  return base;
}

/** Normalise any extra argument into mergeable structured fields. */
function toFields(extra?: LogFields | Error): LogFields {
  if (extra === undefined) return {};
  if (extra instanceof Error) return { error: serialiseError(extra) };
  return extra;
}

export class Logger {
  private readonly minLevel: LogLevel;
  private readonly context: LogFields;
  private readonly sink: LogSink;
  private readonly now: () => Date;

  constructor(options: LoggerOptions = {}) {
    this.minLevel = options.minLevel ?? 'info';
    this.context = options.context ?? {};
    this.sink = options.sink ?? defaultSink;
    this.now = options.now ?? (() => new Date());
  }

  /** Create a derived logger with additional, merged context fields. */
  child(context: LogFields): Logger {
    return new Logger({
      minLevel: this.minLevel,
      context: { ...this.context, ...context },
      sink: this.sink,
      now: this.now,
    });
  }

  private emit(level: LogLevel, message: string, extra?: LogFields | Error): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.minLevel]) {
      return;
    }
    const entry: LogEntry = {
      ...this.context,
      ...toFields(extra),
      timestamp: this.now().toISOString(),
      level,
      message,
    };
    this.sink(entry);
  }

  debug(message: string, extra?: LogFields | Error): void {
    this.emit('debug', message, extra);
  }

  info(message: string, extra?: LogFields | Error): void {
    this.emit('info', message, extra);
  }

  warn(message: string, extra?: LogFields | Error): void {
    this.emit('warn', message, extra);
  }

  error(message: string, extra?: LogFields | Error): void {
    this.emit('error', message, extra);
  }
}

/** Convenience factory mirroring the `Logger` constructor. */
export function createLogger(options?: LoggerOptions): Logger {
  return new Logger(options);
}
