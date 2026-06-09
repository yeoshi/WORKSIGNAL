/**
 * Property 8: Verdict accepted iff schema-conformant with scores in range.
 *
 * Feature: worksignal, Property 8
 * Validates: Requirements 10.2, 10.3, 10.4, 10.5, 11.1, 11.2, 11.3
 *
 * `validateVerdict(raw, agent)` returns a valid {@link Verdict} **if and only
 * if** the raw input is schema-conformant for that agent (Req 10.2-10.5, 11.1)
 * AND every numeric score it carries lies within 0-100 inclusive (Req 11.2);
 * otherwise it returns an {@link InvalidVerdict} (the failed-evaluation marker,
 * Req 11.3).
 *
 * Generators produce, for every agent:
 *  - schema-conformant verdicts with in-range scores (including the boundary
 *    values 0 and 100) — expected ACCEPTED;
 *  - out-of-range scores (e.g. -1, 101, NaN, +/-Infinity) — expected REJECTED;
 *  - malformed shapes (wrong field types, missing fields, bad enum values,
 *    non-object / non-JSON inputs) — expected REJECTED.
 *
 * Inputs are exercised both as already-parsed objects and as JSON strings
 * (Req 11.1, "valid JSON conforming to the schema").
 *
 * fast-check, minimum 100 iterations.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { AgentName } from '@worksignal/shared';
import { isInvalidVerdict, validateVerdict } from './verdictValidator.js';

// --- Shared building blocks -------------------------------------------------

/** A finite numeric score within 0-100 inclusive (the acceptance window). */
const inRangeScoreArb = fc.integer({ min: 0, max: 100 });

/** Explicit boundary scores that must be ACCEPTED (0 and 100 inclusive). */
const boundaryScoreArb = fc.constantFrom(0, 100);

/**
 * Scores that must be REJECTED: strictly outside 0-100, or non-finite.
 * Includes the named adversarial values -1, 101, NaN and the infinities.
 */
const outOfRangeScoreArb = fc.oneof(
  fc.constantFrom(-1, 101, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY),
  fc.integer({ min: -100000, max: -1 }),
  fc.integer({ min: 101, max: 100000 }),
  fc.double({ min: -1e6, max: -0.0001, noNaN: true }),
  fc.double({ min: 100.0001, max: 1e6, noNaN: true }),
);

const textArb = fc.string();
const stringArrayArb = fc.array(textArb);

const severityArb = fc.constantFrom('high', 'medium', 'low');
const redFlagArb = fc.record({
  flag: textArb,
  source: textArb,
  severity: severityArb,
});

// --- Valid (schema-conformant, in-range) verdict generators -----------------
// Each draws its score from a mix of the full 0-100 range and the exact
// boundary values so 0 and 100 are routinely exercised.

const validScoreArb = fc.oneof(inRangeScoreArb, boundaryScoreArb);

const validAmbitionArb = fc.record({
  verdict: fc.constantFrom('apply', 'skip'),
  ambition_score: validScoreArb,
  reasoning: textArb,
  key_argument: textArb,
});

const validRealismArb = fc.record({
  verdict: fc.constantFrom('apply', 'skip', 'caution'),
  match_score: validScoreArb,
  key_gaps: stringArrayArb,
  work_life_flags: stringArrayArb,
  reasoning: textArb,
  key_argument: textArb,
});

const validRiskArb = fc.record({
  verdict: fc.constantFrom('safe', 'caution', 'avoid'),
  risk_score: validScoreArb,
  red_flags: fc.array(redFlagArb),
  // glassdoor_score: null OR an in-range numeric score (range-checked per impl).
  glassdoor_score: fc.option(validScoreArb, { nil: null }),
  reasoning: textArb,
  key_argument: textArb,
});

const validOpportunityArb = fc.record({
  verdict: fc.constantFrom('act_now', 'monitor', 'no_advantage'),
  urgency_score: validScoreArb,
  timing_factors: stringArrayArb,
  reasoning: textArb,
  key_argument: textArb,
});

/** A valid verdict paired with its agent name. */
const validCaseArb: fc.Arbitrary<{ agent: AgentName; raw: Record<string, unknown> }> =
  fc.oneof(
    validAmbitionArb.map((raw) => ({ agent: 'ambition' as AgentName, raw })),
    validRealismArb.map((raw) => ({ agent: 'realism' as AgentName, raw })),
    validRiskArb.map((raw) => ({ agent: 'risk' as AgentName, raw })),
    validOpportunityArb.map((raw) => ({ agent: 'opportunity' as AgentName, raw })),
  );

// --- Out-of-range-score variants (otherwise schema-conformant) --------------
// Start from a valid verdict, then overwrite its primary score field with an
// out-of-range value. These must be REJECTED purely on the score rule.

const outOfRangeAmbitionArb = fc
  .tuple(validAmbitionArb, outOfRangeScoreArb)
  .map(([base, bad]) => ({
    agent: 'ambition' as AgentName,
    raw: { ...base, ambition_score: bad },
  }));

const outOfRangeRealismArb = fc
  .tuple(validRealismArb, outOfRangeScoreArb)
  .map(([base, bad]) => ({
    agent: 'realism' as AgentName,
    raw: { ...base, match_score: bad },
  }));

const outOfRangeRiskArb = fc
  .tuple(validRiskArb, outOfRangeScoreArb)
  .map(([base, bad]) => ({
    agent: 'risk' as AgentName,
    raw: { ...base, risk_score: bad },
  }));

