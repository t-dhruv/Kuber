import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search, SlidersHorizontal, Plus, ChevronRight, RotateCcw, X, Check,
  ChevronRight as ChevronRightIcon, Upload, Scissors, Sparkles, Camera, CheckCheck,
} from 'lucide-react';
import { api } from '@/lib/api';
import { usePrefetchLogos } from '@/hooks/usePrefetchLogos';
import {
  Button, Input, Select, Modal, ModalFooter, Skeleton, Badge, Toggle, Card, notify, ConfirmDialog, CategoryCombobox,
} from '@/components/ui';
import { ImportModal } from './components/ImportModal';
import { SplitTransactionModal } from './components/SplitTransactionModal';
import { DuplicateReviewModal } from './components/DuplicateReviewModal';
import { ReceiptOcrModal } from './components/ReceiptOcrModal';
import { AiSetupNudge } from '@/components/ui/AiSetupNudge';
import { InstitutionLogo } from '@/components/ui';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Account {
  id: string;
  name: string;
  lastFour?: string;
  institutionName?: string;
}

interface Category {
  id: string;
  name: string;
  icon?: string | null;
  type: string;
  groupId?: string | null;
  groupName?: string | null;
}

interface Tag {
  id: string;
  name: string;
}

interface Transaction {
  id: string;
  merchantName: string;
  categoryId: string;
  categoryName: string;
  categoryColor?: string;
  categoryIcon?: string;
  accountId: string;
  accountName: string;
  accountLastFour?: string;
  amount: number;
  currency?: string;
  date: string;
  notes?: string;
  tags: Tag[];
  isRecurring: boolean;
  needsReview: boolean;
  isHidden: boolean;
  isPending: boolean;
  isSplit: boolean;
  splitDetails?: Array<{ categoryId: string; amount: number; note?: string }> | null;
  isTransfer: boolean;
  transferId?: string | null;
  isRefund: boolean;
  refundedTransactionId: string | null;
  refundedTransaction: {
    id: string;
    description: string;
    amount: number;
    currency?: string;
    date: string;
  } | null;
  refunds: Array<{
    id: string;
    description: string;
    amount: number;
    date: string;
  }>;
}

interface TransactionListResponse {
  transactions: Transaction[];
  nextCursor: string | null;
  hasMore: boolean;
  // offset-path fields (present when no cursor used)
  total?: number;
  page?: number;
  totalPages?: number;
}

type TxType = 'expense' | 'income' | 'transfer';

interface TypeToggleProps {
  value: TxType;
  onChange: (type: TxType) => void;
  disabled?: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

const TYPE_OPTIONS: { value: TxType; label: string }[] = [
  { value: 'expense',  label: 'Expense'  },
  { value: 'income',   label: 'Income'   },
  { value: 'transfer', label: 'Transfer' },
];

// ─── Formatters ───────────────────────────────────────────────────────────────

const fmtCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.abs(amount));

function fmtGroupDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function fmtInputDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function merchantInitial(name: string) {
  return (name ?? '?')[0].toUpperCase();
}

// ─── Group transactions by date ───────────────────────────────────────────────

function groupByDate(txns: Transaction[]): { date: string; transactions: Transaction[]; dayTotal: number }[] {
  const map = new Map<string, Transaction[]>();
  for (const txn of txns) {
    const key = txn.date.slice(0, 10);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(txn);
  }
  return Array.from(map.entries()).map(([date, transactions]) => ({
    date,
    transactions,
    dayTotal: transactions.reduce((sum, t) => sum + t.amount, 0),
  }));
}

// ─── Category Picker ──────────────────────────────────────────────────────────

