import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, Skeleton } from '@/components/ui';
import { SectionHeader } from './SectionHeader';

interface AuditLogItem {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  changes?: unknown;
  createdAt: string;
  user: string;
}

export function AuditLogSection() {
  const { data: logs = [], isLoading } = useQuery<AuditLogItem[]>({
    queryKey: ['audit-log'],
    queryFn: () => api.get('/audit?limit=100').then((r) => r.data),
  });

  return (
    <div>
      <SectionHeader
        title="Audit Log"
        description="Review recent financial record changes in this household."
      />

      <Card padding="lg">
        {isLoading ? (
          <div className="flex flex-col gap-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} height={48} />)}
          </div>
        ) : logs.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">No audit activity yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left text-xs uppercase tracking-[0.06em] text-[var(--color-text-muted)]">
                  <th className="py-2 pr-3 font-semibold">Time</th>
                  <th className="py-2 pr-3 font-semibold">User</th>
                  <th className="py-2 pr-3 font-semibold">Action</th>
                  <th className="py-2 pr-3 font-semibold">Entity</th>
                  <th className="py-2 font-semibold">Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-[var(--color-border)] last:border-b-0">
                    <td className="py-2 pr-3 whitespace-nowrap text-[var(--color-text-secondary)]">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2 pr-3 text-[var(--color-text)]">{log.user || 'Unknown'}</td>
                    <td className="py-2 pr-3">
                      <span className="rounded-full bg-[var(--color-surface-hover)] px-2 py-0.5 text-xs font-semibold text-[var(--color-text-secondary)]">
                        {log.action}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-[var(--color-text)]">{log.entity}</td>
                    <td className="py-2 text-xs text-[var(--color-text-muted)]">
                      <code>{log.entityId}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
