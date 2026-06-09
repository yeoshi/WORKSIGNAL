// @vitest-environment jsdom
/**
 * Component tests for ConnectionTypeBadge (Req 20.3, 20.5).
 *
 * Verifies correct labels for each connection type tier.
 */

import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ConnectionTypeBadge } from './ConnectionTypeBadge';

describe('ConnectionTypeBadge', () => {
    it('renders "Alumni" label for alumni type', () => {
        render(<ConnectionTypeBadge type="alumni" />);
        expect(screen.getByTestId('badge-alumni')).toHaveTextContent('Alumni');
    });

    it('renders "Community" label for community type', () => {
        render(<ConnectionTypeBadge type="community" />);
        expect(screen.getByTestId('badge-community')).toHaveTextContent('Community');
    });

    it('renders "Cold" label for cold type', () => {
        render(<ConnectionTypeBadge type="cold" />);
        expect(screen.getByTestId('badge-cold')).toHaveTextContent('Cold');
    });
});
