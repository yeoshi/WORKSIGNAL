/**
 * Company header for the Network Suggestions view (Req 20.5).
 *
 * Displays the target company name and the number of applications that
 * triggered the Network_Agent (≥2, Req 20.1).
 */

export interface CompanyHeaderProps {
    /** Target company name. */
    company: string;
    /** Number of applications sent to this company. */
    applicationCount: number;
}

export function CompanyHeader({ company, applicationCount }: CompanyHeaderProps) {
    return (
        <header data-testid="company-header" className="flex flex-col gap-1">
            <p className="text-sm font-medium uppercase tracking-wide text-gray-500">
                Network suggestions for
            </p>
            <h1 data-testid="company-name" className="text-3xl font-bold text-gray-900">
                {company}
            </h1>
            <p data-testid="application-count" className="text-sm text-gray-600">
                {applicationCount} {applicationCount === 1 ? 'application' : 'applications'} sent
            </p>
        </header>
    );
}
