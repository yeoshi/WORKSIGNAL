/**
 * Pipeline applications table.
 *
 * Displays each application's Company / Role / Sent date / Status with a
 * status badge (Req 17.1, 17.3). Selecting a row opens that application's
 * original debate via `onRowSelect` (Req 17.4). This component is purely
 * presentational so it can be component-tested in isolation (task 23.2).
 */

import type { Application } from '@/app/types/shared';
import { StatusBadge } from './StatusBadge';
import { formatSentDate } from '../lib/format';

export interface PipelineTableProps {
  applications: Application[];
  /** True while the (silently retrying) initial load is in flight. */
  isLoading?: boolean;
  /** Invoked when a user selects an application row (Req 17.4). */
  onRowSelect?: (application: Application) => void;
}

export function PipelineTable({
  applications,
  isLoading = false,
  onRowSelect,
}: PipelineTableProps) {
  if (isLoading && applications.length === 0) {
    return (
      <div
        data-testid="pipeline-loading"
        className="rounded-lg border border-gray-200 p-8 text-center text-sm text-gray-500"
      >
        Loading your pipeline…
      </div>
    );
  }

  if (applications.length === 0) {
    return (
      <div
        data-testid="pipeline-empty"
        className="rounded-lg border border-gray-200 p-8 text-center text-sm text-gray-500"
      >
        No applications yet.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200" data-testid="pipeline-table">
        <thead className="bg-gray-50">
          <tr>
            <th
              scope="col"
              className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
            >
              Company
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
            >
              Role
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
            >
              Sent
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
            >
              Status
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {applications.map((application) => {
            const selectable = typeof onRowSelect === 'function';
            return (
              <tr
                key={application.application_id}
                data-testid="pipeline-row"
                data-application-id={application.application_id}
                role={selectable ? 'button' : undefined}
                tabIndex={selectable ? 0 : undefined}
                onClick={selectable ? () => onRowSelect?.(application) : undefined}
                onKeyDown={
                  selectable
                    ? (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onRowSelect?.(application);
                        }
                      }
                    : undefined
                }
                className={
                  selectable
                    ? 'cursor-pointer transition-colors hover:bg-gray-50 focus:bg-gray-50 focus:outline-none'
                    : undefined
                }
              >
                <td className="px-4 py-3 text-sm font-medium text-gray-900">
                  {application.company}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">
                  {application.role_title}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {formatSentDate(application)}
                </td>
                <td className="px-4 py-3 text-sm">
                  <StatusBadge status={application.status} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
