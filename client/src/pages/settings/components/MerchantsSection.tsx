import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Pencil, Trash2 } from 'lucide-react';

import { Button, Card, Input, Modal, ModalFooter, notify } from '@/components/ui';
import { api } from '@/lib/api';
import { SectionHeader } from './SectionHeader';

type MerchantOrder = 'TRANSACTION_COUNT' | 'NAME';

interface ApiErrorBody {
  error?: string;
}

interface MerchantItem {
  id: string;
  name: string;
  displayName: string;
  logoUrl: string | null;
  transactionCount: number;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError<ApiErrorBody>(error)) {
    return error.response?.data?.error ?? fallback;
  }

  return fallback;
}

export function MerchantsSection() {
  const queryClient = useQueryClient();
  const [order, setOrder] = useState<MerchantOrder>('TRANSACTION_COUNT');
  const [search, setSearch] = useState('');
  const [showCount, setShowCount] = useState(50);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<MerchantItem | null>(null);

  const { data: merchants, isLoading } = useQuery<MerchantItem[]>({
    queryKey: ['settings', 'merchants', order],
    queryFn: () => api.get(`/settings/merchants?order=${order}`).then((r) => r.data),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, displayName }: { id: string; displayName: string }) =>
      api.put(`/settings/merchants/${id}`, { displayName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'merchants'] });
      setEditingId(null);
      notify.success('Merchant updated');
    },
    onError: (error: unknown) => {
      notify.error('Failed to update merchant', getErrorMessage(error, 'Please try again.'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/settings/merchants/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'merchants'] });
      setDeleteTarget(null);
      notify.success('Merchant removed');
    },
    onError: (error: unknown) => {
      notify.error('Failed to delete merchant', getErrorMessage(error, 'Please try again.'));
    },
  });

  const filtered = (merchants ?? []).filter((merchant) =>
    merchant.displayName.toLowerCase().includes(search.toLowerCase()) ||
    merchant.name.toLowerCase().includes(search.toLowerCase())
  );
  const visible = filtered.slice(0, showCount);

  function startEdit(merchant: MerchantItem) {
    setEditingId(merchant.id);
    setEditValue(merchant.displayName);
  }

  function commitEdit(id: string) {
    const trimmed = editValue.trim();
    if (!trimmed) return;
    updateMutation.mutate({ id, displayName: trimmed });
  }

  function handleEditKeyDown(event: KeyboardEvent, id: string) {
    if (event.key === 'Enter') commitEdit(id);
    if (event.key === 'Escape') setEditingId(null);
  }

  return (
    <div>
      <SectionHeader
        title="Merchants"
        description="View and edit how merchants appear throughout Kuber."
      />

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Input
          placeholder="Search merchants..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          style={{ maxWidth: 260 }}
        />
        <div className="flex gap-1.5">
          <button
            onClick={() => setOrder('TRANSACTION_COUNT')}
            className="px-3 py-1.5 rounded-[var(--radius-sm)] text-[0.8125rem] font-semibold border border-[var(--color-border)] cursor-pointer"
            style={{
              backgroundColor: order === 'TRANSACTION_COUNT' ? 'var(--color-accent)' : 'var(--color-surface)',
              color: order === 'TRANSACTION_COUNT' ? '#fff' : 'var(--color-text-secondary)',
            }}
          >
            By transaction count
          </button>
          <button
            onClick={() => setOrder('NAME')}
            className="px-3 py-1.5 rounded-[var(--radius-sm)] text-[0.8125rem] font-semibold border border-[var(--color-border)] cursor-pointer"
            style={{
              backgroundColor: order === 'NAME' ? 'var(--color-accent)' : 'var(--color-surface)',
              color: order === 'NAME' ? '#fff' : 'var(--color-text-secondary)',
            }}
          >
            By name
          </button>
        </div>
      </div>

      <Card padding="none">
        {isLoading ? (
          <div className="p-8 text-center text-[var(--color-text-muted)] text-sm">
            Loading merchants...
          </div>
        ) : visible.length === 0 ? (
          <div className="p-8 text-center text-[var(--color-text-muted)] text-sm">
            {search ? 'No merchants match your search.' : 'No merchants yet.'}
          </div>
        ) : (
          visible.map((merchant, idx) => (
            <div
              key={merchant.id}
              className="flex items-center gap-3 px-4 py-2.5"
              style={{ borderBottom: idx < visible.length - 1 ? '1px solid var(--color-border)' : 'none' }}
            >
              {editingId === merchant.id ? (
                <input
                  autoFocus
                  value={editValue}
                  onChange={(event) => setEditValue(event.target.value)}
                  onKeyDown={(event) => handleEditKeyDown(event, merchant.id)}
                  onBlur={() => commitEdit(merchant.id)}
                  className="flex-1 text-sm font-medium px-2 py-1 border border-[var(--color-accent)] rounded-[var(--radius-sm)] bg-[var(--color-surface)] text-[var(--color-text)] outline-none"
                />
              ) : (
                <span className="flex-1 text-sm text-[var(--color-text)] font-medium">
                  {merchant.displayName}
                  {merchant.displayName !== merchant.name && (
                    <span className="ml-1.5 text-xs text-[var(--color-text-muted)]">
                      ({merchant.name})
                    </span>
                  )}
                </span>
              )}

              <span className="text-xs font-semibold text-[var(--color-text-muted)] bg-[var(--color-surface-hover)] rounded-[var(--radius-full)] px-2 py-0.5 shrink-0">
                {merchant.transactionCount} {merchant.transactionCount === 1 ? 'tx' : 'txs'}
              </span>

              <Button
                variant="ghost"
                size="sm"
                icon={<Pencil size={13} />}
                onClick={() => startEdit(merchant)}
                className="text-[var(--color-text-secondary)] shrink-0"
              >
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon={<Trash2 size={13} />}
                onClick={() => setDeleteTarget(merchant)}
                className="text-[var(--color-danger)] shrink-0"
              >
                Delete
              </Button>
            </div>
          ))
        )}
      </Card>

      {filtered.length > showCount && (
        <div className="mt-3 text-center">
          <Button variant="secondary" size="sm" onClick={() => setShowCount((count) => count + 50)}>
            Show more ({filtered.length - showCount} remaining)
          </Button>
        </div>
      )}

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Remove Merchant"
        size="sm"
      >
        <p className="text-sm text-[var(--color-text)]">
          Remove this merchant? Transactions will become unlinked.{' '}
          Are you sure you want to remove <strong>{deleteTarget?.displayName}</strong>?
        </p>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button
            variant="danger"
            loading={deleteMutation.isPending}
            onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
          >
            Remove
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
