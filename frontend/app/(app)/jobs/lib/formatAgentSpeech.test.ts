import { describe, it, expect } from 'vitest';
import { formatAgentSpeech } from './formatAgentSpeech';

describe('formatAgentSpeech', () => {
  it('wraps plain reasoning with a conversational opener', () => {
    const speech = formatAgentSpeech({
      reasoning: 'Strong career-ceiling lift with leadership scope.',
    });
    expect(speech).toBe(
      "Here's my read: Strong career-ceiling lift with leadership scope.",
    );
  });

  it('preserves reasoning that already starts in first person', () => {
    const speech = formatAgentSpeech({
      reasoning: "I'd say this role offers significant upside.",
    });
    expect(speech).toBe("I'd say this role offers significant upside.");
  });

  it('appends key argument as a takeaway', () => {
    const speech = formatAgentSpeech({
      reasoning: 'Good match with minor skill gap.',
      keyArgument: 'Profile is competitive despite high competition.',
    });
    expect(speech).toContain("Here's my read: Good match with minor skill gap.");
    expect(speech).toContain("I'd say your profile is competitive despite high competition.");
  });

  it('converts third-person user references to second person', () => {
    const speech = formatAgentSpeech({
      reasoning: "The user's SQL skills align well with requirements.",
    });
    expect(speech).toContain('Your SQL skills align well with requirements.');
  });
});
