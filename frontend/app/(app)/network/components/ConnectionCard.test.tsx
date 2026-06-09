// @vitest-environment jsdom
/**
 * Component tests for ConnectionCard (Req 20.5).
 *
 * Verifies each connection suggestion card renders:
 * - Connection name
 * - Context/headline
 * - Draft outreach message
 * - Connection type badge
 */

import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ConnectionCard } from './ConnectionCard';
import type { NetworkSuggestion } from '@worksignal/shared';

const mockSuggestion: NetworkSuggestion = {
    name: 'Jane Doe',
    type: 'alumni',
    context: 'Senior Engineer at Google, NUS CS 2019',
    outreach_draft: 'Hi Jane, I noticed we both graduated from NUS CS...',
};

describe('ConnectionCard', () => {
    it('renders the connection name', () => {
        render(<ConnectionCard suggestion={mockSuggestion} />);
        expect(screen.getByTestId('connection-name')).toHaveTextContent('Jane Doe');
    });

    it('renders the context/headline', () => {
        render(<ConnectionCard suggestion={mockSuggestion} />);
        expect(screen.getByTestId('connection-context')).toHaveTextContent(
            'Senior Engineer at Google, NUS CS 2019'
        );
    });

    it('renders the outreach draft', () => {
        render(<ConnectionCard suggestion={mockSuggestion} />);
        expect(screen.getByTestId('outreach-draft')).toHaveTextContent(
            'Hi Jane, I noticed we both graduated from NUS CS...'
        );
    });

    it('renders the connection type badge', () => {
        render(<ConnectionCard suggestion={mockSuggestion} />);
        expect(screen.getByTestId('badge-alumni')).toHaveTextContent('Alumni');
    });

    it('renders community badge for community type', () => {
        const community: NetworkSuggestion = { ...mockSuggestion, type: 'community' };
        render(<ConnectionCard suggestion={community} />);
        expect(screen.getByTestId('badge-community')).toHaveTextContent('Community');
    });

    it('renders cold badge for cold type', () => {
        const cold: NetworkSuggestion = { ...mockSuggestion, type: 'cold' };
        render(<ConnectionCard suggestion={cold} />);
        expect(screen.getByTestId('badge-cold')).toHaveTextContent('Cold');
    });

    it('shows placeholder when outreach draft is empty', () => {
        const empty: NetworkSuggestion = { ...mockSuggestion, outreach_draft: '' };
        render(<ConnectionCard suggestion={empty} />);
        expect(screen.getByTestId('outreach-draft-empty')).toHaveTextContent(
            'Draft generating…'
        );
        expect(screen.queryByTestId('outreach-draft')).not.toBeInTheDocument();
    });
});
