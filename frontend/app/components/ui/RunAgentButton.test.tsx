import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RunAgentButton } from './RunAgentButton';

describe('RunAgentButton', () => {
  it('is disabled while running', () => {
    render(
      <RunAgentButton label="Run Agent" running onClick={() => {}} />,
    );
    expect(screen.getByTestId('run-agent-button')).toBeDisabled();
    expect(screen.getByText('Running…')).toBeInTheDocument();
  });

  it('calls onClick when idle', () => {
    const onClick = vi.fn();
    render(<RunAgentButton label="Run Agent" onClick={onClick} />);
    fireEvent.click(screen.getByTestId('run-agent-button'));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
