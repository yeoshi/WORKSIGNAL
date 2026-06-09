/**
 * Component/unit tests for onboarding validation logic.
 *
 * Covers:
 *  - Req 4.4: Priority ranking rejects omissions/duplicates with descriptive messages
 *  - Req 5.3: Minimum monthly salary must be a positive number
 *  - Req 3.3: career_switcher requires source and target fields
 */
import { describe, it, expect } from 'vitest';
import {
    validatePriorityRanking,
    validateMinSalary,
    validateCareerSwitch,
} from './validation';

describe('validatePriorityRanking (Req 4.4)', () => {
    it('accepts a valid permutation of all six factors', () => {
        const result = validatePriorityRanking([
            'salary',
            'growth',
            'balance',
            'brand',
            'purpose',
            'stability',
        ]);
        expect(result).toEqual({ ok: true });
    });

    it('accepts any valid ordering of the six factors', () => {
        const result = validatePriorityRanking([
            'stability',
            'purpose',
            'brand',
            'balance',
            'growth',
            'salary',
        ]);
        expect(result).toEqual({ ok: true });
    });

    it('rejects a ranking that omits a factor and identifies missing factor', () => {
        const result = validatePriorityRanking([
            'salary',
            'growth',
            'balance',
            'brand',
            'purpose',
            // stability missing
        ]);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.message).toContain('missing');
            expect(result.message).toContain('Stability');
        }
    });

    it('rejects a ranking with duplicates and identifies duplicated factor', () => {
        const result = validatePriorityRanking([
            'salary',
            'salary',
            'growth',
            'balance',
            'brand',
            'purpose',
        ]);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.message).toContain('duplicated');
            expect(result.message).toContain('Salary');
            // stability is missing when salary is duplicated
            expect(result.message).toContain('missing');
            expect(result.message).toContain('Stability');
        }
    });

    it('rejects an empty ranking and lists all missing factors', () => {
        const result = validatePriorityRanking([]);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.message).toContain('missing');
            expect(result.message).toContain('Salary');
            expect(result.message).toContain('Growth');
            expect(result.message).toContain('Work-life balance');
            expect(result.message).toContain('Company brand');
            expect(result.message).toContain('Purpose');
            expect(result.message).toContain('Stability');
        }
    });

    it('rejects unrecognised entries and reports them', () => {
        const result = validatePriorityRanking([
            'salary',
            'growth',
            'balance',
            'brand',
            'purpose',
            'unknown_factor',
        ]);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.message).toContain('unrecognised');
            expect(result.message).toContain('unknown_factor');
            expect(result.message).toContain('missing');
            expect(result.message).toContain('Stability');
        }
    });

    it('does not persist anything on rejection (returns ok: false)', () => {
        const result = validatePriorityRanking(['salary', 'salary', 'growth']);
        expect(result.ok).toBe(false);
    });
});

describe('validateMinSalary (Req 5.3)', () => {
    it('accepts a positive number', () => {
        const result = validateMinSalary('5000');
        expect(result).toEqual({ ok: true });
    });

    it('accepts a positive decimal', () => {
        const result = validateMinSalary('3500.50');
        expect(result).toEqual({ ok: true });
    });

    it('rejects zero', () => {
        const result = validateMinSalary('0');
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.message).toContain('positive number');
        }
    });

    it('rejects negative values', () => {
        const result = validateMinSalary('-1000');
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.message).toContain('positive number');
        }
    });

    it('rejects non-numeric strings', () => {
        const result = validateMinSalary('abc');
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.message).toContain('positive number');
        }
    });

    it('rejects an empty string', () => {
        const result = validateMinSalary('');
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.message).toContain('Enter a minimum monthly salary');
        }
    });

    it('rejects whitespace-only input', () => {
        const result = validateMinSalary('   ');
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.message).toContain('Enter a minimum monthly salary');
        }
    });

    it('rejects Infinity', () => {
        const result = validateMinSalary('Infinity');
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.message).toContain('positive number');
        }
    });
});

describe('validateCareerSwitch (Req 3.3)', () => {
    it('requires both from and to fields when stage is career_switcher', () => {
        const result = validateCareerSwitch('career_switcher', '', '');
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.message).toContain('switching from');
            expect(result.message).toContain('switching to');
        }
    });

    it('rejects when only "from" is provided for career_switcher', () => {
        const result = validateCareerSwitch('career_switcher', 'Marketing', '');
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.message).toBeTruthy();
        }
    });

    it('rejects when only "to" is provided for career_switcher', () => {
        const result = validateCareerSwitch('career_switcher', '', 'Software Engineering');
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.message).toBeTruthy();
        }
    });

    it('accepts when both from and to are provided for career_switcher', () => {
        const result = validateCareerSwitch(
            'career_switcher',
            'Marketing',
            'Software Engineering',
        );
        expect(result).toEqual({ ok: true });
    });

    it('does not require from/to for fresh_grad', () => {
        const result = validateCareerSwitch('fresh_grad', '', '');
        expect(result).toEqual({ ok: true });
    });

    it('does not require from/to for early_career', () => {
        const result = validateCareerSwitch('early_career', '', '');
        expect(result).toEqual({ ok: true });
    });

    it('does not require from/to for mid_career', () => {
        const result = validateCareerSwitch('mid_career', '', '');
        expect(result).toEqual({ ok: true });
    });

    it('does not require from/to for senior', () => {
        const result = validateCareerSwitch('senior', '', '');
        expect(result).toEqual({ ok: true });
    });

    it('rejects whitespace-only fields for career_switcher', () => {
        const result = validateCareerSwitch('career_switcher', '   ', '   ');
        expect(result.ok).toBe(false);
    });
});
