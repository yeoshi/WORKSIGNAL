// @vitest-environment jsdom
/**
 * Component tests for CompanyHeader (Req 20.5).
 *
 * Verifies the Network view renders:
 * - Target company name
 * - Application count that triggered the Network_Agent
 */

import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { CompanyHeader } from './CompanyHeader';

describe('CompanyHeader', () => {
    it('renders the company name', () => {
        render(<CompanyHeader company="Google" applicationCount={3} />);
        expect(screen.getByTestId('company-name')).toHaveTextContent('Google');
    });

    it('renders the application count with plural', () => {
        render(<CompanyHeader company="Meta" applicationCount={4} />);
        expect(screen.getByTestId('application-count')).toHaveTextContent('4 applications sent');
    });

    it('renders singular "application" for count of 1', () => {
        render(<CompanyHeader company="Stripe" applicationCount={1} />);
        expect(screen.getByTestId('application-count')).toHaveTextContent('1 application sent');
    });
});