// glassdoor_score out of range (non-null) must also be rejected (Req 11.2).
const outOfRangeGlassdoorArb = fc
  .tuple(validRiskArb, outOfRangeScoreArb)
  .map(([base, bad]) => ({
    agent: 'risk' as AgentName,
    raw: { ...base, glassdoor_score: bad },
  }));

const outOfRangeOpportunityArb = fc
  .tuple(validOpportunityArb, outOfRangeScoreArb)
  .map(([base, bad]) => ({
    agent: 'opportunity' as AgentName,
    raw: { ...base, urgency_score: bad },
  }));

const outOfRangeCaseArb = fc.oneof(
  outOfRangeAmbitionArb,
  outOfRangeRealismArb,
  outOfRangeRiskArb,
  outOfRangeGlassdoorArb,
  outOfRangeOpportunityArb,
);

// --- Malformed-shape variants -----------------------------------------------
// Schema violations unrelated to score range: bad enum, wrong field types,
// missing required fields. All must be REJECTED (Req 11.1).

const agentArb = fc.constantFrom<AgentName>('ambition', 'realism', 'risk', 'opportunity');

/** Valid base object for the given agent (used to derive malformed variants). */
function validBaseFor(agent: AgentName): fc.Arbitrary<Record<string, unknown>> {
  switch (agent) {
    case 'ambition':
      return validAmbitionArb;
    case 'realism':
      return validRealismArb;
    case 'risk':
      return validRiskArb;
    case 'opportunity':
      return validOpportunityArb;
    default:
      return validAmbitionArb;
  }
}

/** Primary score field name for the given agent. */
const SCORE_FIELD: Record<AgentName, string> = {
  ambition: 'ambition_score',
  realism: 'match_score',
  risk: 'risk_score',
  opportunity: 'urgency_score',
};

/**
 * Malformed cases: take a valid base for a random agent and corrupt it in one
 * of several schema-violating ways.
 */
const malformedCaseArb: fc.Arbitrary<{ agent: AgentName; raw: unknown }> = agentArb
  .chain((agent) =>
    fc
      .tuple(
        validBaseFor(agent),
        fc.constantFrom(
          'bad_verdict',
          'score_not_number',
          'missing_verdict',
          'missing_score',
          'reasoning_not_string',
        ),
      )
      .map(([base, kind]) => {
        const raw: Record<string, unknown> = { ...base };
        switch (kind) {
          case 'bad_verdict':
            raw.verdict = 'definitely_not_a_valid_verdict_value';
            break;
          case 'score_not_number':
            raw[SCORE_FIELD[agent]] = 'not-a-number';
            break;
          case 'missing_verdict':
            delete raw.verdict;
            break;
          case 'missing_score':
            delete raw[SCORE_FIELD[agent]];
            break;
          case 'reasoning_not_string':
            raw.reasoning = 12345;
            break;
        }
        return { agent, raw };
      }),
  );

/** Non-object / non-JSON-object inputs that must all be REJECTED. */
const nonObjectCaseArb: fc.Arbitrary<{ agent: AgentName; raw: unknown }> = fc
  .tuple(
    agentArb,
    fc.oneof(
      fc.constant(null),
      fc.constant(undefined),
      fc.integer(),
      fc.boolean(),
      fc.array(fc.anything()),
      // A string that is not valid JSON.
      fc.constantFrom('not json', '{ broken', ''),
      // Valid JSON that is not an object (number / array / null as text).
      fc.constantFrom('42', '[1,2,3]', 'null', '"a string"'),
    ),
  )
  .map(([agent, raw]) => ({ agent, raw }));

// --- Property 8 -------------------------------------------------------------

describe('Feature: worksignal, Property 8: Verdict accepted iff schema-conformant with scores in range', () => {
  it('ACCEPTS schema-conformant verdicts with in-range scores (object input)', () => {
    fc.assert(
      fc.property(validCaseArb, ({ agent, raw }) => {
        const result = validateVerdict(raw, agent);
        expect(isInvalidVerdict(result)).toBe(false);
      }),
      { numRuns: 200 },
    );
  });

  it('ACCEPTS schema-conformant verdicts with in-range scores (JSON string input)', () => {
    fc.assert(
      fc.property(validCaseArb, ({ agent, raw }) => {
        const result = validateVerdict(JSON.stringify(raw), agent);
        expect(isInvalidVerdict(result)).toBe(false);
      }),
      { numRuns: 200 },
    );
  });

  it('ACCEPTS boundary scores 0 and 100', () => {
    fc.assert(
      fc.property(
        validCaseArb,
        boundaryScoreArb,
        ({ agent, raw }, boundary) => {
          const withBoundary = { ...raw, [SCORE_FIELD[agent]]: boundary };
          const result = validateVerdict(withBoundary, agent);
          expect(isInvalidVerdict(result)).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('REJECTS verdicts whose numeric score is out of 0-100 range', () => {
    fc.assert(
      fc.property(outOfRangeCaseArb, ({ agent, raw }) => {
        const result = validateVerdict(raw, agent);
        expect(isInvalidVerdict(result)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it('REJECTS malformed (non-schema-conformant) verdicts', () => {
    fc.assert(
      fc.property(malformedCaseArb, ({ agent, raw }) => {
        const result = validateVerdict(raw, agent);
        expect(isInvalidVerdict(result)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it('REJECTS non-object and non-JSON inputs', () => {
    fc.assert(
      fc.property(nonObjectCaseArb, ({ agent, raw }) => {
        const result = validateVerdict(raw, agent);
        expect(isInvalidVerdict(result)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });
});
