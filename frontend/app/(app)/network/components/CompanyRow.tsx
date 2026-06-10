import type { NetworkSuggestion } from '@/app/types/shared';
import { getInitials } from '../../../lib/initials';

export interface CompanyRowProps {
  company: string;
  applicationCount: number;
  suggestions: NetworkSuggestion[];
  onClick?: () => void;
}

export function CompanyRow({
  company,
  applicationCount,
  suggestions,
  onClick,
}: CompanyRowProps) {
  const Wrapper = onClick ? 'button' : 'div';

  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      data-testid="company-row"
      className={[
        'flex w-full items-center justify-between gap-4 rounded-card border border-ws-line bg-ws-card p-5 text-left',
        onClick ? 'cursor-pointer transition hover:border-ws-teal/40 hover:shadow-md' : '',
      ].join(' ')}
    >
      <div className="min-w-0 flex-1">
        <h3 className="font-wordmark text-xl font-semibold text-ws-ink">
          {company}
        </h3>
        <p className="mt-1 text-sm text-ws-muted">
          {suggestions.length} connection
          {suggestions.length === 1 ? '' : 's'} · {applicationCount} application
          {applicationCount === 1 ? '' : 's'}
        </p>
      </div>
      <div className="flex -space-x-2">
        {suggestions.slice(0, 5).map((s) => (
          <span
            key={`${s.type}-${s.name}`}
            title={s.name}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border-2 border-ws-card bg-ws-teal/20 text-xs font-semibold text-ws-teal-mid"
          >
            {getInitials(s.name)}
          </span>
        ))}
        {suggestions.length > 5 && (
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border-2 border-ws-card bg-ws-paper text-xs font-medium text-ws-muted">
            +{suggestions.length - 5}
          </span>
        )}
      </div>
    </Wrapper>
  );
}
