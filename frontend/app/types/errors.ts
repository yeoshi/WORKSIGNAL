export type WorkSignalErrorCode =
  | 'REJECT'
  | 'RANKING'
  | 'VALIDATION'
  | 'PARSE_FAILURE'
  | 'INVALID_VERDICT';

export abstract class WorkSignalError extends Error {
  public abstract readonly code: WorkSignalErrorCode;
  public readonly details?: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    this.name = new.target.name;
    this.details = details;
  }
}

export class RejectError extends WorkSignalError {
  public readonly code = 'REJECT' as const;
}

export class RankingError extends WorkSignalError {
  public readonly code = 'RANKING' as const;
}

export class ValidationError extends WorkSignalError {
  public readonly code = 'VALIDATION' as const;
}

export class ParseFailure extends WorkSignalError {
  public readonly code = 'PARSE_FAILURE' as const;
}

export class InvalidVerdict extends WorkSignalError {
  public readonly code = 'INVALID_VERDICT' as const;
}
