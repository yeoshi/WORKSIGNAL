export class RejectError extends Error {
  readonly code = 'REJECT' as const;

  constructor(
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'RejectError';
  }
}
