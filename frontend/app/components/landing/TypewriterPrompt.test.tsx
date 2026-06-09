/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { TypewriterPrompt } from './TypewriterPrompt';

describe('TypewriterPrompt', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('types and cycles through sentences', () => {
    render(
      <TypewriterPrompt sentences={['Hi', 'Bye']} />,
    );

    expect(screen.getByTestId('typewriter-prompt').textContent).toContain('');

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(screen.getByTestId('typewriter-prompt').textContent).toContain('H');

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.getByTestId('typewriter-prompt').textContent).toContain('Hi');
  });
});
