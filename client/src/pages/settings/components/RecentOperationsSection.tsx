/**
 * RecentOperationsSection.tsx
 * Shows recent bulk operations (imports, rule runs) with one-click rollback.
 * Lives in Settings > Data Management.
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, ShieldCheck, Loader2, Clock } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui';
import { notify } from '@/components/ui';

interface Checkpoint {
  id: string;
  type: string;
  label: string;
  txnCount: number;
  createdAt: string;
  expiresAt: string;
}

const TYPE_LABELS: Record<string, string> = {
  'bulk-import': 'Import',
  'rule-apply-all': 'Rule Run',
  'bulk-categorize': 'Bulk Categorize',
  'bulk-delete': 'Bulk Delete',
};

export default function RecentOperationsSection() {
  const queryClient = useQueryClient();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const { data: checkpoints = [], isLoading } = useQuery<Checkpoint[]>({
    queryKey: ['checkpoints'],
    queryFn: async () => {
      const res = await api.get('/checkpoints');
      return res.data;
    },
  });

  const rollback = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post(`/checkpoints/${id}/rollback`);
      return res.data as { restored: number };
    },
    onSuccess: (data) => {
      notify.success(`Rolled back — ${data.restored} transaction${data.restored !== 1 ? 's' : ''} restored`);
      setConfirmId(null);
      queryClient.invalidateQueries({ queryKey: ['checkpoints'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Rollback failed';
      notify.error(msg);
      setConfirmId(null);
    },
  });

  function timeAgo(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  function expiresIn(iso: string) {
    const diff = new Date(iso).getTime() - Date.now();
    const hrs = Math.floor(diff / 3600000);
    if (hrs < 1) return 'expires soon';
    if (hrs < 24) return `expires in ${hrs}h`;
    return `expires in ${Math.floor(hrs / 24)}d`;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <ShieldCheck size={18} className="text-[color:var(--color-primary)]" />
        <h3 className="font-semibold">Recent Operations</h3>
        <span className="text-xs text-[color:var(--text-secondary)] ml-1">(rollback available for 7 days)</span>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-[color:var(--text-secondary)]">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </div>
      )}

      {!isLoading && checkpoints.length === 0 && (
        <p className="text-sm text-[color:var(--text-secondary)]">No recent bulk operations.</p>
      )}

      {checkpoints.map((cp) => (
        <div
          key={cp.id}
          className="flex items-center justify-between gap-4 p-3 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)]"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-[color:var(--surface-hover)] text-[color:var(--text-secondary)]">
                {TYPE_LABELS[cp.type] ?? cp.type}
              </span>
              <span className="text-sm font-medium truncate">{cp.label}</span>
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-[color:var(--text-secondary)]">
              <span className="flex items-center gap-1"><Clock size={11} />{timeAgo(cp.createdAt)}</span>
              <span>{cp.txnCount} transaction{cp.txnCount !== 1 ? 's' : ''}</span>
              <span className="opacity-60">{expiresIn(cp.expiresAt)}</span>
            </div>
          </div>

          {confirmId === cp.id ? (
            <div className="flex gap-2 shrink-0">
              <Button
                variant="danger"
                onClick={() => rollback.mutate(cp.id)}
                disabled={rollback.isPending}
              >
                {rollback.isPending ? <Loader2 size={14} className="animate-spin" /> : 'Confirm rollback'}
              </Button>
              <Button variant="secondary" onClick={() => setConfirmId(null)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              variant="secondary"
              onClick={() => setConfirmId(cp.id)}
              className="shrink-0"
            >
              <RotateCcw size={14} className="mr-1.5" />
              Rollback
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
