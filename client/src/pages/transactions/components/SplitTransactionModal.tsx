import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { api } from '@/lib/api';
import { Modal, ModalFooter, Button, Select, toast } from '@/components/ui';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Category {
  id: string;
  name: string;
  emoji?: string | null;
  type: string;
  groupId?: string | null;
  groupName?: string | null;
}

interface Transaction {
  id: string;
  merchantName: string;
  amount: number;
  isSplit?: boolean;
  splitDetails?: SplitDetail[] | null;
}

interface SplitDetail {
  categoryId: string;
  amount: number;
  note?: string;
}

interface SplitRow {
  _id: string;
  categoryId: string;
  amount: string;
  note: string;
}

interface Props {
  transaction: Transaction;
  categories: Category[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.abs(n));

let _rowCounter = 0;
function emptyRow(): SplitRow {
  return { _id: String(++_rowCounter), categoryId: '', amount: '', note: '' };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SplitTransactionModal({ transaction, categories, isOpen, onClose, onSuccess }: Props) {
  const originalAmount = Math.abs(transaction.amount);

  // Seed rows from existing split details if already split
  const [rows, setRows] = useState<SplitRow[]>(() => {
    if (transaction.isSplit && transaction.splitDetails && transaction.splitDetails.length >= 2) {
      return transaction.splitDetails.map((d, i) => ({
        _id: String(i + 1),
        categoryId: d.categoryId,
        amount: String(Math.abs(d.amount)),
        note: d.note ?? '',
      }));
    }
    return [emptyRow(), emptyRow()];
  });

  const splitMutation = useMutation({
    mutationFn: (splits: SplitDetail[]) =>
      api.post(`/transactions/${transaction.id}/split`, { splits }),
    onSuccess: () => {
      toast.success('Transaction split successfully');
      onSuccess();
      onClose();
    },
    onError: (err: AxiosError<{ error: string }>) => {
      toast.error(err.response?.data?.error ?? 'Failed to split transaction');
    },
  });

  // ── Row helpers ──

  function updateRow(index: number, field: keyof SplitRow, value: string) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow()]);
  }

  function removeRow(index: number) {
    if (rows.length <= 2) return;
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  // ── Validation ──

  const splitTotal = rows.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
  const splitTotalCents = Math.round(splitTotal * 100);
  const originalCents = Math.round(originalAmount * 100);
  const isBalanced = splitTotalCents === originalCents;
  const allCategoriesSelected = rows.every((r) => r.categoryId !== '');
  const allAmountsPositive = rows.every((r) => (parseFloat(r.amount) || 0) > 0);
  const canSubmit = isBalanced && allCategoriesSelected && allAmountsPositive && !splitMutation.isPending;

  // ── Category options ──

  const categoryOptions = categories.map((c) => ({
    value: c.id,
    label: `${c.emoji ?? ''} ${c.name}`.trim(),
  }));

  // ── Submit ──

  function handleSubmit() {
    if (!canSubmit) return;
    const splits: SplitDetail[] = rows.map((r) => ({
      categoryId: r.categoryId,
      amount: parseFloat(r.amount),
      ...(r.note ? { note: r.note } : {}),
    }));
    splitMutation.mutate(splits);
  }

  const remaining = originalAmount - splitTotal;
  const remainingCents = Math.round(Math.abs(remaining) * 100);

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={`Split Transaction: ${transaction.merchantName}`}
      size="lg"
    >
      {/* Original amount */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '0.75rem 1rem',
        backgroundColor: 'var(--color-bg)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--color-border)',
        marginBottom: '1.25rem',
      }}>
        <span style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
          Original amount
        </span>
        <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-text)', fontVariantNumeric: 'tabular-nums' }}>
          {fmtCurrency(originalAmount)}
        </span>
      </div>

      {/* Split rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
        {rows.map((row, idx) => (
          <div key={row._id} style={{
            display: 'flex', gap: '0.5rem', alignItems: 'flex-end',
            padding: '0.75rem',
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
          }}>
            {/* Category */}
            <div style={{ flex: '1 1 160px', minWidth: 0 }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '0.25rem' }}>
                Category
              </label>
              <Select
                options={categoryOptions}
                placeholder="Select..."
                value={row.categoryId}
                onChange={(e) => updateRow(idx, 'categoryId', e.target.value)}
              />
            </div>

            {/* Amount */}
            <div style={{ flex: '0 0 100px' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '0.25rem' }}>
                Amount ($)
              </label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={row.amount}
                onChange={(e) => updateRow(idx, 'amount', e.target.value)}
                placeholder="0.00"
                style={{
                  width: '100%', padding: '0.4rem 0.625rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-surface)',
                  color: 'var(--color-text)', fontSize: '0.875rem',
                  fontFamily: 'inherit', boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Note */}
            <div style={{ flex: '1 1 120px', minWidth: 0 }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '0.25rem' }}>
                Note (optional)
              </label>
              <input
                type="text"
                value={row.note}
                onChange={(e) => updateRow(idx, 'note', e.target.value)}
                placeholder="Note..."
                style={{
                  width: '100%', padding: '0.4rem 0.625rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-surface)',
                  color: 'var(--color-text)', fontSize: '0.875rem',
                  fontFamily: 'inherit', boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Remove row */}
            <button
              onClick={() => removeRow(idx)}
              disabled={rows.length <= 2}
              title="Remove row"
              style={{
                flexShrink: 0,
                background: 'none', border: 'none', cursor: rows.length <= 2 ? 'not-allowed' : 'pointer',
                color: rows.length <= 2 ? 'var(--color-text-muted)' : 'var(--color-danger)',
                padding: '0.375rem', borderRadius: 'var(--radius-sm)',
                opacity: rows.length <= 2 ? 0.4 : 1,
              }}
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>

      {/* Add row */}
      <button
        onClick={addRow}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.375rem',
          background: 'none', border: '1px dashed var(--color-border)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--color-accent)', fontSize: '0.875rem', fontWeight: 500,
          cursor: 'pointer', padding: '0.5rem 0.75rem', width: '100%',
          justifyContent: 'center', marginBottom: '1.25rem',
        }}
      >
        <Plus size={14} />
        Add split line
      </button>

      {/* Running total */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '0.75rem 1rem',
        backgroundColor: isBalanced ? 'var(--color-success-light, #f0fdf4)' : 'var(--color-warning-light)',
        border: `1px solid ${isBalanced ? 'var(--color-success, #22c55e)' : 'var(--color-warning)'}`,
        borderRadius: 'var(--radius-md)',
      }}>
        <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text)' }}>
          {isBalanced
            ? 'Amounts balance'
            : remainingCents > 0
              ? `$${(remainingCents / 100).toFixed(2)} remaining to allocate`
              : `Over by $${(remainingCents / 100).toFixed(2)}`}
        </span>
        <span style={{
          fontSize: '0.875rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums',
          color: isBalanced ? 'var(--color-success, #16a34a)' : 'var(--color-warning)',
        }}>
          {fmtCurrency(splitTotal)} / {fmtCurrency(originalAmount)}
        </span>
      </div>

      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button
          variant="primary"
          disabled={!canSubmit}
          loading={splitMutation.isPending}
          onClick={handleSubmit}
        >
          Save Split
        </Button>
      </ModalFooter>
    </Modal>
  );
}
