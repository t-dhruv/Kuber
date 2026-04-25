import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { TriggerButton } from './components/TriggerButton';
import { StatusBadge } from './components/StatusBadge';

interface Job {
  name: string;
  lastRunAt?: string;
  lastResult?: 'ok' | 'error';
  lastError?: string;
}

function formatDate(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

export default function JobsPage() {
  const qc = useQueryClient();
  const { data: jobs = [], isLoading } = useQuery<Job[]>({
    queryKey: ['system', 'jobs'],
    queryFn: () => api.get('/api/v1/cron/jobs').then(r => r.data),
    refetchInterval: 10_000,
  });

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-base font-semibold text-[var(--color-text)]">Cron Jobs</h2>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">Background jobs that run on a schedule. Trigger manually or monitor last run status.</p>
      </div>

      {isLoading ? (
        <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>
      ) : (
        <div className="border border-[var(--color-border)] rounded-[var(--radius-md)] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-raised)]">
                <th className="text-left px-4 py-2.5 font-medium text-[var(--color-text-muted)] text-xs">Job</th>
                <th className="text-left px-4 py-2.5 font-medium text-[var(--color-text-muted)] text-xs">Last Run</th>
                <th className="text-left px-4 py-2.5 font-medium text-[var(--color-text-muted)] text-xs">Status</th>
                <th className="text-left px-4 py-2.5 font-medium text-[var(--color-text-muted)] text-xs">Error</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {jobs.map(job => (
                <tr key={job.name} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-4 py-3 font-mono text-xs text-[var(--color-text)]">{job.name}</td>
                  <td className="px-4 py-3 text-xs text-[var(--color-text-muted)]">{formatDate(job.lastRunAt)}</td>
                  <td className="px-4 py-3">
                    {job.lastResult ? (
                      <StatusBadge status={job.lastResult} />
                    ) : (
                      <span className="text-xs text-[var(--color-text-muted)]">Never run</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-red-500 max-w-xs truncate">{job.lastError ?? '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <TriggerButton
                      endpoint={`/api/v1/cron/jobs/${job.name}/trigger`}
                      onSuccess={() => qc.invalidateQueries({ queryKey: ['system', 'jobs'] })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
