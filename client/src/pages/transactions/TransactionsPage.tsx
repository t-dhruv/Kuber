import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search, SlidersHorizontal, Plus, ChevronRight, RotateCcw, X, Check,
  ChevronLeft, ChevronRight as ChevronRightIcon, Upload, Scissors,
} from 'lucide-react';
import { api } from '@/lib/api';
import {
  Button, Input, Select, Modal, ModalFooter, Skeleton, Badge, Toggle, Card,
} from '@/components/ui';
import { ImportModal } from './components/ImportModal';
import { SplitTransactionModal } from './components/SplitTransactionModal';
import { DuplicateReviewModal } from './components/DuplicateReviewModal';

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
  emoji?: string | null;
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
  date: string;
  notes?: string;
  tags: Tag[];
  isRecurring: boolean;
  needsReview: boolean;
  isHidden: boolean;
  isPending: boolean;
  isSplit: boolean;
  splitDetails?: Array<{ categoryId: string; amount: number; note?: string }> | null;
}

interface TransactionListResponse {
  transactions: Transaction[];
  total: number;
  page: number;
  totalPages: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

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
      <div style={{ marginBottom: '0.5rem' }}>
        <Input
          placeholder="Search categories..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          leftIcon={<Search size={14} />}
        />
      </div>
      <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {groups.map((group) => (
          <div key={group}>
            <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '0 0.25rem', marginBottom: '0.25rem' }}>
              {group}
            </div>
            {filtered.filter((c) => (c.groupName ?? 'Other') === group).map((cat) => (
              <button
                key={cat.id}
                onClick={() => onSelect(cat.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  width: '100%', padding: '0.375rem 0.5rem',
                  borderRadius: 'var(--radius-sm)', border: 'none',
                  backgroundColor: selectedId === cat.id ? 'var(--color-accent-light)' : 'transparent',
                  cursor: 'pointer', textAlign: 'left',
                }}
                onMouseEnter={(e) => {
                  if (selectedId !== cat.id) e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)';
                }}
                onMouseLeave={(e) => {
                  if (selectedId !== cat.id) e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <span style={{
                  width: 24, height: 24, borderRadius: 'var(--radius-full)',
                  backgroundColor: 'var(--color-accent)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.75rem', flexShrink: 0,
                }}>
                  {cat.emoji ?? cat.name[0]}
                </span>
                <span style={{ fontSize: '0.875rem', color: 'var(--color-text)', fontWeight: selectedId === cat.id ? 600 : 400 }}>
                  {cat.name}
                </span>
                {selectedId === cat.id && <Check size={14} style={{ marginLeft: 'auto', color: 'var(--color-accent)' }} />}
              </button>
            ))}
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
            No categories found
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Transaction Detail Drawer ────────────────────────────────────────────────

interface DrawerProps {
  transaction: Transaction | null;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}

function TransactionDrawer({ transaction, categories, onClose, onSaved }: DrawerProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Partial<Transaction> & { tagInput?: string }>({});
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [tagInput, setTagInput] = useState('');

  // Sync form when transaction changes
  useEffect(() => {
    if (transaction) {
      setForm({ ...transaction });
      setShowCategoryPicker(false);
      setTagInput('');
    }
  }, [transaction?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveMutation = useMutation({
    mutationFn: async () => {
      // 1. Save core fields
      await api.put(`/transactions/${transaction!.id}`, {
        description: form.merchantName,
        date: form.date,
        amount: form.amount,
        categoryId: form.categoryId,
        notes: form.notes,
        needsReview: form.needsReview,
        isRecurring: form.isRecurring,
        isHidden: form.isHidden,
      });

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
      onSaved();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/transactions/${transaction!.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      onClose();
    },
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

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.2)', zIndex: 40 }}
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 380, zIndex: 50,
        backgroundColor: 'var(--color-surface)',
        borderLeft: '1px solid var(--color-border)',
        boxShadow: 'var(--shadow-lg)',
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.25s ease',
        display: 'flex', flexDirection: 'column',
        overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '1rem 1.25rem',
          borderBottom: '1px solid var(--color-border)',
          flexShrink: 0,
        }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--color-text)', margin: 0 }}>
            Transaction Details
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        {transaction && (
          <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1 }}>
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

            {/* Amount */}
            <Input
              label="Amount"
              type="number"
              step="0.01"
              value={form.amount ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, amount: parseFloat(e.target.value) || 0 }))}
            />

            {/* Category */}
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text)', marginBottom: '0.375rem' }}>
                Category
              </label>
              <button
                onClick={() => setShowCategoryPicker((v) => !v)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  width: '100%', padding: '0.5rem 0.75rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-surface)',
                  cursor: 'pointer', textAlign: 'left',
                }}
              >
                {selectedCategory ? (
                  <>
                    <span style={{
                      width: 22, height: 22, borderRadius: 'var(--radius-full)',
                      backgroundColor: 'var(--color-accent)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.6875rem', flexShrink: 0,
                    }}>
                      {selectedCategory.emoji ?? selectedCategory.name[0]}
                    </span>
                    <span style={{ fontSize: '0.875rem', color: 'var(--color-text)', flex: 1 }}>{selectedCategory.name}</span>
                  </>
                ) : (
                  <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', flex: 1 }}>Select category...</span>
                )}
                <ChevronRightIcon size={14} style={{ color: 'var(--color-text-muted)', transform: showCategoryPicker ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
              </button>
              {showCategoryPicker && (
                <div style={{ marginTop: '0.5rem', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '0.5rem' }}>
                  <CategoryPicker
                    categories={categories}
                    selectedId={form.categoryId ?? ''}
                    onSelect={(id) => { setForm((f) => ({ ...f, categoryId: id })); setShowCategoryPicker(false); }}
                  />
                </div>
              )}
            </div>

            {/* Account (read-only) */}
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text)', marginBottom: '0.375rem' }}>
                Account
              </label>
              <div style={{
                padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg)',
                fontSize: '0.875rem', color: 'var(--color-text-secondary)',
              }}>
                {transaction.accountName}{transaction.accountLastFour ? ` ••${transaction.accountLastFour}` : ''}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text)', marginBottom: '0.375rem' }}>
                Notes
              </label>
              <textarea
                value={form.notes ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={3}
                style={{
                  width: '100%', padding: '0.5rem 0.75rem',
                  borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-surface)', color: 'var(--color-text)',
                  fontSize: '0.875rem', resize: 'vertical', fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }}
                placeholder="Add a note..."
              />
            </div>

            {/* Tags */}
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text)', marginBottom: '0.375rem' }}>
                Tags
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginBottom: '0.5rem' }}>
                {(form.tags ?? []).map((tag) => (
                  <span key={tag.id} style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                    padding: '0.125rem 0.5rem 0.125rem 0.625rem',
                    borderRadius: 'var(--radius-full)',
                    backgroundColor: 'var(--color-accent-light)',
                    color: 'var(--color-accent)',
                    fontSize: '0.75rem', fontWeight: 500,
                  }}>
                    {tag.name}
                    <button onClick={() => removeTag(tag.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit', display: 'flex', alignItems: 'center' }}>
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(tagInput); } }}
                  placeholder="Add tag..."
                  style={{
                    flex: 1, padding: '0.375rem 0.625rem',
                    borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)',
                    backgroundColor: 'var(--color-surface)', color: 'var(--color-text)',
                    fontSize: '0.8125rem', fontFamily: 'inherit',
                  }}
                />
                <Button variant="secondary" size="sm" onClick={() => addTag(tagInput)}>Add</Button>
              </div>
            </div>

            {/* Toggles */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.875rem', color: 'var(--color-text)' }}>Needs Review</span>
                <Toggle
                  id="txn-needs-review"
                  checked={form.needsReview ?? false}
                  onChange={(e) => setForm((f) => ({ ...f, needsReview: e.target.checked }))}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.875rem', color: 'var(--color-text)' }}>Is Recurring</span>
                <Toggle
                  id="txn-is-recurring"
                  checked={form.isRecurring ?? false}
                  onChange={(e) => setForm((f) => ({ ...f, isRecurring: e.target.checked }))}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.875rem', color: 'var(--color-text)' }}>Hide from reports</span>
                <Toggle
                  id="txn-is-hidden"
                  checked={form.isHidden ?? false}
                  onChange={(e) => setForm((f) => ({ ...f, isHidden: e.target.checked }))}
                />
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        {transaction && (
          <div style={{
            padding: '1rem 1.25rem',
            borderTop: '1px solid var(--color-border)',
            display: 'flex', gap: '0.5rem', flexShrink: 0,
          }}>
            <Button
              variant="primary"
              loading={saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
              style={{ flex: 1 }}
            >
              Save
            </Button>
            <Button
              variant="danger"
              loading={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
            >
              Delete
            </Button>
          </div>
        )}
      </div>
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

function AddTransactionModal({ open, onClose, accounts, categories }: AddModalProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    date: fmtInputDate(new Date().toISOString()),
    description: '',
    amount: '',
    accountId: '',
    categoryId: '',
    notes: '',
  });

  const mutation = useMutation({
    mutationFn: () => api.post('/transactions', {
      ...form,
      amount: parseFloat(form.amount) || 0,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      onClose();
      setForm({ date: fmtInputDate(new Date().toISOString()), description: '', amount: '', accountId: '', categoryId: '', notes: '' });
    },
  });

  const accountOptions = accounts.map((a) => ({
    value: a.id,
    label: `${a.name}${a.lastFour ? ` ••${a.lastFour}` : ''}`,
  }));

  const categoryOptions = categories.map((c) => ({
    value: c.id,
    label: `${c.emoji ?? ''} ${c.name}`.trim(),
  }));

  return (
    <Modal open={open} onClose={onClose} title="Add Transaction" size="md">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <Input
            label="Date"
            type="date"
            value={form.date}
            onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
          />
          <Input
            label="Amount"
            type="number"
            step="0.01"
            placeholder="-45.00"
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
          />
        </div>
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
        <Select
          label="Category"
          options={categoryOptions}
          placeholder="Select category..."
          value={form.categoryId}
          onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
        />
        <div>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text)', marginBottom: '0.375rem' }}>
            Notes
          </label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            rows={2}
            placeholder="Optional notes..."
            style={{
              width: '100%', padding: '0.5rem 0.75rem',
              borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)',
              backgroundColor: 'var(--color-surface)', color: 'var(--color-text)',
              fontSize: '0.875rem', resize: 'vertical', fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
          />
        </div>
      </div>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button
          variant="primary"
          loading={mutation.isPending}
          onClick={() => mutation.mutate()}
          disabled={!form.description || !form.amount || !form.accountId}
        >
          Add Transaction
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
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.15)', zIndex: 30 }}
          onClick={onClose}
        />
      )}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 320, zIndex: 35,
        backgroundColor: 'var(--color-surface)',
        borderLeft: '1px solid var(--color-border)',
        boxShadow: 'var(--shadow-lg)',
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.25s ease',
        display: 'flex', flexDirection: 'column',
        overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '1rem 1.25rem',
          borderBottom: '1px solid var(--color-border)',
          flexShrink: 0,
        }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--color-text)', margin: 0 }}>Filters</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {/* Filter sections */}
        <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', flex: 1 }}>
          {/* Date Range */}
          <div>
            <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.5rem' }}>
              Date Range
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>From</label>
                <input
                  type="date"
                  value={localFrom}
                  onChange={(e) => setLocalFrom(e.target.value)}
                  style={{
                    width: '100%', padding: '0.4rem 0.5rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    backgroundColor: 'var(--color-surface)',
                    color: 'var(--color-text)',
                    fontSize: '0.8125rem', fontFamily: 'inherit',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>To</label>
                <input
                  type="date"
                  value={localTo}
                  onChange={(e) => setLocalTo(e.target.value)}
                  style={{
                    width: '100%', padding: '0.4rem 0.5rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    backgroundColor: 'var(--color-surface)',
                    color: 'var(--color-text)',
                    fontSize: '0.8125rem', fontFamily: 'inherit',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>
          </div>

          {/* Account */}
          <div>
            <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.5rem' }}>
              Account
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input type="radio" checked={localAccountId === ''} onChange={() => setLocalAccountId('')} style={{ accentColor: 'var(--color-accent)' }} />
                <span style={{ fontSize: '0.875rem', color: 'var(--color-text)' }}>All accounts</span>
              </label>
              {accounts.map((acc) => (
                <label key={acc.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input type="radio" checked={localAccountId === acc.id} onChange={() => setLocalAccountId(acc.id)} style={{ accentColor: 'var(--color-accent)' }} />
                  <span style={{ fontSize: '0.875rem', color: 'var(--color-text)' }}>
                    {acc.name}{acc.lastFour ? ` ••${acc.lastFour}` : ''}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Categories */}
          <div>
            <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.5rem' }}>
              Categories
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', maxHeight: 200, overflowY: 'auto' }}>
              {categories.map((cat) => (
                <label key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={localCategoryIds.includes(cat.id)}
                    onChange={() => toggleCategory(cat.id)}
                    style={{ accentColor: 'var(--color-accent)' }}
                  />
                  <span style={{ fontSize: '0.75rem' }}>{cat.emoji ?? ''}</span>
                  <span style={{ fontSize: '0.875rem', color: 'var(--color-text)' }}>{cat.name}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Amount range */}
          <div>
            <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.5rem' }}>
              Amount Range
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
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
            <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.5rem' }}>
              Type
            </div>
            <div style={{ display: 'flex', gap: '0.375rem' }}>
              {(['all', 'income', 'expense'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setLocalType(t)}
                  style={{
                    flex: 1,
                    padding: '0.375rem 0',
                    borderRadius: 'var(--radius-full)',
                    border: '1px solid var(--color-border)',
                    cursor: 'pointer',
                    fontSize: '0.8125rem',
                    fontWeight: 500,
                    backgroundColor: localType === t ? 'var(--color-accent)' : 'var(--color-surface)',
                    color: localType === t ? '#fff' : 'var(--color-text-secondary)',
                    transition: 'background-color 0.15s, color 0.15s',
                  }}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Toggles */}
          <div>
            <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.625rem' }}>
              Other
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {[
                { label: 'Needs Review only', value: localNeedsReview, onChange: setLocalNeedsReview },
                { label: 'Recurring only', value: localRecurring, onChange: setLocalRecurring },
                { label: 'Show Hidden', value: localHidden, onChange: setLocalHidden },
                { label: 'Include Pending', value: localPending, onChange: setLocalPending },
              ].map(({ label, value, onChange }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.875rem', color: 'var(--color-text)' }}>{label}</span>
                  <Toggle checked={value} onChange={(e) => onChange(e.target.checked)} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '1rem 1.25rem',
          borderTop: '1px solid var(--color-border)',
          display: 'flex', gap: '0.5rem', flexShrink: 0,
        }}>
          <Button variant="secondary" onClick={clearFilters} style={{ flex: 1 }}>Clear</Button>
          <Button variant="primary" onClick={applyFilters} style={{ flex: 1 }}>Apply</Button>
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
    <div style={{
      position: 'sticky', top: 0, zIndex: 20,
      backgroundColor: 'var(--color-accent)',
      padding: '0.625rem 1rem',
      display: 'flex', alignItems: 'center', gap: '0.5rem',
      borderRadius: 'var(--radius-md)',
      marginBottom: '0.5rem',
      flexWrap: 'wrap',
    }}>
      <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#fff', marginRight: 'auto' }}>
        {count} selected
      </span>

      <div style={{ position: 'relative' }} ref={pickerRef}>
        <button
          onClick={() => setShowCategoryPicker((v) => !v)}
          style={{ background: 'rgba(255,255,255,0.2)', border: 'none', cursor: 'pointer', color: '#fff', padding: '0.375rem 0.75rem', borderRadius: 'var(--radius-sm)', fontSize: '0.8125rem', fontWeight: 500 }}
        >
          Recategorize
        </button>
        {showCategoryPicker && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, marginTop: '0.375rem',
            width: 260, backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-md)', padding: '0.5rem', zIndex: 10,
          }}>
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
          style={{ background: 'rgba(255,255,255,0.2)', border: 'none', cursor: 'pointer', color: '#fff', padding: '0.375rem 0.75rem', borderRadius: 'var(--radius-sm)', fontSize: '0.8125rem', fontWeight: 500 }}
        >
          {label}
        </button>
      ))}

      <button onClick={onClear} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.8)', padding: 4 }}>
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
    <div style={{
      display: 'flex', alignItems: 'center',
      height: 52, padding: '0 0.75rem',
      gap: '0.75rem',
      backgroundColor: selected ? 'var(--color-accent-light)' : 'transparent',
      cursor: 'default',
    }}
      onMouseEnter={(e) => { if (!selected) e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)'; }}
      onMouseLeave={(e) => { if (!selected) e.currentTarget.style.backgroundColor = 'transparent'; }}
    >
      {/* Checkbox */}
      <input
        type="checkbox"
        checked={selected}
        onChange={(e) => onSelect(txn.id, e.target.checked)}
        style={{ accentColor: 'var(--color-accent)', flexShrink: 0, cursor: 'pointer' }}
      />

      {/* Category circle */}
      <div style={{
        width: 32, height: 32, borderRadius: 'var(--radius-full)', flexShrink: 0,
        backgroundColor: txn.categoryColor ?? 'var(--color-accent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontSize: '0.75rem', fontWeight: 700,
      }}>
        {txn.categoryIcon ?? merchantInitial(txn.merchantName)}
      </div>

      {/* Merchant name */}
      <div style={{ flex: '1 1 180px', minWidth: 0 }} onDoubleClick={startEdit}>
        {editing ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(false); }}
            style={{
              fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text)',
              border: '1px solid var(--color-accent)', borderRadius: 'var(--radius-sm)',
              padding: '0.125rem 0.375rem', background: 'var(--color-surface)',
              fontFamily: 'inherit', width: '100%',
            }}
          />
        ) : (
          <div style={{
            fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {txn.merchantName}
          </div>
        )}
      </div>

      {/* Category name — hidden on mobile */}
      <div className="hidden sm:block" style={{ flex: '0 0 130px', fontSize: '0.8125rem', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {txn.categoryName}
      </div>

      {/* Account — hidden on mobile and tablet */}
      <div className="hidden md:block" style={{ flex: '0 0 150px', fontSize: '0.8125rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {txn.accountName}{txn.accountLastFour ? ` ••${txn.accountLastFour}` : ''}
      </div>

      {/* Badges — hidden on mobile */}
      <div className="hidden sm:flex" style={{ gap: '0.25rem', flex: '0 0 auto' }}>
        {txn.isRecurring && (
          <span title="Recurring" style={{ color: 'var(--color-info)', fontSize: '0.875rem' }}>
            <RotateCcw size={13} />
          </span>
        )}
        {txn.needsReview && (
          <span style={{
            fontSize: '0.6875rem', fontWeight: 600,
            padding: '0.125rem 0.375rem', borderRadius: 'var(--radius-full)',
            backgroundColor: 'var(--color-warning-light)', color: 'var(--color-warning)',
          }}>
            Review
          </span>
        )}
        {txn.isPending && (
          <span style={{
            fontSize: '0.6875rem', fontWeight: 600,
            padding: '0.125rem 0.375rem', borderRadius: 'var(--radius-full)',
            backgroundColor: 'var(--color-surface-hover)', color: 'var(--color-text-muted)',
            border: '1px solid var(--color-border)',
          }}>
            Pending
          </span>
        )}
        {txn.isSplit && (
          <span style={{
            fontSize: '0.6875rem', fontWeight: 600,
            padding: '0.125rem 0.375rem', borderRadius: 'var(--radius-full)',
            backgroundColor: 'var(--color-accent-light)', color: 'var(--color-accent)',
          }}>
            Split
          </span>
        )}
      </div>

      {/* Split button — hidden on mobile */}
      <button
        className="hidden sm:flex"
        onClick={(e) => { e.stopPropagation(); onSplit(txn); }}
        title={txn.isSplit ? 'Edit split' : 'Split transaction'}
        style={{
          alignItems: 'center', gap: '0.25rem',
          background: 'none', border: 'none', cursor: 'pointer',
          color: txn.isSplit ? 'var(--color-accent)' : 'var(--color-text-muted)',
          padding: 4, flexShrink: 0,
        }}
      >
        <Scissors size={14} />
      </button>

      {/* Amount */}
      <div style={{
        flex: '0 0 90px', textAlign: 'right',
        fontSize: '0.875rem', fontWeight: 600,
        fontVariantNumeric: 'tabular-nums',
        color: txn.amount < 0 ? 'var(--color-danger)' : 'var(--color-success)',
      }}>
        {txn.amount < 0 ? '-' : '+'}{fmtCurrency(txn.amount)}
      </div>

      {/* Arrow */}
      <button
        onClick={() => onOpen(txn)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 4, flexShrink: 0 }}
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

// ─── Pagination ───────────────────────────────────────────────────────────────

function Pagination({ page, total, pageSize, onChange }: { page: number; total: number; pageSize: number; onChange: (p: number) => void }) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;

  const pages: (number | '...')[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push('...');
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
    if (page < totalPages - 2) pages.push('...');
    pages.push(totalPages);
  }

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 0', borderTop: '1px solid var(--color-border)' }}>
      <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
        Showing {start}–{end} of {total} transactions
      </span>
      <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
        <button
          onClick={() => onChange(page - 1)}
          disabled={page === 1}
          style={{ background: 'none', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '0.25rem 0.5rem', cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.4 : 1, color: 'var(--color-text-secondary)' }}
        >
          <ChevronLeft size={14} />
        </button>
        {pages.map((p, i) => (
          p === '...' ? (
            <span key={`ellipsis-${i}`} style={{ padding: '0 0.25rem', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>…</span>
          ) : (
            <button
              key={p}
              onClick={() => onChange(p as number)}
              style={{
                minWidth: 32, padding: '0.25rem 0.5rem',
                borderRadius: 'var(--radius-sm)', fontSize: '0.8125rem',
                border: p === page ? 'none' : '1px solid var(--color-border)',
                cursor: 'pointer',
                backgroundColor: p === page ? 'var(--color-accent)' : 'transparent',
                color: p === page ? '#fff' : 'var(--color-text-secondary)',
                fontWeight: p === page ? 600 : 400,
              }}
            >
              {p}
            </button>
          )
        ))}
        <button
          onClick={() => onChange(page + 1)}
          disabled={page === totalPages}
          style={{ background: 'none', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '0.25rem 0.5rem', cursor: page === totalPages ? 'not-allowed' : 'pointer', opacity: page === totalPages ? 0.4 : 1, color: 'var(--color-text-secondary)' }}
        >
          <ChevronRightIcon size={14} />
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TransactionsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [drawerTxn, setDrawerTxn] = useState<Transaction | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [splitTxn, setSplitTxn] = useState<Transaction | null>(null);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);

  const page = parseInt(searchParams.get('page') ?? '1', 10);
  const search = searchParams.get('search') ?? '';

  // ── Data queries ──

  const { data: txnData, isLoading: txnsLoading } = useQuery<TransactionListResponse>({
    queryKey: ['transactions', Object.fromEntries(searchParams)],
    queryFn: () => api.get('/transactions?' + searchParams.toString()).then((r) => r.data),
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

  const accounts = accountsData?.groups?.flatMap((g) => g.accounts) ?? [];
  const categories = categoriesData ?? [];
  const transactions: Transaction[] = txnData?.transactions ?? [];
  const total = txnData?.total ?? 0;

  // ── URL param helpers ──

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    next.set('page', '1');
    setSearchParams(next);
  }

  function setPage(p: number) {
    const next = new URLSearchParams(searchParams);
    next.set('page', String(p));
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
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['transactions'] }); setSelectedIds(new Set()); },
  });

  const bulkMarkReviewedMutation = useMutation({
    mutationFn: () =>
      api.post('/transactions/bulk', { action: 'mark-reviewed', ids: Array.from(selectedIds) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['transactions'] }); setSelectedIds(new Set()); },
  });

  const bulkHideMutation = useMutation({
    mutationFn: () =>
      api.post('/transactions/bulk', { action: 'hide', ids: Array.from(selectedIds) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['transactions'] }); setSelectedIds(new Set()); },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: () =>
      api.post('/transactions/bulk', { action: 'delete', ids: Array.from(selectedIds) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['transactions'] }); setSelectedIds(new Set()); },
  });

  // ── Inline merchant edit ──

  const merchantEditMutation = useMutation({
    mutationFn: ({ id, merchantName }: { id: string; merchantName: string }) =>
      api.put(`/transactions/${id}`, { description: merchantName }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['transactions'] }),
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
    <div style={{ padding: '1rem 0', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text)', margin: 0, marginRight: 'auto' }}>
          Transactions
        </h1>

        {/* Search — full width on mobile */}
        <div className="w-full sm:w-60">
          <Input
            placeholder="Search..."
            value={search}
            onChange={(e) => setParam('search', e.target.value)}
            leftIcon={<Search size={14} />}
          />
        </div>

        {/* Date range — hidden on mobile, shown on sm+ */}
        <div className="hidden sm:flex items-center gap-1.5">
          <input
            type="date"
            value={searchParams.get('startDate') ?? ''}
            onChange={(e) => setParam('startDate', e.target.value)}
            style={{
              padding: '0.4rem 0.625rem', borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface)',
              color: 'var(--color-text)', fontSize: '0.8125rem', fontFamily: 'inherit',
            }}
          />
          <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>–</span>
          <input
            type="date"
            value={searchParams.get('endDate') ?? ''}
            onChange={(e) => setParam('endDate', e.target.value)}
            style={{
              padding: '0.4rem 0.625rem', borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface)',
              color: 'var(--color-text)', fontSize: '0.8125rem', fontFamily: 'inherit',
            }}
          />
        </div>

        {/* Filters button */}
        <button
          onClick={() => setShowFilters(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.375rem',
            padding: '0.4rem 0.875rem', borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border)',
            backgroundColor: activeFilterCount > 0 ? 'var(--color-accent-light)' : 'var(--color-surface)',
            color: activeFilterCount > 0 ? 'var(--color-accent)' : 'var(--color-text-secondary)',
            cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500,
          }}
        >
          <SlidersHorizontal size={14} />
          Filters
          {activeFilterCount > 0 && (
            <span style={{
              backgroundColor: 'var(--color-accent)', color: '#fff',
              borderRadius: 'var(--radius-full)', padding: '0 0.375rem',
              fontSize: '0.6875rem', fontWeight: 700,
            }}>
              {activeFilterCount}
            </span>
          )}
        </button>

        {/* Import CSV button */}
        <Button
          variant="secondary"
          icon={<Upload size={14} />}
          onClick={() => setShowImportModal(true)}
        >
          Import CSV
        </Button>

        {/* Add button */}
        <Button
          variant="primary"
          icon={<Plus size={14} />}
          onClick={() => setShowAddModal(true)}
        >
          Add
        </Button>
      </div>

      {/* Bulk actions */}
      {someSelected && (
        <BulkActionsBar
          count={selectedIds.size}
          categories={categories}
          onRecategorize={(id) => bulkRecategorizeMutation.mutate(id)}
          onMarkReviewed={() => bulkMarkReviewedMutation.mutate()}
          onHide={() => bulkHideMutation.mutate()}
          onDelete={() => bulkDeleteMutation.mutate()}
          onClear={() => setSelectedIds(new Set())}
        />
      )}

      {/* Duplicate transactions warning banner */}
      {duplicateCount > 0 && (
        <button
          onClick={() => setShowDuplicateModal(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            width: '100%',
            padding: '0.625rem 1rem',
            borderRadius: 'var(--radius-md)',
            border: '1px solid #f59e0b',
            backgroundColor: '#fffbeb',
            color: '#92400e',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: 500,
            textAlign: 'left',
          }}
        >
          <span style={{ fontSize: '1rem' }}>⚠</span>
          <span>
            <strong>{duplicateCount}</strong> potential duplicate transaction
            {duplicateCount !== 1 ? 's' : ''} found —{' '}
            <span style={{ textDecoration: 'underline' }}>Review</span>
          </span>
        </button>
      )}

      {/* Transaction list */}
      <div className="overflow-x-auto">
      <Card padding="none">
        {/* Column header */}
        <div style={{
          display: 'flex', alignItems: 'center',
          height: 40, padding: '0 0.75rem',
          gap: '0.75rem',
          borderBottom: '1px solid var(--color-border)',
          backgroundColor: 'var(--color-bg)',
        }}>
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleSelectAll}
            style={{ accentColor: 'var(--color-accent)', flexShrink: 0, cursor: 'pointer' }}
          />
          <div style={{ width: 32, flexShrink: 0 }} />
          <div style={{ flex: '1 1 180px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Merchant</div>
          <div className="hidden sm:block" style={{ flex: '0 0 130px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Category</div>
          <div className="hidden md:block" style={{ flex: '0 0 150px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Account</div>
          <div className="hidden sm:block" style={{ flex: '0 0 auto', minWidth: 60 }} />
          <div style={{ flex: '0 0 90px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'right' }}>Amount</div>
          <div style={{ width: 24, flexShrink: 0 }} />
        </div>

        {txnsLoading ? (
          <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', height: 52 }}>
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
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
            No transactions found.
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.date}>
              {/* Date group header */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0.375rem 0.75rem',
                backgroundColor: 'var(--color-bg)',
                borderBottom: '1px solid var(--color-border)',
                borderTop: '1px solid var(--color-border)',
              }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {fmtGroupDate(group.date)}
                </span>
                <span style={{
                  fontSize: '0.8125rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                  color: group.dayTotal < 0 ? 'var(--color-danger)' : 'var(--color-success)',
                }}>
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
                    <div style={{ height: 1, backgroundColor: 'var(--color-border)', marginLeft: '0.75rem' }} />
                  )}
                </div>
              ))}
            </div>
          ))
        )}

        {/* Pagination */}
        {!txnsLoading && total > PAGE_SIZE && (
          <div style={{ padding: '0 0.75rem' }}>
            <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />
          </div>
        )}
      </Card>
      </div>

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
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.75rem' }}>
              Summary
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
              {[
                { label: 'Total transactions', value: String(transactions.length) },
                { label: 'Total spending', value: fmtCurrency(totalSpending) },
                { label: 'Largest expense', value: largestExpense > 0 ? fmtCurrency(largestExpense) : '—' },
                { label: 'Average transaction', value: fmtCurrency(avgAmount) },
                { label: 'First transaction', value: firstDate },
                { label: 'Last transaction', value: lastDate },
              ].map(({ label, value }) => (
                <div key={label}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.125rem' }}>{label}</div>
                  <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--color-text)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
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
        onImported={() => queryClient.invalidateQueries({ queryKey: ['transactions'] })}
      />

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