function CategoryPicker({
  categories,
  selectedId,
  onSelect,
}: {
  categories: Category[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [search, setSearch] = useState('');
  const filtered = categories.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );
  const groups = Array.from(new Set(filtered.map((c) => c.groupName ?? 'Other')));

  return (
    <div>
      <div className="mb-2">
        <Input
          placeholder="Search categories..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          leftIcon={<Search size={14} />}
        />
      </div>
      <div className="flex flex-col gap-3 overflow-y-auto max-h-[220px]">
        {groups.map((group) => (
          <div key={group}>
            <div className="text-[0.6875rem] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.06em] px-1 mb-1">
              {group}
            </div>
            {filtered.filter((c) => (c.groupName ?? 'Other') === group).map((cat) => (
              <button
                key={cat.id}
                onClick={() => onSelect(cat.id)}
                className="flex items-center gap-2 w-full px-2 py-1.5 rounded-[var(--radius-sm)] border-none cursor-pointer text-left"
                style={{
                  backgroundColor: selectedId === cat.id ? 'var(--color-accent-light)' : 'transparent',
                }}
                onMouseEnter={(e) => {
                  if (selectedId !== cat.id) e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)';
                }}
                onMouseLeave={(e) => {
                  if (selectedId !== cat.id) e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                {cat.icon ? (
                  <span className="text-base shrink-0 leading-none w-6 text-center">{cat.icon}</span>
                ) : (
                  <span className="w-6 h-6 rounded-[var(--radius-full)] bg-[var(--color-accent)] flex items-center justify-center text-xs shrink-0 text-white">{cat.name[0]}</span>
                )}
                <span className={`text-sm text-[var(--color-text)] ${selectedId === cat.id ? 'font-semibold' : 'font-normal'}`}>
                  {cat.name}
                </span>
                {selectedId === cat.id && <Check size={14} className="ml-auto text-[var(--color-accent)]" />}
              </button>
            ))}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="p-4 text-center text-[var(--color-text-muted)] text-sm">
            No categories found
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Refund Transaction Picker ────────────────────────────────────────────────

function RefundTransactionPicker({
  onSelect,
}: {
  onSelect: (tx: { id: string; description: string; amount: number; date: string }) => void;
}) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const { data } = useQuery({
    queryKey: ['transactions', 'refund-search', search],
    queryFn: () =>
      api
        .get(`/transactions?limit=10&search=${encodeURIComponent(search)}`)
        .then((r) => r.data.transactions as Array<{ id: string; description: string; amount: number; currency?: string; date: string; merchantName: string }>),
    enabled: search.length >= 2,
    staleTime: 30_000,
  });

  return (
    <div ref={ref} className="relative">
      <Input
        placeholder="Search original transaction..."
        value={search}
        onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
      />
      {open && data && data.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-[var(--shadow-md)] max-h-48 overflow-y-auto">
          {data.map((tx) => (
            <button
              key={tx.id}
              type="button"
              onClick={() => {
                onSelect({ id: tx.id, description: tx.merchantName || tx.description, amount: tx.amount, date: tx.date });
                setOpen(false);
                setSearch('');
              }}
              className="flex items-center justify-between w-full px-3 py-2 text-left bg-transparent border-0 cursor-pointer hover:bg-[var(--color-surface-hover)] text-[0.8125rem]"
            >
              <span className="truncate">{tx.merchantName || tx.description}</span>
              <span className="text-[var(--color-text-muted)] ml-2 shrink-0">
                {new Intl.NumberFormat('en-US', { style: 'currency', currency: tx.currency ?? 'USD' }).format(Math.abs(tx.amount))} · {new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Category Pill ────────────────────────────────────────────────────────────

function CategoryPill({ name, color }: { name: string; color?: string }) {
  const c = color ?? 'var(--color-accent)';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 500, padding: '2px 8px', borderRadius: 'var(--radius-full)', background: `${c}18`, color: c }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: c }} />
      {name}
    </span>
  );
}

// ─── Transaction Detail Drawer ────────────────────────────────────────────────

interface DrawerProps {
  transaction: Transaction | null;
  categories: Category[];
  accounts: Account[];
  onClose: () => void;
  onSaved: () => void;
}

function TransactionDrawer({ transaction, categories, accounts, onClose, onSaved }: DrawerProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Partial<Transaction> & { tagInput?: string }>({});
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [txType, setTxType] = useState<TxType>('expense');
  const [transferAccounts, setTransferAccounts] = useState({ fromAccountId: '', toAccountId: '' });

  // Sync form when transaction changes
  useEffect(() => {
    if (transaction) {
      setForm({ ...transaction });
      setShowCategoryPicker(false);
      setTagInput('');
      if (transaction.isTransfer) {
        setTxType('transfer');
      } else if (transaction.amount >= 0) {
        setTxType('income');
      } else {
        setTxType('expense');
      }
      setTransferAccounts({
        fromAccountId: transaction.amount < 0 ? transaction.accountId : '',
        toAccountId: transaction.amount >= 0 ? transaction.accountId : '',
      });
    }
  }, [transaction?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const accountOptions = accounts.map((a) => ({
    value: a.id,
    label: `${a.name}${a.lastFour ? ` ••${a.lastFour}` : ''}`,
  }));

  const saveMutation = useMutation({
    mutationFn: async () => {
      // 1. Save core fields
      const rawAmount = form.amount ?? 0;
      if (txType === 'transfer' && !transaction!.isTransfer) {
        await api.post(`/transactions/${transaction!.id}/convert-transfer`, {
          fromAccountId: transferAccounts.fromAccountId,
          toAccountId: transferAccounts.toAccountId,
          amount: Math.abs(Number(rawAmount)),
          date: form.date,
          notes: form.notes ?? undefined,
        });
      } else {
        await api.put(`/transactions/${transaction!.id}`, {
          merchantName: form.merchantName,
          date: form.date,
          amount: form.isTransfer
            ? form.amount
            : txType === 'expense'
              ? -Math.abs(rawAmount)
              : Math.abs(rawAmount),
          categoryId: form.categoryId,
          notes: form.notes,
          needsReview: form.needsReview,
          isRecurring: form.isRecurring,
          isHidden: form.isHidden,
          isRefund: form.isRefund ?? false,
          refundedTransactionId: form.refundedTransactionId ?? null,
        });
      }

      // 2. Sync tags
      const originalTagIds = new Set((transaction!.tags ?? []).map((t) => t.id));
      const formTags = form.tags ?? [];

      // Resolve new tags (id starts with 'new-') — create them first
      const resolvedTags: Tag[] = [];
      for (const tag of formTags) {
        if (tag.id.startsWith('new-')) {
          const created = await api.post('/settings/tags', { name: tag.name });
          resolvedTags.push({ id: created.data.id, name: created.data.name });
        } else {
          resolvedTags.push(tag);
        }
      }

      const resolvedTagIds = new Set(resolvedTags.map((t) => t.id));

      // Add tags not in original
      const toAdd = resolvedTags.filter((t) => !originalTagIds.has(t.id)).map((t) => t.id);
      if (toAdd.length > 0) {
        await api.post(`/transactions/${transaction!.id}/tags`, { tagIds: toAdd });
      }

      // Remove tags not in new set
      const toRemove = [...originalTagIds].filter((id) => !resolvedTagIds.has(id));
      for (const tagId of toRemove) {
        await api.delete(`/transactions/${transaction!.id}/tags/${tagId}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['budget'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      queryClient.invalidateQueries({ queryKey: ['cashflow'] });
      onSaved();
    },
    onError: (err: any) => notify.error(err?.response?.data?.error ?? 'Failed to save transaction'),
  });

  const [confirmDelete, setConfirmDelete] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/transactions/${transaction!.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['budget'] });
      onClose();
    },
    onError: () => notify.error('Failed to delete transaction'),
  });

  const selectedCategory = categories.find((c) => c.id === form.categoryId);

  function addTag(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (form.tags?.some((t) => t.name.toLowerCase() === trimmed.toLowerCase())) return;
    setForm((f) => ({ ...f, tags: [...(f.tags ?? []), { id: `new-${Date.now()}`, name: trimmed }] }));
    setTagInput('');
  }

  function removeTag(id: string) {
    setForm((f) => ({ ...f, tags: (f.tags ?? []).filter((t) => t.id !== id) }));
  }

  const open = !!transaction;
  const convertingToTransfer = txType === 'transfer' && !transaction?.isTransfer;
  const transferSelectionInvalid =
    convertingToTransfer &&
    (!transferAccounts.fromAccountId ||
      !transferAccounts.toAccountId ||
      transferAccounts.fromAccountId === transferAccounts.toAccountId ||
      Math.abs(Number(form.amount ?? 0)) <= 0);

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/20 z-40"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        className="fixed top-0 right-0 bottom-0 w-full sm:w-[500px] z-50 bg-[var(--color-surface)] border-l border-[var(--color-border)] shadow-[var(--shadow-lg)] flex flex-col overflow-y-auto transition-transform duration-[250ms] ease-[ease]"
        style={{ transform: open ? 'translateX(0)' : 'translateX(100%)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)] shrink-0">
          <h2 className="text-base font-semibold text-[var(--color-text)] m-0">
            Transaction Details
          </h2>
          <button onClick={onClose} aria-label="Close" className="bg-transparent border-none cursor-pointer text-[var(--color-text-muted)] p-1">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        {transaction && (
          <div className="p-5 flex flex-col gap-4 flex-1">
            {/* Merchant */}
            <Input
              label="Merchant"
              value={form.merchantName ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, merchantName: e.target.value }))}
            />

            {/* Date */}
            <Input
              label="Date"
              type="date"
              value={fmtInputDate(form.date ?? '')}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            />

            {/* Type + Amount */}
            <div className="flex flex-col gap-2">
              <TypeToggle
                value={txType}
                onChange={(type) => setTxType(type)}
                disabled={!!form.isTransfer}
              />
              <div>
                <Input
                  label="Amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amount !== undefined ? Math.abs(form.amount as number) : ''}
                  onChange={(e) => {
                    const abs = parseFloat(e.target.value) || 0;
                    setForm((f) => ({
                      ...f,
                      amount: txType === 'expense' ? -Math.abs(abs) : Math.abs(abs),
                    }));
                  }}
                />
                {!form.isTransfer && (
                  <p className="text-xs text-[color:var(--color-text-muted)] mt-1">
                    {txType === 'expense' ? 'Will be recorded as an expense' : 'Will be recorded as income'}
                  </p>
                )}
              </div>
            </div>

            {txType === 'transfer' && !form.isTransfer && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Select
                  label="From Account"
                  options={accountOptions}
                  placeholder="Select account..."
                  value={transferAccounts.fromAccountId}
                  onChange={(e) =>
                    setTransferAccounts((prev) => ({ ...prev, fromAccountId: e.target.value }))
                  }
                />
                <Select
                  label="To Account"
                  options={accountOptions}
                  placeholder="Select account..."
                  value={transferAccounts.toAccountId}
                  onChange={(e) =>
                    setTransferAccounts((prev) => ({ ...prev, toAccountId: e.target.value }))
                  }
                />
              </div>
            )}

            {/* Category */}
            {txType !== 'transfer' && (
              <div>
                <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">
                  Category
                </label>
                <button
                  onClick={() => setShowCategoryPicker((v) => !v)}
                  className="flex items-center gap-2 w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] cursor-pointer text-left"
                >
                  {selectedCategory ? (
                    <>
                      {selectedCategory.icon ? (
                        <span className="text-base shrink-0 leading-none">{selectedCategory.icon}</span>
                      ) : (
                        <span className="w-6 h-6 rounded-[var(--radius-full)] bg-[var(--color-accent)] flex items-center justify-center text-xs shrink-0 text-white">{selectedCategory.name[0]}</span>
                      )}
                      <span className="text-sm text-[var(--color-text)] flex-1">{selectedCategory.name}</span>
                    </>
                  ) : (
                    <span className="text-sm text-[var(--color-text-muted)] flex-1">Select category...</span>
                  )}
                  <ChevronRightIcon
                    size={14}
                    className="text-[var(--color-text-muted)] transition-transform duration-[150ms]"
                    style={{ transform: showCategoryPicker ? 'rotate(90deg)' : 'none' }}
                  />
                </button>
                {showCategoryPicker && (
                  <div className="mt-2 border border-[var(--color-border)] rounded-[var(--radius-md)] p-2">
                    <CategoryPicker
                      categories={categories}
                      selectedId={form.categoryId ?? ''}
                      onSelect={(id) => { setForm((f) => ({ ...f, categoryId: id })); setShowCategoryPicker(false); }}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Account (read-only) */}
            <div>
              <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">
                Account
              </label>
              <div className="px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-sm text-[var(--color-text-secondary)]">
                {transaction.accountName}{transaction.accountLastFour ? ` ••${transaction.accountLastFour}` : ''}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">
                Notes
              </label>
              <textarea
                value={form.notes ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={3}
                className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] text-sm resize-y font-[inherit] box-border"
                placeholder="Add a note..."
              />
            </div>

            {/* Tags */}
            <div>
              <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">
                Tags
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {(form.tags ?? []).map((tag) => (
                  <span key={tag.id} className="inline-flex items-center gap-1 py-0.5 pr-2 pl-2.5 rounded-[var(--radius-full)] bg-[var(--color-accent-light)] text-[var(--color-accent)] text-xs font-medium">
                    {tag.name}
                    <button onClick={() => removeTag(tag.id)} aria-label={`Remove tag ${tag.name}`} className="bg-transparent border-none cursor-pointer p-0 text-[inherit] flex items-center">
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(tagInput); } }}
                  placeholder="Add tag..."
                  className="flex-1 px-2.5 py-1.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] text-[0.8125rem] font-[inherit]"
                />
                <Button variant="secondary" size="sm" onClick={() => addTag(tagInput)}>Add</Button>
              </div>
            </div>

            {/* Toggles */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--color-text)]">Needs Review</span>
                <Toggle
                  id="txn-needs-review"
                  checked={form.needsReview ?? false}
                  onChange={(e) => setForm((f) => ({ ...f, needsReview: e.target.checked }))}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--color-text)]">Is Recurring</span>
                <Toggle
                  id="txn-is-recurring"
                  checked={form.isRecurring ?? false}
                  onChange={(e) => setForm((f) => ({ ...f, isRecurring: e.target.checked }))}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--color-text)]">Hide from reports</span>
                <Toggle
                  id="txn-is-hidden"
                  checked={form.isHidden ?? false}
                  onChange={(e) => setForm((f) => ({ ...f, isHidden: e.target.checked }))}
                />
              </div>
            </div>

            {/* Refund section */}
            <div className="border-t border-[var(--color-border)] pt-4 mt-2">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-[0.8125rem] font-medium text-[var(--color-text)]">Refund</div>
                  <div className="text-[0.75rem] text-[var(--color-text-muted)]">Mark if this is money returned to you</div>
                </div>
                <Toggle
                  id="txn-is-refund"
                  checked={form.isRefund ?? false}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      isRefund: e.target.checked,
                      refundedTransactionId: e.target.checked ? f.refundedTransactionId : null,
                      refundedTransaction: e.target.checked ? f.refundedTransaction : null,
                    }))
                  }
                />
              </div>

              {form.isRefund && (
                <div>
                  <div className="text-[0.75rem] font-medium text-[var(--color-text-secondary)] mb-1.5">
                    Link to original transaction (optional)
                  </div>
                  {form.refundedTransaction ? (
                    <div className="flex items-center justify-between bg-[var(--color-surface-hover)] rounded-[var(--radius-md)] px-3 py-2">
                      <div>
                        <div className="text-[0.8125rem] font-medium">{form.refundedTransaction.description}</div>
                        <div className="text-[0.75rem] text-[var(--color-text-muted)]">
                          {new Intl.NumberFormat('en-US', { style: 'currency', currency: form.refundedTransaction.currency ?? 'USD' }).format(Math.abs(form.refundedTransaction.amount))} · {new Date(form.refundedTransaction.date).toLocaleDateString()}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, refundedTransactionId: null, refundedTransaction: null }))}
                        className="text-[var(--color-text-muted)] hover:text-[var(--color-danger)] bg-transparent border-0 cursor-pointer p-1"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <RefundTransactionPicker
                      onSelect={(tx) =>
                        setForm((f) => ({
                          ...f,
                          refundedTransactionId: tx.id,
                          refundedTransaction: tx,
                        }))
                      }
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        {transaction && (
          <div className="px-5 py-4 border-t border-[var(--color-border)] flex gap-2 shrink-0">
            <Button
              variant="primary"
              loading={saveMutation.isPending}
              disabled={transferSelectionInvalid}
              onClick={() => saveMutation.mutate()}
              className="flex-1"
            >
              Save
            </Button>
            <Button
              variant="danger"
              loading={deleteMutation.isPending}
              onClick={() => setConfirmDelete(true)}
            >
              Delete
            </Button>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => deleteMutation.mutate()}
        title="Delete Transaction"
        message={<>Delete <strong>{transaction?.merchantName}</strong>? This cannot be undone.</>}
        confirmLabel="Delete"
        loading={deleteMutation.isPending}
      />
    </>
  );
}

// ─── Add Transaction Modal ────────────────────────────────────────────────────

interface AddModalProps {
  open: boolean;
  onClose: () => void;
  accounts: Account[];
  categories: Category[];
}

// ─── Type Toggle ──────────────────────────────────────────────────────────────

function TypeToggle({ value, onChange, disabled }: TypeToggleProps) {
  return (
    <div className="flex rounded-[var(--radius-md)] border border-[var(--color-border)] overflow-hidden">
      {TYPE_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(opt.value)}
          className={[
            'flex-1 py-1.5 text-sm font-medium transition-colors',
            value === opt.value
              ? 'bg-[var(--color-accent)] text-white'
              : 'bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-raised)]',
            disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
          ].join(' ')}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function AddTransactionModal({ open, onClose, accounts, categories }: AddModalProps) {
  const queryClient = useQueryClient();
  const [txType, setTxType] = useState<TxType>('expense');
  const [form, setForm] = useState({
    date: fmtInputDate(new Date().toISOString()),
    description: '',
    amount: '',
    accountId: '',
    categoryId: '',
    notes: '',
    fromAccountId: '',
    toAccountId: '',
  });

  const reset = () => {
    setTxType('expense');
    setForm({
      date: fmtInputDate(new Date().toISOString()),
      description: '',
      amount: '',
      accountId: '',
      categoryId: '',
      notes: '',
      fromAccountId: '',
      toAccountId: '',
    });
  };

  useEffect(() => {
    if (open) reset();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const mutation = useMutation({
    mutationFn: () => {
      const amt = parseFloat(form.amount) || 0;
      if (txType === 'transfer') {
        return api.post('/transactions/transfer', {
          fromAccountId: form.fromAccountId,
          toAccountId: form.toAccountId,
          amount: Math.abs(amt),
          date: form.date,
          notes: form.notes || undefined,
        });
      }
      return api.post('/transactions', {
        date: form.date,
        description: form.description,
        amount: txType === 'expense' ? -Math.abs(amt) : Math.abs(amt),
        accountId: form.accountId,
        categoryId: form.categoryId || undefined,
        notes: form.notes || undefined,
      });
    },
    onSuccess: () => {
      notify.success(
        txType === 'transfer' ? 'Transfer recorded' :
        txType === 'expense'  ? 'Expense added' : 'Income added'
      );
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['budget'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      queryClient.invalidateQueries({ queryKey: ['cashflow'] });
      onClose();
      reset();
    },
    onError: (err: any) => notify.error(err?.response?.data?.error ?? 'Failed to add transaction'),
  });

  const accountOptions = accounts.map((a) => ({
    value: a.id,
    label: `${a.name}${a.lastFour ? ` ••${a.lastFour}` : ''}`,
  }));


  const isTransfer = txType === 'transfer';

  const isDisabled =
    !form.amount ||
    parseFloat(form.amount) <= 0 ||
    (isTransfer
      ? !form.fromAccountId || !form.toAccountId || form.fromAccountId === form.toAccountId
      : !form.description || !form.accountId);

  return (
    <Modal open={open} onClose={onClose} title="Add Transaction" size="md">
      <div className="flex flex-col gap-4">
        <TypeToggle value={txType} onChange={setTxType} />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Date"
            type="date"
            value={form.date}
            onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
          />
          <div>
            <Input
              label="Amount"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            />
            {!isTransfer && (
              <p className="text-xs text-[color:var(--color-text-muted)] mt-1">
                {txType === 'expense' ? 'Will be recorded as an expense' : 'Will be recorded as income'}
              </p>
            )}
          </div>
        </div>

        {isTransfer ? (
          <>
            <Select
              label="From Account"
              options={accountOptions}
              placeholder="Select account…"
              value={form.fromAccountId}
              onChange={(e) => setForm((f) => ({ ...f, fromAccountId: e.target.value }))}
            />
            <Select
              label="To Account"
              options={accountOptions}
              placeholder="Select account…"
              value={form.toAccountId}
              onChange={(e) => setForm((f) => ({ ...f, toAccountId: e.target.value }))}
            />
          </>
        ) : (
          <>
            <Input
              label="Merchant / Description"
              placeholder="e.g. Whole Foods Market"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
            <Select
              label="Account"
              options={accountOptions}
              placeholder="Select account..."
              value={form.accountId}
              onChange={(e) => setForm((f) => ({ ...f, accountId: e.target.value }))}
            />
            <CategoryCombobox
              label="Category"
              categories={categories}
              value={form.categoryId ?? ''}
              onChange={(id) => setForm((f) => ({ ...f, categoryId: id }))}
            />
          </>
        )}

        <div>
          <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">
            Notes
          </label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            rows={2}
            placeholder="Optional notes..."
            className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] text-sm resize-y font-[inherit] box-border"
          />
        </div>
      </div>
      <ModalFooter>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button
          variant="primary"
          loading={mutation.isPending}
          onClick={() => mutation.mutate()}
          disabled={isDisabled}
        >
          {isTransfer ? 'Record Transfer' : txType === 'expense' ? 'Add Expense' : 'Add Income'}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

// ─── Filters Panel ────────────────────────────────────────────────────────────

interface FiltersPanelProps {
  open: boolean;
  onClose: () => void;
  accounts: Account[];
  categories: Category[];
  searchParams: URLSearchParams;
  setSearchParams: (params: URLSearchParams) => void;
}

function FiltersPanel({ open, onClose, accounts, categories, searchParams, setSearchParams }: FiltersPanelProps) {
  const [localAccountId, setLocalAccountId] = useState(searchParams.get('accountId') ?? '');
  const [localCategoryIds, setLocalCategoryIds] = useState<string[]>(
    searchParams.getAll('categoryId')
  );
  const [localMinAmount, setLocalMinAmount] = useState(searchParams.get('minAmount') ?? '');
  const [localMaxAmount, setLocalMaxAmount] = useState(searchParams.get('maxAmount') ?? '');
  const [localNeedsReview, setLocalNeedsReview] = useState(searchParams.get('needsReview') === 'true');
  const [localRecurring, setLocalRecurring] = useState(searchParams.get('recurring') === 'true');
  const [localHidden, setLocalHidden] = useState(searchParams.get('hidden') === 'true');
  const [localType, setLocalType] = useState<'all' | 'income' | 'expense'>(
    (searchParams.get('type') as 'income' | 'expense' | null) ?? 'all'
  );
  const [localPending, setLocalPending] = useState(searchParams.get('pending') === 'true');
  const [localFrom, setLocalFrom] = useState(searchParams.get('from') ?? '');
  const [localTo, setLocalTo] = useState(searchParams.get('to') ?? '');

  function applyFilters() {
    const next = new URLSearchParams(searchParams);
    next.delete('accountId');
    next.delete('categoryId');
    next.delete('minAmount');
    next.delete('maxAmount');
    next.delete('needsReview');
    next.delete('recurring');
    next.delete('hidden');
    next.delete('type');
    next.delete('pending');
    next.delete('from');
    next.delete('to');
    next.set('page', '1');

    if (localAccountId) next.set('accountId', localAccountId);
    localCategoryIds.forEach((id) => next.append('categoryId', id));
    if (localMinAmount) next.set('minAmount', localMinAmount);
    if (localMaxAmount) next.set('maxAmount', localMaxAmount);
    if (localNeedsReview) next.set('needsReview', 'true');
    if (localRecurring) next.set('recurring', 'true');
    if (localHidden) next.set('hidden', 'true');
    if (localType !== 'all') next.set('type', localType);
    if (localPending) next.set('pending', 'true');
    if (localFrom) next.set('from', localFrom);
    if (localTo) next.set('to', localTo);

    setSearchParams(next);
    onClose();
  }

  function clearFilters() {
    setLocalAccountId('');
    setLocalCategoryIds([]);
    setLocalMinAmount('');
    setLocalMaxAmount('');
    setLocalNeedsReview(false);
    setLocalRecurring(false);
    setLocalHidden(false);
    setLocalType('all');
    setLocalPending(false);
    setLocalFrom('');
    setLocalTo('');
  }

  function toggleCategory(id: string) {
    setLocalCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  }

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-black/[0.15] z-30"
          onClick={onClose}
        />
      )}
      <div
        className="fixed top-0 right-0 bottom-0 w-full sm:w-[320px] z-[35] bg-[var(--color-surface)] border-l border-[var(--color-border)] shadow-[var(--shadow-lg)] flex flex-col overflow-y-auto transition-transform duration-[250ms] ease-[ease]"
        style={{ transform: open ? 'translateX(0)' : 'translateX(100%)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)] shrink-0">
          <h2 className="text-base font-semibold text-[var(--color-text)] m-0">Filters</h2>
          <button onClick={onClose} aria-label="Close filters" className="bg-transparent border-none cursor-pointer text-[var(--color-text-muted)] p-1">
            <X size={18} />
          </button>
        </div>

        {/* Filter sections */}
        <div className="p-5 flex flex-col gap-6 flex-1">
          {/* Date Range */}
          <div>
            <div className="text-[0.8125rem] font-semibold text-[var(--color-text-secondary)] uppercase tracking-[0.04em] mb-2">
              Date Range
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">From</label>
                <input
                  type="date"
                  value={localFrom}
                  onChange={(e) => setLocalFrom(e.target.value)}
                  className="w-full px-2 py-[0.4rem] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] text-[0.8125rem] font-[inherit] box-border"
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">To</label>
                <input
                  type="date"
                  value={localTo}
                  onChange={(e) => setLocalTo(e.target.value)}
                  className="w-full px-2 py-[0.4rem] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] text-[0.8125rem] font-[inherit] box-border"
                />
              </div>
            </div>
          </div>

          {/* Account */}
          <div>
            <div className="text-[0.8125rem] font-semibold text-[var(--color-text-secondary)] uppercase tracking-[0.04em] mb-2">
              Account
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" checked={localAccountId === ''} onChange={() => setLocalAccountId('')} className="accent-[var(--color-accent)]" />
                <span className="text-sm text-[var(--color-text)]">All accounts</span>
              </label>
              {accounts.map((acc) => (
                <label key={acc.id} className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={localAccountId === acc.id} onChange={() => setLocalAccountId(acc.id)} className="accent-[var(--color-accent)]" />
                  <span className="text-sm text-[var(--color-text)]">
                    {acc.name}{acc.lastFour ? ` ••${acc.lastFour}` : ''}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Categories */}
          <div>
            <div className="text-[0.8125rem] font-semibold text-[var(--color-text-secondary)] uppercase tracking-[0.04em] mb-2">
              Categories
            </div>
            <div className="flex flex-col gap-1.5 max-h-[200px] overflow-y-auto">
              {categories.map((cat) => (
                <label key={cat.id} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={localCategoryIds.includes(cat.id)}
                    onChange={() => toggleCategory(cat.id)}
                    className="accent-[var(--color-accent)]"
                  />
                  <span className="text-xs">{cat.icon ?? ''}</span>
                  <span className="text-sm text-[var(--color-text)]">{cat.name}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Amount range */}
          <div>
            <div className="text-[0.8125rem] font-semibold text-[var(--color-text-secondary)] uppercase tracking-[0.04em] mb-2">
              Amount Range
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input
                placeholder="Min"
                type="number"
                value={localMinAmount}
                onChange={(e) => setLocalMinAmount(e.target.value)}
              />
              <Input
                placeholder="Max"
                type="number"
                value={localMaxAmount}
                onChange={(e) => setLocalMaxAmount(e.target.value)}
              />
            </div>
          </div>

          {/* Type filter pills */}
          <div>
            <div className="text-[0.8125rem] font-semibold text-[var(--color-text-secondary)] uppercase tracking-[0.04em] mb-2">
              Type
            </div>
            <div className="flex gap-1.5">
              {(['all', 'income', 'expense'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setLocalType(t)}
                  className="flex-1 py-1.5 rounded-[var(--radius-full)] border border-[var(--color-border)] cursor-pointer text-[0.8125rem] font-medium transition-[background-color,color] duration-[150ms]"
                  style={{
                    backgroundColor: localType === t ? 'var(--color-accent)' : 'var(--color-surface)',
                    color: localType === t ? '#fff' : 'var(--color-text-secondary)',
                  }}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Toggles */}
          <div>
            <div className="text-[0.8125rem] font-semibold text-[var(--color-text-secondary)] uppercase tracking-[0.04em] mb-2.5">
              Other
            </div>
            <div className="flex flex-col gap-3">
              {[
                { label: 'Needs Review only', value: localNeedsReview, onChange: setLocalNeedsReview },
                { label: 'Recurring only', value: localRecurring, onChange: setLocalRecurring },
                { label: 'Show Hidden', value: localHidden, onChange: setLocalHidden },
                { label: 'Include Pending', value: localPending, onChange: setLocalPending },
              ].map(({ label, value, onChange }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-sm text-[var(--color-text)]">{label}</span>
                  <Toggle checked={value} onChange={(e) => onChange(e.target.checked)} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[var(--color-border)] flex gap-2 shrink-0">
          <Button variant="secondary" onClick={clearFilters} className="flex-1">Clear</Button>
          <Button variant="primary" onClick={applyFilters} className="flex-1">Apply</Button>
        </div>
      </div>
    </>
  );
}

// ─── Bulk Actions Bar ─────────────────────────────────────────────────────────

interface BulkActionsBarProps {
  count: number;
  categories: Category[];
  onRecategorize: (categoryId: string) => void;
  onMarkReviewed: () => void;
  onHide: () => void;
  onDelete: () => void;
  onClear: () => void;
}

function BulkActionsBar({ count, categories, onRecategorize, onMarkReviewed, onHide, onDelete, onClear }: BulkActionsBarProps) {
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  return (
    <div className="sticky top-0 z-20 bg-[var(--color-accent)] px-4 py-2.5 flex items-center gap-2 rounded-[var(--radius-md)] mb-2 flex-wrap">
      <span className="text-sm font-semibold text-white mr-auto">
        {count} selected
      </span>

      <div className="relative" ref={pickerRef}>
        <button
          onClick={() => setShowCategoryPicker((v) => !v)}
          className="bg-white/20 border-none cursor-pointer text-white px-3 py-1.5 rounded-[var(--radius-sm)] text-[0.8125rem] font-medium"
        >
          Recategorize
        </button>
        {showCategoryPicker && (
          <div className="absolute top-full left-0 mt-1.5 w-[260px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-[var(--shadow-md)] p-2 z-10">
            <CategoryPicker
              categories={categories}
              selectedId=""
              onSelect={(id) => { onRecategorize(id); setShowCategoryPicker(false); }}
            />
          </div>
        )}
      </div>

      {[
        { label: 'Mark Reviewed', action: onMarkReviewed },
        { label: 'Hide', action: onHide },
        { label: 'Delete', action: onDelete },
      ].map(({ label, action }) => (
        <button
          key={label}
          onClick={action}
          className="bg-white/20 border-none cursor-pointer text-white px-3 py-1.5 rounded-[var(--radius-sm)] text-[0.8125rem] font-medium"
        >
          {label}
        </button>
      ))}

      <button onClick={onClear} aria-label="Clear filters" className="bg-transparent border-none cursor-pointer text-white/80 p-1">
        <X size={16} />
      </button>
    </div>
  );
}

// ─── Transaction Row ──────────────────────────────────────────────────────────

interface TransactionRowProps {
  txn: Transaction;
  selected: boolean;
  onSelect: (id: string, checked: boolean) => void;
  onOpen: (txn: Transaction) => void;
  onMerchantEdit: (id: string, merchant: string) => void;
  onSplit: (txn: Transaction) => void;
}

function TransactionRow({ txn, selected, onSelect, onOpen, onMerchantEdit, onSplit }: TransactionRowProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(txn.merchantName);
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    setEditing(true);
    setEditValue(txn.merchantName);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function commitEdit() {
    setEditing(false);
    if (editValue.trim() && editValue !== txn.merchantName) {
      onMerchantEdit(txn.id, editValue.trim());
    }
  }

  return (
    <div
      className="flex items-center h-[52px] px-3 gap-3 cursor-default"
      style={{ backgroundColor: selected ? 'var(--color-accent-light)' : 'transparent' }}
      onMouseEnter={(e) => { if (!selected) e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)'; }}
      onMouseLeave={(e) => { if (!selected) e.currentTarget.style.backgroundColor = selected ? 'var(--color-accent-light)' : 'transparent'; }}
    >
      {/* Checkbox */}
      <input
        type="checkbox"
        checked={selected}
        onChange={(e) => onSelect(txn.id, e.target.checked)}
        className="accent-[var(--color-accent)] shrink-0 cursor-pointer"
      />

      {/* Merchant logo — falls back to category icon */}
      <InstitutionLogo
        name={txn.merchantName}
        type="merchant"
        size={38}
        fallback={txn.categoryIcon ?? undefined}
        style={{ borderRadius: '50%' }}
      />

      {/* Merchant name */}
      <div className="flex-[1_1_180px] min-w-0" onDoubleClick={startEdit}>
        {editing ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(false); }}
            className="text-sm font-medium text-[var(--color-text)] border border-[var(--color-accent)] rounded-[var(--radius-sm)] py-0.5 px-1.5 bg-[var(--color-surface)] font-[inherit] w-full"
          />
        ) : (
          <div className="text-sm font-medium text-[var(--color-text)] whitespace-nowrap overflow-hidden text-ellipsis">
            {txn.merchantName}
          </div>
        )}
      </div>

      {/* Category name — hidden on mobile */}
      <div className="hidden sm:block flex-[0_0_130px] overflow-hidden">
        <CategoryPill name={txn.categoryName} color={txn.categoryColor ?? undefined} />
      </div>

      {/* Account — hidden on mobile and tablet */}
      <div className="hidden md:block flex-[0_0_150px] text-[0.8125rem] text-[var(--color-text-muted)] whitespace-nowrap overflow-hidden text-ellipsis">
        {txn.accountName}{txn.accountLastFour ? ` ••${txn.accountLastFour}` : ''}
      </div>

      {/* Badges — hidden on mobile */}
      <div className="hidden sm:flex gap-1 flex-[0_0_auto]">
        {txn.isRecurring && (
          <span title="Recurring" className="text-[var(--color-info)] text-sm">
            <RotateCcw size={13} />
          </span>
        )}
        {txn.needsReview && (
          <span className="text-[0.6875rem] font-semibold py-0.5 px-1.5 rounded-[var(--radius-full)] bg-[var(--color-warning-light)] text-[var(--color-warning)]">
            Review
          </span>
        )}
        {txn.isPending && (
          <span className="text-[0.6875rem] font-semibold py-0.5 px-1.5 rounded-[var(--radius-full)] bg-[var(--color-surface-hover)] text-[var(--color-text-muted)] border border-[var(--color-border)]">
            Pending
          </span>
        )}
        {txn.isSplit && (
          <span className="text-[0.6875rem] font-semibold py-0.5 px-1.5 rounded-[var(--radius-full)] bg-[var(--color-accent-light)] text-[var(--color-accent)]">
            Split
          </span>
        )}
        {txn.isTransfer && (
          <span className="text-[0.6875rem] font-semibold py-0.5 px-1.5 rounded-[var(--radius-full)] bg-[var(--color-surface-hover)] text-[var(--color-text-muted)] border border-[var(--color-border)]">
            Transfer
          </span>
        )}
      </div>

      {/* Split button — hidden on mobile */}
      <button
        className="hidden sm:flex items-center gap-1 bg-transparent border-none cursor-pointer p-1 shrink-0"
        onClick={(e) => { e.stopPropagation(); onSplit(txn); }}
        title={txn.isSplit ? 'Edit split' : 'Split transaction'}
        style={{ color: txn.isSplit ? 'var(--color-accent)' : 'var(--color-text-muted)' }}
      >
        <Scissors size={14} />
      </button>

      {/* Amount */}
      <div
        className="flex-[0_0_90px] text-right text-sm font-semibold"
        style={{ color: txn.amount < 0 ? 'var(--color-danger)' : 'var(--color-success)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}
      >
        {txn.amount < 0 ? '-' : '+'}{fmtCurrency(txn.amount)}
      </div>

      {txn.refunds && txn.refunds.length > 0 && (
        <span
          className="text-[0.625rem] font-semibold px-1.5 py-0.5 rounded-full shrink-0"
          style={{ backgroundColor: 'rgba(59,130,246,0.12)', color: '#3b82f6' }}
        >
          REFUNDED
        </span>
      )}

      {/* Arrow */}
      <button
        onClick={() => onOpen(txn)}
        className="bg-transparent border-none cursor-pointer text-[var(--color-text-muted)] p-1 shrink-0"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TransactionsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [drawerTxn, setDrawerTxn] = useState<Transaction | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [showAutoCatPanel, setShowAutoCatPanel] = useState(false);
  const autoCatPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [splitTxn, setSplitTxn] = useState<Transaction | null>(null);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);

  const search = searchParams.get('search') ?? '';

  // ── Data queries ──

  // Build filter params (strip page — cursor handles pagination now)
  const filterParams = new URLSearchParams(searchParams);
  filterParams.delete('page');

  const {
    data: txnPages,
    isLoading: txnsLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<TransactionListResponse>({
    queryKey: ['transactions', Object.fromEntries(filterParams)],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams(filterParams);
      if (pageParam) params.set('cursor', pageParam as string);
      params.set('limit', String(PAGE_SIZE));
      return api.get('/transactions?' + params.toString()).then((r) => r.data);
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const { data: accountsData } = useQuery<{ groups: { type: string; totalBalance: number; accounts: Account[] }[] }>({
    queryKey: ['accounts'],
    queryFn: () => api.get('/accounts').then((r) => r.data),
  });

  const { data: categoriesData } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: () => api.get('/categories').then((r) => r.data),
  });

  const { data: duplicatesData } = useQuery<{ count: number }>({
    queryKey: ['transactions', 'duplicates', 'count'],
    queryFn: () =>
      api.get('/transactions/duplicates').then((r) => ({ count: r.data.count as number })),
    staleTime: 5 * 60 * 1000,
  });

  const duplicateCount = duplicatesData?.count ?? 0;

  const allTxns = txnPages?.pages.flatMap(p => p.transactions) ?? [];
  usePrefetchLogos([
    ...allTxns.map(t => ({ name: t.merchantName, type: 'merchant' as const })),
    ...(accountsData?.groups ?? []).flatMap(g => g.accounts).map(a => ({ name: a.institutionName, type: 'bank' as const })),
  ]);

  // ── Auto-categorize ──

  const navigate = useNavigate();

  const { data: autoCatStatus, refetch: refetchAutoCatStatus, isFetching: autoCatStatusFetching } = useQuery<{
    configured: boolean;
    notConfigured?: boolean;
    uncategorizedCount: number;
    reviewCount: number;
  }>({
    queryKey: ['auto-categorize-status'],
    queryFn: () => api.get('/auto-categorize/status').then((r) => r.data),
    staleTime: 60_000,
    retry: false,
  });

  const [autoCatProgress, setAutoCatProgress] = useState<{
    processed: number; total: number; queued: number; done: boolean;
  } | null>(null);

  function stopAutoCatPolling() {
    if (autoCatPollRef.current) {
      clearInterval(autoCatPollRef.current);
      autoCatPollRef.current = null;
    }
  }

  const autoCatMutation = useMutation({
    mutationFn: () =>
      api
        .post('/auto-categorize/batch')
        .then((r) => r.data as { jobId: string | null; total: number; notConfigured?: boolean; setupMessage?: string }),
    onSuccess: (data) => {
      if (data.notConfigured) {
        notify.error(data.setupMessage ?? 'AI not configured');
        return;
      }
      if (data.total === 0) {
        notify.info('No new transactions to categorize');
        setShowAutoCatPanel(false);
        return;
      }
      setAutoCatProgress({ processed: 0, total: data.total, queued: 0, done: false });

      // Poll for progress
      autoCatPollRef.current = setInterval(async () => {
        try {
          const res = await api.get(`/auto-categorize/batch/progress/${data.jobId}`);
          const state = res.data as { processed: number; total: number; queued: number; done: boolean };
          setAutoCatProgress(state);
          if (state.done) {
            stopAutoCatPolling();
            queryClient.invalidateQueries({ queryKey: ['transactions'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            queryClient.invalidateQueries({ queryKey: ['budget'] });
            queryClient.invalidateQueries({ queryKey: ['auto-categorize-status'] });
            if (state.queued > 0) {
              notify.success(`${state.queued} transaction${state.queued !== 1 ? 's' : ''} queued for review`);
            } else {
              notify.info('No confident matches found');
            }
          }
        } catch {
          stopAutoCatPolling();
        }
      }, 1500);
    },
    onError: () => notify.error('Auto-categorize failed. Please try again.'),
  });

  const accounts = accountsData?.groups?.flatMap((g) => g.accounts) ?? [];
  const categories = categoriesData ?? [];
  const transactions: Transaction[] = txnPages?.pages.flatMap((p) => p.transactions) ?? [];

  // Cleanup polling interval on unmount
  useEffect(() => () => stopAutoCatPolling(), []);

  // ── URL param helpers ──

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    next.delete('page'); // cursor pagination resets automatically on filter change
    setSearchParams(next);
  }

  // ── Selection ──

  function toggleSelect(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === transactions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(transactions.map((t) => t.id)));
    }
  }

  // ── Bulk mutations ──

  const bulkRecategorizeMutation = useMutation({
    mutationFn: (categoryId: string) =>
      api.post('/transactions/bulk', { action: 'recategorize', ids: Array.from(selectedIds), categoryId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['budget'] });
      setSelectedIds(new Set());
    },
    onError: (err: any) => notify.error(err?.response?.data?.error ?? 'Bulk operation failed. Please try again.'),
  });

  const bulkMarkReviewedMutation = useMutation({
    mutationFn: () =>
      api.post('/transactions/bulk', { action: 'mark-reviewed', ids: Array.from(selectedIds) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['budget'] });
      setSelectedIds(new Set());
    },
    onError: (err: any) => notify.error(err?.response?.data?.error ?? 'Bulk operation failed. Please try again.'),
  });

  const bulkHideMutation = useMutation({
    mutationFn: () =>
      api.post('/transactions/bulk', { action: 'hide', ids: Array.from(selectedIds) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['budget'] });
      setSelectedIds(new Set());
    },
    onError: (err: any) => notify.error(err?.response?.data?.error ?? 'Bulk operation failed. Please try again.'),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: () =>
      api.post('/transactions/bulk', { action: 'delete', ids: Array.from(selectedIds) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['budget'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['networth'] });
      setSelectedIds(new Set());
      setConfirmBulkDelete(false);
    },
    onError: (err: any) => notify.error(err?.response?.data?.error ?? 'Bulk operation failed. Please try again.'),
  });

  // ── Inline merchant edit ──

  const merchantEditMutation = useMutation({
    mutationFn: ({ id, merchantName }: { id: string; merchantName: string }) =>
      api.put(`/transactions/${id}`, { description: merchantName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err: any) => notify.error(err?.response?.data?.error ?? 'Failed to update merchant. Please try again.'),
  });

  const handleMerchantEdit = useCallback((id: string, merchantName: string) => {
    merchantEditMutation.mutate({ id, merchantName });
  }, [merchantEditMutation]);

  // ── Active filter count ──

  const activeFilterCount = [
    searchParams.get('accountId'),
    ...searchParams.getAll('categoryId'),
    searchParams.get('minAmount'),
    searchParams.get('maxAmount'),
    searchParams.get('needsReview'),
    searchParams.get('recurring'),
    searchParams.get('hidden'),
    searchParams.get('type'),
    searchParams.get('pending'),
    searchParams.get('from'),
    searchParams.get('to'),
  ].filter(Boolean).length;

  const groups = groupByDate(transactions);
  const allSelected = transactions.length > 0 && selectedIds.size === transactions.length;
  const someSelected = selectedIds.size > 0;

  return (
    <div className="py-4 flex flex-col gap-3">
      {/* Page header */}
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-[1.375rem] font-bold text-[var(--color-text)] m-0 mr-auto">
          Transactions
        </h1>

        {/* Search — full width on mobile */}
        <div className="w-full sm:w-60">
          <Input
            placeholder="Search..."
            value={search}
            onChange={(e) => setParam('search', e.target.value)}
            className="px-2.5 py-[0.4rem] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] text-[0.8125rem] font-[inherit]"
            leftIcon={<Search size={14} />}
          />
        </div>

        {/* Date range — hidden on mobile, shown on sm+ */}
        <div className="hidden sm:flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
            From
            <input
              type="date"
              value={searchParams.get('startDate') ?? ''}
              onChange={(e) => setParam('startDate', e.target.value)}
              className="px-2.5 py-[0.4rem] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] text-[0.8125rem] font-[inherit]"
            />
          </label>
          
          <label className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
            To
            <input
              type="date"
              value={searchParams.get('endDate') ?? ''}
              onChange={(e) => setParam('endDate', e.target.value)}
              className="px-2.5 py-[0.4rem] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] text-[0.8125rem] font-[inherit]"
            />
          </label>
        </div>

        {/* Filters button */}
        <button
          onClick={() => setShowFilters(true)}
          className="flex items-center gap-1.5 py-[0.4rem] px-[0.875rem] rounded-[var(--radius-md)] border border-[var(--color-border)] cursor-pointer text-sm font-medium"
          style={{
            backgroundColor: activeFilterCount > 0 ? 'var(--color-accent-light)' : 'var(--color-surface)',
            color: activeFilterCount > 0 ? 'var(--color-accent)' : 'var(--color-text-secondary)',
          }}
        >
          <SlidersHorizontal size={14} />
          Filters
          {activeFilterCount > 0 && (
            <span className="bg-[var(--color-accent)] text-white rounded-[var(--radius-full)] px-1.5 text-[0.6875rem] font-bold">
              {activeFilterCount}
            </span>
          )}
        </button>

        {/* Auto-categorize button */}
        <Button
          variant="secondary"
          icon={<Sparkles size={14} />}
          className="flex items-center gap-1.5 py-[0.4rem] px-[0.875rem] rounded-[var(--radius-md)] border border-[var(--color-border)] cursor-pointer text-sm font-medium"
          onClick={async () => {
            setShowAutoCatPanel(true);
            await refetchAutoCatStatus();
          }}
        >
          Auto-categorize
        </Button>

        {/* Scan Receipt button */}
        <Button
          variant="secondary"
          icon={<Camera size={14} />}
          className="flex items-center gap-1.5 py-[0.4rem] px-[0.875rem] rounded-[var(--radius-md)] border border-[var(--color-border)] cursor-pointer text-sm font-medium"
          onClick={() => setShowReceiptModal(true)}
        >
          Scan Receipt
        </Button>

        {/* Import CSV button */}
        <Button
          variant="secondary"
          icon={<Upload size={14} />}
          className="flex items-center gap-1.5 py-[0.4rem] px-[0.875rem] rounded-[var(--radius-md)] border border-[var(--color-border)] cursor-pointer text-sm font-medium"
          onClick={() => setShowImportModal(true)}
        >
          Import CSV
        </Button>

        {/* Add button */}
        <Button
          variant="primary"
          className="flex items-center gap-1.5 py-[0.4rem] px-[0.875rem] rounded-[var(--radius-md)] border border-[var(--color-border)] cursor-pointer text-sm font-medium"
          icon={<Plus size={14} />}
          onClick={() => setShowAddModal(true)}
        >
          Add
        </Button>
      </div>

      {/* KPI Summary Strip */}
      {(() => {
        const income = transactions.reduce((sum, t) => t.amount > 0 ? sum + t.amount : sum, 0);
        const spending = transactions.reduce((sum, t) => t.amount < 0 ? sum + Math.abs(t.amount) : sum, 0);
        const count = txnPages?.pages[0]?.total ?? transactions.length;
        const tiles = [
          { label: 'Transactions', value: String(count), color: 'var(--color-text)' },
          { label: 'Income', value: fmtCurrency(income), color: 'var(--color-success)' },
          { label: 'Spending', value: fmtCurrency(spending), color: 'var(--color-text)' },
        ];
        return (
          <div className="flex gap-3 flex-wrap">
            {tiles.map(({ label, value, color }) => (
              <div
                key={label}
                style={{
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '14px 16px',
                  minWidth: 120,
                  flex: '1 1 120px',
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-muted)', marginBottom: 4 }}>
                  {label}
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>
                  {value}
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Auto-categorize panel */}
      {showAutoCatPanel && (
        <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4 flex flex-col gap-3">
          {autoCatStatusFetching && (
            <p className="text-sm text-[color:var(--color-text-secondary)]">Checking AI status…</p>
          )}
          {!autoCatStatusFetching && autoCatStatus && !autoCatStatus.configured && (
            <>
              <AiSetupNudge message="Auto-categorize requires an AI provider. Set one up to automatically categorize your uncategorized transactions." />
              <div className="flex justify-end">
                <button onClick={() => setShowAutoCatPanel(false)} className="text-sm text-[color:var(--color-text-secondary)] hover:underline">Dismiss</button>
              </div>
            </>
          )}
          {!autoCatStatusFetching && autoCatStatus && autoCatStatus.configured && (
            <div className="flex flex-col gap-3">
              {/* Progress state */}
              {autoCatMutation.isPending || (autoCatProgress && !autoCatProgress.done) ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[color:var(--color-text-secondary)]">
                      Analyzing transactions… {autoCatProgress ? `${autoCatProgress.processed} / ${autoCatProgress.total}` : ''}
                    </span>
                    {autoCatProgress && (
                      <span className="text-[color:var(--color-text-secondary)] text-xs">
                        {autoCatProgress.queued} matched
                      </span>
                    )}
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-[color:var(--color-border)] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[color:var(--color-accent)] transition-all duration-300"
                      style={{
                        width: autoCatProgress && autoCatProgress.total > 0
                          ? `${Math.round((autoCatProgress.processed / autoCatProgress.total) * 100)}%`
                          : '5%',
                      }}
                    />
                  </div>
                </div>
              ) : autoCatProgress?.done ? (
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm text-[color:var(--color-text-secondary)]">
                    Done — {autoCatProgress.queued} queued for review, {autoCatProgress.total - autoCatProgress.queued} skipped.
                  </p>
                  <button
                    onClick={() => { setShowAutoCatPanel(false); setAutoCatProgress(null); }}
                    className="text-sm text-[color:var(--color-text-secondary)] hover:underline"
                  >
                    Dismiss
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm text-[color:var(--color-text-secondary)]">
                    {autoCatStatus.uncategorizedCount > 0
                      ? `Auto-categorize ${autoCatStatus.uncategorizedCount} uncategorized transaction${autoCatStatus.uncategorizedCount !== 1 ? 's' : ''}?`
                      : autoCatStatus.reviewCount > 0
                        ? `${autoCatStatus.reviewCount} transaction${autoCatStatus.reviewCount !== 1 ? 's' : ''} awaiting review — no new ones to process.`
                        : 'All transactions are already categorized.'}
                  </p>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setShowAutoCatPanel(false)} className="text-sm text-[color:var(--color-text-secondary)] hover:underline">Cancel</button>
                    {autoCatStatus.uncategorizedCount > 0 && (
                      <Button
                        variant="primary"
                        disabled={autoCatMutation.isPending}
                        onClick={() => autoCatMutation.mutate()}
                      >
                        Confirm
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Bulk actions */}
      {someSelected && (
        <BulkActionsBar
          count={selectedIds.size}
          categories={categories}
          onRecategorize={(id) => bulkRecategorizeMutation.mutate(id)}
          onMarkReviewed={() => bulkMarkReviewedMutation.mutate()}
          onHide={() => bulkHideMutation.mutate()}
          onDelete={() => setConfirmBulkDelete(true)}
          onClear={() => setSelectedIds(new Set())}
        />
      )}

      <ConfirmDialog
        open={confirmBulkDelete}
        onClose={() => setConfirmBulkDelete(false)}
        onConfirm={() => bulkDeleteMutation.mutate()}
        title="Delete Selected Transactions"
        message={`Delete ${selectedIds.size} selected transaction${selectedIds.size !== 1 ? 's' : ''}? This cannot be undone.`}
        confirmLabel="Delete selected"
        loading={bulkDeleteMutation.isPending}
      />

      {/* Duplicate transactions warning banner */}
      {duplicateCount > 0 && (
        <button
          onClick={() => setShowDuplicateModal(true)}
          className="flex items-center gap-2 w-full py-2.5 px-4 rounded-[var(--radius-md)] border border-[#f59e0b] bg-[#fffbeb] text-[#92400e] cursor-pointer text-sm font-medium text-left"
        >
          <span className="text-base">⚠</span>
          <span>
            <strong>{duplicateCount}</strong> potential duplicate transaction
            {duplicateCount !== 1 ? 's' : ''} found —{' '}
            <span className="underline">Review</span>
          </span>
        </button>
      )}

      {/* AI review queue banner */}
      {(autoCatStatus?.reviewCount ?? 0) > 0 && (
        <button
          onClick={() => navigate('/transactions/review')}
          className="flex items-center gap-2 w-full py-2.5 px-4 rounded-[var(--radius-md)] border border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent)] cursor-pointer text-sm font-medium text-left"
        >
          <CheckCheck size={16} className="flex-shrink-0" />
          <span>
            <strong>{autoCatStatus!.reviewCount}</strong> transaction{autoCatStatus!.reviewCount !== 1 ? 's' : ''} need AI category review —{' '}
            <span className="underline">Review now</span>
          </span>
        </button>
      )}

      {/* Transaction list */}
      <Card padding="none">
        {/* Column header */}
        <div className="flex items-center h-10 px-3 gap-3 border-b border-[var(--color-border)] bg-[var(--color-bg)]">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleSelectAll}
            className="accent-[var(--color-accent)] shrink-0 cursor-pointer"
          />
          <div className="w-8 shrink-0" />
          <div className="flex-[1_1_180px] text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-[0.04em]">Merchant</div>
          <div className="hidden sm:block flex-[0_0_130px] text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-[0.04em]">Category</div>
          <div className="hidden md:block flex-[0_0_150px] text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-[0.04em]">Account</div>
          <div className="hidden sm:block flex-[0_0_auto] min-w-[60px]" />
          <div className="flex-[0_0_90px] text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-[0.04em] text-right">Amount</div>
          <div className="w-6 shrink-0" />
        </div>

        {txnsLoading ? (
          <div className="p-4 flex flex-col gap-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 h-[52px]">
                <Skeleton width={16} height={16} />
                <Skeleton width={32} height={32} rounded />
                <Skeleton height={14} style={{ flex: '1 1 180px' }} />
                <Skeleton height={14} style={{ flex: '0 0 130px' }} />
                <Skeleton height={14} style={{ flex: '0 0 150px' }} />
                <Skeleton height={14} width={80} />
              </div>
            ))}
          </div>
        ) : groups.length === 0 ? (
          <div className="p-12 text-center text-[var(--color-text-muted)] text-sm">
            <p className="m-0 font-medium">No transactions found.</p>
            <p className="m-0 mt-1 text-xs">Transactions will appear here once you add accounts and transactions.</p>
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.date}>
              {/* Date group header */}
              <div className="flex items-center justify-between py-1.5 px-3 bg-[var(--color-bg)] border-b border-[var(--color-border)] border-t border-t-[var(--color-border)]">
                <span className="text-xs font-bold text-[var(--color-text-secondary)] uppercase tracking-[0.04em]">
                  {fmtGroupDate(group.date)}
                </span>
                <span
                  className="text-[0.8125rem] font-semibold [font-variant-numeric:tabular-nums]"
                  style={{ color: group.dayTotal < 0 ? 'var(--color-danger)' : 'var(--color-success)' }}
                >
                  {group.dayTotal < 0 ? '-' : '+'}{fmtCurrency(group.dayTotal)}
                </span>
              </div>

              {/* Rows */}
              {group.transactions.map((txn, idx) => (
                <div key={txn.id}>
                  <TransactionRow
                    txn={txn}
                    selected={selectedIds.has(txn.id)}
                    onSelect={toggleSelect}
                    onOpen={setDrawerTxn}
                    onMerchantEdit={handleMerchantEdit}
                    onSplit={setSplitTxn}
                  />
                  {idx < group.transactions.length - 1 && (
                    <div className="h-px bg-[var(--color-border)] ml-3" />
                  )}
                </div>
              ))}
            </div>
          ))
        )}

        {/* Load more */}
        {hasNextPage && (
          <div className="px-3 py-3 border-t border-[var(--color-border)] flex justify-center">
            <Button
              variant="secondary"
              size="sm"
              loading={isFetchingNextPage}
              onClick={() => fetchNextPage()}
            >
              Load more
            </Button>
          </div>
        )}
      </Card>

      {/* Summary Stats Panel */}
      {!txnsLoading && transactions.length > 0 && (() => {
        const expenses = transactions.filter((t) => t.amount < 0);
        const totalSpending = expenses.reduce((sum, t) => sum + Math.abs(t.amount), 0);
        const largestExpense = expenses.length > 0 ? Math.max(...expenses.map((t) => Math.abs(t.amount))) : 0;
        const avgAmount = transactions.length > 0 ? transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0) / transactions.length : 0;
        const dates = transactions.map((t) => t.date).sort();
        const firstDate = dates[0] ? new Date(dates[0]).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
        const lastDate = dates[dates.length - 1] ? new Date(dates[dates.length - 1]).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

        return (
          <Card padding="lg">
            <div className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-[0.06em] mb-3">
              Summary
            </div>
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
              {[
                { label: 'Total transactions', value: String(transactions.length) },
                { label: 'Total spending', value: fmtCurrency(totalSpending) },
                { label: 'Largest expense', value: largestExpense > 0 ? fmtCurrency(largestExpense) : '—' },
                { label: 'Average transaction', value: fmtCurrency(avgAmount) },
                { label: 'First transaction', value: firstDate },
                { label: 'Last transaction', value: lastDate },
              ].map(({ label, value }) => (
                <div key={label}>
                  <div className="text-xs text-[var(--color-text-muted)] mb-0.5">{label}</div>
                  <div className="text-[0.9375rem] font-semibold text-[var(--color-text)] [font-variant-numeric:tabular-nums]">{value}</div>
                </div>
              ))}
            </div>
          </Card>
        );
      })()}

      {/* Filters panel */}
      <FiltersPanel
        open={showFilters}
        onClose={() => setShowFilters(false)}
        accounts={accounts}
        categories={categories}
        searchParams={searchParams}
        setSearchParams={setSearchParams}
      />

      {/* Transaction detail drawer */}
      <TransactionDrawer
        transaction={drawerTxn}
        categories={categories}
        accounts={accounts}
        onClose={() => setDrawerTxn(null)}
        onSaved={() => setDrawerTxn(null)}
      />

      {/* Add transaction modal */}
      <AddTransactionModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        accounts={accounts}
        categories={categories}
      />

      {/* Import CSV modal */}
      <ImportModal
        open={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImported={() => {
          queryClient.invalidateQueries({ queryKey: ['transactions'] });
          queryClient.invalidateQueries({ queryKey: ['accounts'] });
          queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        }}
      />

      {/* Receipt OCR modal */}
      {showReceiptModal && (
        <ReceiptOcrModal
          onClose={() => setShowReceiptModal(false)}
        />
      )}

      {/* Duplicate review modal */}
      <DuplicateReviewModal
        isOpen={showDuplicateModal}
        onClose={() => {
          setShowDuplicateModal(false);
          queryClient.invalidateQueries({ queryKey: ['transactions', 'duplicates', 'count'] });
        }}
      />

      {/* Split transaction modal */}
      {splitTxn && (
        <SplitTransactionModal
          transaction={splitTxn}
          categories={categories}
          isOpen={!!splitTxn}
          onClose={() => setSplitTxn(null)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['transactions'] });
            setSplitTxn(null);
          }}
        />
      )}
    </div>
  );
}
