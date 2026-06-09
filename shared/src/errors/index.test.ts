import { describe, it, expect } from 'vitest';
import {
  RejectError,
  RankingError,
  ValidationError,
  ParseFailure,
  InvalidVerdict,
  WorkSignalError,
  isWorkSignalError,
} from './index.js';

describe('typed error classes', () => {
  const cases = [
    { Ctor: RejectError, code: 'REJECT', name: 'RejectError' },
    { Ctor: RankingError, code: 'RANKING', name: 'RankingError' },
    { Ctor: ValidationError, code: 'VALIDATION', name: 'ValidationError' },
    { Ctor: ParseFailure, code: 'PARSE_FAILURE', name: 'ParseFailure' },
    { Ctor: InvalidVerdict, code: 'INVALID_VERDICT', name: 'InvalidVerdict' },
  ] as const;

  for (const { Ctor, code, name } of cases) {
    it(`${name} carries the correct code, name, and instanceof chain`, () => {
      const err = new Ctor('boom', { extra: 1 });
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(WorkSignalError);
      expect(err).toBeInstanceOf(Ctor);
      expect(err.code).toBe(code);
      expect(err.name).toBe(name);
      expect(err.message).toBe('boom');
      expect(err.details).toEqual({ extra: 1 });
      expect(isWorkSignalError(err)).toBe(true);
    });
  }

  it('details is optional', () => {
    const err = new ValidationError('no details');
    expect(err.details).toBeUndefined();
  });

  it('isWorkSignalError rejects non-WorkSignal errors', () => {
    expect(isWorkSignalError(new Error('plain'))).toBe(false);
    expect(isWorkSignalError('nope')).toBe(false);
    expect(isWorkSignalError(null)).toBe(false);
  });

  it('captures a stack trace', () => {
    const err = new RejectError('x');
    expect(typeof err.stack).toBe('string');
    expect(err.stack).toContain('RejectError');
  });
});
