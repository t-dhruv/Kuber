import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { api } from '@/lib/api';
import { Modal, ModalFooter, Button, CategoryCombobox, toast } from '@/components/ui';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Category {
  id: string;
  name: string;
  icon?: string | null;
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
  categoryName?: string | null;
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

function buildRows(transaction: Transaction): SplitRow[] {
  if (transaction.isSplit && transaction.splitDetails && transaction.splitDetails.length >= 2) {
    return transaction.splitDetails.map((detail, index) => ({
      _id: String(index + 1),
      categoryId: detail.categoryId,
      amount: String(Math.abs(detail.amount)),
      note: detail.note ?? '',
    }));
  }

  return [emptyRow(), emptyRow()];
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SplitTransactionModal({ transaction, categories, isOpen, onClose, onSuccess }: Props) {
  const originalAmount = Math.abs(transaction.amount);

  const [rows, setRows] = useState<SplitRow[]>(() => buildRows(transaction));

  useEffect(() => {
    if (!isOpen) return;
    setRows(buildRows(transaction));
  }, [isOpen, transaction]);

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
      <div className="flex justify-between items-center px-4 py-3 bg-[var(--color-bg)] rounded-[var(--radius-md)] border border-[var(--color-border)] mb-5">
        <span className="text-sm text-[var(--color-text-secondary)]">
          Original amount
        </span>
        <span className="text-base font-bold text-[var(--color-text)] [font-variant-numeric:tabular-nums]">
          {fmtCurrency(originalAmount)}
        </span>
      </div>

      {/* Split rows */}
      <div className="flex flex-col gap-3 mb-4">
        {rows.map((row, idx) => (
          <div key={row._id} className="flex gap-2 items-end p-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)]">
            {/* Category */}
            <div className="flex-[1_1_160px] min-w-0">
              <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                Category
              </label>
              <CategoryCombobox
                categories={categories}
                value={row.categoryId}
                onChange={(id) => updateRow(idx, 'categoryId', id)}
              />
            </div>

            {/* Amount */}
            <div className="flex-[0_0_100px]">
              <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                Amount ($)
              </label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={row.amount}
                onChange={(e) => updateRow(idx, 'amount', e.target.value)}
                placeholder="0.00"
                className="w-full py-[0.4rem] px-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] text-sm font-[inherit] box-border"
              />
            </div>

            {/* Note */}
            <div className="flex-[1_1_120px] min-w-0">
              <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                Note (optional)
              </label>
              <input
                type="text"
                value={row.note}
                onChange={(e) => updateRow(idx, 'note', e.target.value)}
                placeholder="Note..."
                className="w-full py-[0.4rem] px-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] text-sm font-[inherit] box-border"
              />
            </div>

            {/* Remove row */}
            <button
              onClick={() => removeRow(idx)}
              disabled={rows.length <= 2}
              title="Remove row"
              className="shrink-0 bg-transparent border-none p-1.5 rounded-[var(--radius-sm)]"
              style={{
                cursor: rows.length <= 2 ? 'not-allowed' : 'pointer',
                color: rows.length <= 2 ? 'var(--color-text-muted)' : 'var(--color-danger)',
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
        className="flex items-center gap-1.5 bg-transparent border border-dashed border-[var(--color-border)] rounded-[var(--radius-md)] text-[var(--color-accent)] text-sm font-medium cursor-pointer py-2 px-3 w-full justify-center mb-5"
      >
        <Plus size={14} />
        Add split line
      </button>

      {/* Running total */}
      <div
        className="flex justify-between items-center px-4 py-3 rounded-[var(--radius-md)]"
        style={{
          backgroundColor: isBalanced ? 'var(--color-success-light, #f0fdf4)' : 'var(--color-warning-light)',
          border: `1px solid ${isBalanced ? 'var(--color-success, #22c55e)' : 'var(--color-warning)'}`,
        }}
      >
        <span className="text-sm font-medium text-[var(--color-text)]">
          {isBalanced
            ? 'Amounts balance'
            : remainingCents > 0
              ? `$${(remainingCents / 100).toFixed(2)} remaining to allocate`
              : `Over by $${(remainingCents / 100).toFixed(2)}`}
        </span>
        <span
          className="text-sm font-bold [font-variant-numeric:tabular-nums]"
          style={{ color: isBalanced ? 'var(--color-success, #16a34a)' : 'var(--color-warning)' }}
        >
          {fmtCurrency(splitTotal)} / {fmtCurrency(originalAmount)}
        </span>
      </div>

      <ModalFooter>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
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
