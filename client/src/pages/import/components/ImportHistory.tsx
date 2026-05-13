/**
 * ImportHistory.tsx
 * Paginated log of past imports for the household.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { Skeleton } from '@/components/ui';

interface ImportHistoryItem {
  id: string;
  filename: string;
  bankSource: string | null;
  rowsTotal: number;
  rowsImported: number;
  rowsDuplicate: number;
  rowsSkipped: number;
  status: 'completed' | 'partial' | 'failed';
  createdAt: string;
}

const BANK_NAMES: Record<string, string> = {
  'td-canada': 'TD Canada Trust',
  'rbc-canada': 'RBC Royal Bank',
  'cibc-canada': 'CIBC',
  'bmo-canada': 'BMO',
  'scotiabank-canada': 'Scotiabank',
  'chase-us': 'Chase',
  'bofa-us': 'Bank of America',
  'wellsfargo-us': 'Wells Fargo',
  'capitalone-us': 'Capital One',
  'amex-us': 'American Express',
  generic: 'Generic CSV',
  'pdf-extracted': 'PDF',
};

export default function ImportHistory() {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['import-history', page],
    queryFn: async () => {
      const res = await api.get(`/import/history?page=${page}&limit=20`);
      return res.data as { items: ImportHistoryItem[]; total: number; limit: number };
    },
  });

  const items = data?.items ?? [];
  const totalPages = Math.ceil((data?.total ?? 0) / (data?.limit ?? 20));

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-[color:var(--color-text-secondary)]">
        <FileText size={48} className="mb-3 opacity-40" />
        <p className="font-medium">No imports yet</p>
        <p className="text-sm mt-1">Upload a CSV or PDF statement to get started.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[color:var(--color-border)] overflow-hidden">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-4 px-4 py-3 border-b last:border-0 border-[color:var(--color-border)] hover:bg-[color:var(--color-surface-hover)]"
          >
            <StatusIcon status={item.status} />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{item.filename}</p>
              <p className="text-xs text-[color:var(--color-text-secondary)]">
                {item.bankSource ? (BANK_NAMES[item.bankSource] ?? item.bankSource) : 'Unknown bank'} ·{' '}
                {new Date(item.createdAt).toLocaleDateString(undefined, {
                  year: 'numeric', month: 'short', day: 'numeric',
                })}{' '}
                at {new Date(item.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
            <div className="text-right text-sm shrink-0">
              <p className="font-medium text-green-600 dark:text-green-400">
                {item.rowsImported} imported
              </p>
              {item.rowsDuplicate > 0 && (
                <p className="text-xs text-[color:var(--color-text-secondary)]">{item.rowsDuplicate} duplicates skipped</p>
              )}
              {item.rowsSkipped > 0 && (
                <p className="text-xs text-red-500">{item.rowsSkipped} errors</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            className="px-3 py-1 text-sm rounded border border-[color:var(--color-border)] disabled:opacity-40"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </button>
          <span className="text-sm text-[color:var(--color-text-secondary)]">
            Page {page} of {totalPages}
          </span>
          <button
            className="px-3 py-1 text-sm rounded border border-[color:var(--color-border)] disabled:opacity-40"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'completed') return <CheckCircle2 size={20} className="text-green-500 shrink-0" />;
  if (status === 'partial') return <AlertTriangle size={20} className="text-yellow-500 shrink-0" />;
  return <XCircle size={20} className="text-red-500 shrink-0" />;
}
