import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button, Card, Input, Modal, ModalFooter, notify } from '@/components/ui';
import RecentOperationsSection from './RecentOperationsSection';
import { SectionHeader } from './SectionHeader';

async function downloadFile(url: string, filename: string) {
  try {
    const response = await api.get(url, { responseType: 'blob' });
    const blob = new Blob([response.data], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  } catch {
    notify.error('Download failed', 'Could not export the file. Please try again.');
  }
}

export function DataSection() {
  const [cleanStartDate, setCleanStartDate] = useState('');
  const [deleteHistoryModalOpen, setDeleteHistoryModalOpen] = useState(false);
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: (date: string) =>
      api.delete(`/transactions/before?date=${encodeURIComponent(date)}`).then((r) => r.data as { count: number }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      setDeleteHistoryModalOpen(false);
      setCleanStartDate('');
      notify.success(`${data.count} transaction${data.count !== 1 ? 's' : ''} archived`);
    },
    onError: () => {
      setDeleteHistoryModalOpen(false);
      notify.error('Failed to archive transactions');
    },
  });

  function handleDeleteHistory() {
    deleteMutation.mutate(cleanStartDate);
  }

  return (
    <div>
      <SectionHeader title="Data" description="Export your data or manage transaction history." />

      <div className="flex flex-col gap-6" style={{ maxWidth: 560 }}>
        <Card padding="lg">
          <div className="mb-4 font-semibold text-[var(--color-text)]">
            Export Data
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-[var(--color-text)]">Transactions</div>
                <div className="text-xs text-[var(--color-text-muted)]">Download all transactions as CSV</div>
              </div>
              <Button variant="secondary" size="sm" onClick={() => downloadFile('/transactions/export/csv', 'transactions.csv')}>
                Download CSV
              </Button>
            </div>
            <div className="h-px bg-[var(--color-border)]" />
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-[var(--color-text)]">Account Balances</div>
                <div className="text-xs text-[var(--color-text-muted)]">Download account balance history as CSV</div>
              </div>
              <Button variant="secondary" size="sm" onClick={() => downloadFile('/accounts/export/csv', 'account-balances.csv')}>
                Download CSV
              </Button>
            </div>
            <div className="h-px bg-[var(--color-border)]" />
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-[var(--color-text)]">All Data</div>
                <div className="text-xs text-[var(--color-text-muted)]">Export all your financial data as a multi-sheet Excel workbook</div>
              </div>
              <Button variant="secondary" size="sm" onClick={() => downloadFile('/settings/export', `kuber-export-${new Date().toISOString().split('T')[0]}.xlsx`)}>
                Export All
              </Button>
            </div>
          </div>
        </Card>

        <Card padding="lg">
          <RecentOperationsSection />
        </Card>

        <Card padding="lg" className="border-[var(--color-warning)]">
          <div className="mb-2 font-semibold text-[var(--color-warning)]">
            Archive History
          </div>
          <p className="text-sm text-[var(--color-text-secondary)] mb-4">
            Set a clean start date and archive older transactions with a soft delete.
          </p>
          <div className="flex gap-3 items-end">
            <Input
              label="Archive transactions before"
              type="date"
              value={cleanStartDate}
              onChange={(e) => setCleanStartDate(e.target.value)}
              style={{ maxWidth: 220 }}
            />
            <Button
              variant="outline"
              className="border-[var(--color-warning)] text-[var(--color-warning)] mb-0.5"
              disabled={!cleanStartDate}
              onClick={() => setDeleteHistoryModalOpen(true)}
            >
              Archive history
            </Button>
          </div>
        </Card>
      </div>

      <Modal
        open={deleteHistoryModalOpen}
        onClose={() => setDeleteHistoryModalOpen(false)}
        title="Archive Transaction History"
        description="This hides matching transactions from active views and reports."
        size="sm"
      >
        <p className="text-sm text-[var(--color-text)]">
          All transactions before <strong>{cleanStartDate}</strong> will be soft-deleted and hidden from active views.
        </p>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setDeleteHistoryModalOpen(false)}>Cancel</Button>
          <Button variant="danger" onClick={handleDeleteHistory} disabled={deleteMutation.isPending}>
            {deleteMutation.isPending ? 'Archiving...' : 'Archive history'}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
