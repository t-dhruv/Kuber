import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Settings, Pencil, Trash2, PauseCircle, PlayCircle, Check } from 'lucide-react';
import { api } from '@/lib/api';
import {
  FREQUENCY_OPTIONS,
  frequencyLabel,
  normalizeFrequency,
  type Frequency,
} from './frequency';
import {
  Card, Button, Input, Select, Modal, ModalFooter, Skeleton, Toggle, CategoryCombobox,
} from '@/components/ui';
import { notify } from '@/components/ui';

// ─── Types ────────────────────────────────────────────────────────────────────

type ViewMode = 'monthly' | 'all' | 'calendar';

interface RecurringItem {
  id: string;
  name: string;
  amount: number;
  frequency: Frequency;
  nextDate: string;
  accountId: string;
  accountName: string;
  accountLastFour?: string;
  categoryId: string;
  categoryName: string;
  categoryIcon?: string;
  isActive: boolean;
  isPaid?: boolean;
  paidDate?: string;
  daysUntilDue?: number;
}

interface MonthlySummaryExpenseItem {
  id: string;
  name: string;
  amount: number;
  nextDate: string;
  daysUntil: number;
  isPaid: boolean;
}

interface MonthlySummaryIncomeItem {
  id: string;
  name: string;
  amount: number;
  nextDate: string;
  isActive: boolean;
}

interface MonthlySummary {
  month: number;
  year: number;
  totalIncome: number;
  totalExpenses: number;
  totalMonthly: number;
  income: MonthlySummaryIncomeItem[];
  expenses: MonthlySummaryExpenseItem[];
}

interface AccountsApiResponse {
  groups: Array<{ type: string; totalBalance: number; accounts: Account[] }>;
  netWorth: object;
}

interface Account {
  id: string;
  name: string;
  lastFour?: string;
  [key: string]: unknown;
}

interface AccountOption {
  id: string;
  name: string;
  lastFour?: string;
}

interface CategoryOption {
  id: string;
  name: string;
  icon?: string;
}

interface CategoryResponse {
  id: string;
  name: string;
  icon?: string | null;
}

interface RecurringFormValues {
  name: string;
  amount: string;
  frequency: Frequency;
  nextDate: string;
  accountId: string;
  categoryId: string;
  isActive: boolean;
}

const EMPTY_FORM: RecurringFormValues = {
  name: '',
  amount: '',
  frequency: 'MONTHLY',
  nextDate: '',
  accountId: '',
  categoryId: '',
  isActive: true,
};

// ─── Constants ────────────────────────────────────────────────────────────────

// ─── Formatters ───────────────────────────────────────────────────────────────

const fmtCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.abs(amount));

const fmtDate = (date: string) =>
  new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

function formatDaysUntil(days?: number): string {
  if (days === undefined) return '';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

function statusBadgeStyle(isPaid: boolean, daysUntil: number): { bg: string; color: string } {
  if (isPaid) return { bg: 'var(--color-success-light)', color: 'var(--color-success)' };
  if (daysUntil <= 3) return { bg: 'var(--color-danger-light)', color: 'var(--color-danger)' };
  if (daysUntil <= 7) return { bg: 'var(--color-warning-light)', color: 'var(--color-warning)' };
  return { bg: 'var(--color-surface-alt)', color: 'var(--color-text-secondary)' };
}

function StatusBadge({ isPaid, daysUntil }: { isPaid: boolean; daysUntil: number }) {
  const { bg, color } = statusBadgeStyle(isPaid, daysUntil);
  const label = isPaid ? 'Paid' : `Due ${formatDaysUntil(daysUntil)}`;
  return (
    <span style={{
      background: bg,
      color,
      padding: '2px 8px',
      borderRadius: 'var(--radius-full)',
      fontSize: 12,
      fontWeight: 500,
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

function accountLabel(item: RecurringItem): string {
  return item.accountLastFour
    ? `${item.accountName} ••${item.accountLastFour}`
    : item.accountName;
}

// ─── Add/Edit Modal ───────────────────────────────────────────────────────────

function RecurringModal({
  open,
  onClose,
  editing,
  prefill,
  accounts,
  categories,
}: {
  open: boolean;
  onClose: () => void;
  editing: RecurringItem | null;
  prefill?: Partial<RecurringFormValues>;
  accounts: AccountOption[];
  categories: CategoryOption[];
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<RecurringFormValues>(EMPTY_FORM);

  useEffect(() => {
    if (editing) {
      setForm({
        name: editing.name,
        amount: String(editing.amount),
        frequency: normalizeFrequency(editing.frequency),
        nextDate: editing.nextDate ? editing.nextDate.slice(0, 10) : '',
        accountId: editing.accountId,
        categoryId: editing.categoryId,
        isActive: editing.isActive,
      });
    } else {
      setForm({ ...EMPTY_FORM, ...prefill });
    }
  }, [editing, open, prefill]);

  function set(field: keyof RecurringFormValues, value: string | boolean) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  const createMut = useMutation({
    mutationFn: (body: object) => api.post('/recurring', body).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recurring-monthly'] });
      qc.invalidateQueries({ queryKey: ['recurring-all'] });
      notify.success('Recurring item added');
      onClose();
    },
    onError: () => notify.error('Failed to add recurring item'),
  });

  const updateMut = useMutation({
    mutationFn: (body: object) => api.put(`/recurring/${editing!.id}`, body).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recurring-monthly'] });
      qc.invalidateQueries({ queryKey: ['recurring-all'] });
      notify.success('Recurring item updated');
      onClose();
    },
    onError: () => notify.error('Failed to update recurring item'),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body = {
      name: form.name.trim(),
      amount: parseFloat(form.amount),
      frequency: form.frequency,
      nextDate: form.nextDate,
      accountId: form.accountId,
      categoryId: form.categoryId,
      isActive: form.isActive,
    };
    if (editing) {
      updateMut.mutate(body);
    } else {
      createMut.mutate(body);
    }
  }

  const isPending = createMut.isPending || updateMut.isPending;

  const accountOptions = accounts.map((a) => ({
    value: a.id,
    label: a.lastFour ? `${a.name} ••${a.lastFour}` : a.name,
  }));


  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit Recurring' : 'Add Recurring'}
      size="md"
    >
      <form onSubmit={handleSubmit}>
        <div className="flex flex-col gap-4">
          <Input
            label="Name"
            placeholder="Netflix, Rent, Gym..."
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            required
          />
          <Input
            label="Amount"
            type="number"
            step="0.01"
            placeholder="-29.99 for expenses, 1500 for income"
            value={form.amount}
            onChange={(e) => set('amount', e.target.value)}
            required
          />
          <Select
            label="Frequency"
            options={FREQUENCY_OPTIONS}
            value={form.frequency}
            onChange={(e) => set('frequency', e.target.value as Frequency)}
          />
          <Input
            label="Next Date"
            type="date"
            value={form.nextDate}
            onChange={(e) => set('nextDate', e.target.value)}
            required
          />
          {accountOptions.length > 0 && (
            <Select
              label="Account"
              options={accountOptions}
              placeholder="Select account"
              value={form.accountId}
              onChange={(e) => set('accountId', e.target.value)}
            />
          )}
          {categories.length > 0 && (
            <CategoryCombobox
              label="Category"
              categories={categories.map((c) => ({ id: c.id, name: c.name, icon: c.icon }))}
              value={form.categoryId}
              onChange={(id) => set('categoryId', id)}
            />
          )}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-[var(--color-text)]">Active</span>
            <Toggle
              checked={form.isActive}
              onChange={(e) => set('isActive', e.target.checked)}
            />
          </div>
        </div>
        <ModalFooter>
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={isPending}>{editing ? 'Save' : 'Add'}</Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

// ─── Monthly View ─────────────────────────────────────────────────────────────

function MonthlyView({
  data,
  isLoading,
  isError,
  onAddIncome,
}: {
  data?: MonthlySummary;
  isLoading: boolean;
  isError: boolean;
  onAddIncome: () => void;
}) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton height={80} width="100%" />
        <Skeleton height={200} width="100%" />
        <Skeleton height={160} width="100%" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Card padding="lg">
        <p className="text-[var(--color-danger)] text-sm">Failed to load monthly summary.</p>
      </Card>
    );
  }

  const unpaidExpenses = data.expenses.filter((e) => !e.isPaid);
  const paidExpenses = data.expenses.filter((e) => e.isPaid);
  const expensesPaid = paidExpenses.reduce((s, e) => s + Math.abs(e.amount), 0);
  const expensesRemaining = unpaidExpenses.reduce((s, e) => s + Math.abs(e.amount), 0);
  const expensePct = data.totalExpenses > 0
    ? Math.min(expensesPaid / data.totalExpenses, 1) * 100
    : 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Summary bar */}
      <Card padding="lg">
        <div className="flex flex-col gap-[0.875rem]">
          {/* Income row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-[0.8125rem] font-semibold text-[var(--color-text-secondary)] w-[72px]">Income</span>
              <span className="text-base font-bold text-[var(--color-success)]" style={{ fontFamily: 'var(--font-display)', fontVariantNumeric: 'tabular-nums' }}>
                {fmtCurrency(data.totalIncome)}
              </span>
            </div>
            <Button size="sm" variant="outline" icon={<Plus size={12} />} onClick={onAddIncome}>
              Add income
            </Button>
          </div>

          {/* Expenses row */}
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-[0.8125rem] font-semibold text-[var(--color-text-secondary)] w-[72px] shrink-0">Expenses</span>
            <div className="flex-1 min-w-[160px]">
              <div className="h-2 bg-[var(--color-border)] rounded-[var(--radius-full)] overflow-hidden">
                <div
                  className="h-full bg-[var(--color-accent)] rounded-[var(--radius-full)] transition-[width] duration-[0.4s] ease-in-out"
                  style={{ width: `${expensePct}%` }}
                />
              </div>
              <div className="flex justify-between mt-1 text-xs text-[var(--color-text-secondary)]">
                <span>{fmtCurrency(expensesPaid)} paid</span>
                <span>{fmtCurrency(expensesRemaining)} remaining</span>
              </div>
            </div>
            <span className="text-sm font-semibold text-[var(--color-text)] shrink-0" style={{ fontFamily: 'var(--font-display)', fontVariantNumeric: 'tabular-nums' }}>
              Total: {fmtCurrency(data.totalExpenses)}
            </span>
          </div>
        </div>
      </Card>

      {/* Upcoming (unpaid expenses) */}
      <Card padding="lg">
        <div className="mb-3">
          <span className="text-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-[0.04em]">
            Upcoming
          </span>
        </div>

        {unpaidExpenses.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)] py-2">
            No upcoming items this month.
          </p>
        ) : (
          <>
            {/* Header */}
            <div className="grid gap-2 pb-2 border-b border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-muted)]" style={{ gridTemplateColumns: '1fr 120px 90px 36px' }}>
              <span>Name</span>
              <span>Status</span>
              <span className="text-right">Amount</span>
              <span />
            </div>

            {unpaidExpenses.map((item, idx) => (
              <div key={item.id}>
                <div className="grid gap-2 py-[0.625rem] items-center text-[0.8125rem]" style={{ gridTemplateColumns: '1fr 120px 90px 36px' }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="min-w-0">
                      <div className="font-medium text-[var(--color-text)] whitespace-nowrap overflow-hidden text-ellipsis">
                        {item.name}
                      </div>
                    </div>
                  </div>
                  <StatusBadge isPaid={false} daysUntil={item.daysUntil} />
                  <span className="text-right font-semibold text-[var(--color-danger)]" style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>
                    -{fmtCurrency(item.amount)}
                  </span>
                  <span />
                </div>
                {idx < unpaidExpenses.length - 1 && (
                  <div className="h-px bg-[var(--color-border)]" />
                )}
              </div>
            ))}

            {/* Total row */}
            <div className="border-t border-[var(--color-border)] pt-[0.625rem] mt-1 flex justify-between text-sm">
              <span className="text-[var(--color-text-secondary)]">Upcoming total</span>
              <span className="font-semibold text-[var(--color-text)]">
                {fmtCurrency(expensesRemaining)}
              </span>
            </div>
          </>
        )}
      </Card>

      {/* Completed (paid expenses) */}
      <Card padding="lg">
        <div className="mb-3">
          <span className="text-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-[0.04em]">
            Completed
          </span>
        </div>

        {paidExpenses.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)] py-2">
            No completed items yet.
          </p>
        ) : (
          <>
            {/* Header */}
            <div className="grid gap-2 pb-2 border-b border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-muted)]" style={{ gridTemplateColumns: '1fr 80px 100px 90px' }}>
              <span>Name</span>
              <span>Status</span>
              <span>Next Date</span>
              <span className="text-right">Amount</span>
            </div>

            {paidExpenses.map((item, idx) => (
              <div key={item.id}>
                <div className="grid gap-2 py-[0.625rem] items-center text-[0.8125rem] opacity-80" style={{ gridTemplateColumns: '1fr 80px 100px 90px' }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <Check size={14} className="text-[var(--color-success)] font-bold flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="font-medium text-[var(--color-text-muted)] line-through whitespace-nowrap overflow-hidden text-ellipsis">
                        {item.name}
                      </div>
                    </div>
                  </div>
                  <StatusBadge isPaid={true} daysUntil={0} />
                  <span className="text-[var(--color-text-muted)]" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                    {fmtDate(item.nextDate)}
                  </span>
                  <span className="text-right font-semibold text-[var(--color-text-muted)]" style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>
                    {fmtCurrency(item.amount)}
                  </span>
                </div>
                {idx < paidExpenses.length - 1 && (
                  <div className="h-px bg-[var(--color-border)]" />
                )}
              </div>
            ))}

            {/* Total row */}
            <div className="border-t border-[var(--color-border)] pt-[0.625rem] mt-1 flex justify-between text-sm">
              <span className="text-[var(--color-text-secondary)]">Completed total</span>
              <span className="font-semibold text-[var(--color-text)]">
                {fmtCurrency(expensesPaid)}
              </span>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

// ─── All Recurring View ───────────────────────────────────────────────────────

function AllRecurringView({
  data,
  isLoading,
  isError,
  onEdit,
  onDelete,
  onToggle,
}: {
  data?: RecurringItem[];
  isLoading: boolean;
  isError: boolean;
  onEdit: (item: RecurringItem) => void;
  onDelete: (item: RecurringItem) => void;
  onToggle: (item: RecurringItem) => void;
}) {
  if (isLoading) {
    return (
      <Card padding="lg">
        <div className="flex flex-col gap-3">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} height={44} width="100%" />)}
        </div>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card padding="lg">
        <p className="text-[var(--color-danger)] text-sm">Failed to load recurring items.</p>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card padding="lg">
        <div className="text-center py-10 px-4 text-[var(--color-text-muted)]">
          <div className="text-[2rem] mb-3">🔄</div>
          <p className="text-sm">No recurring items yet. Add your first one above.</p>
        </div>
      </Card>
    );
  }

  return (
    <Card padding="none">
      {/* ── Mobile card layout (below sm) ── */}
      <div className="flex flex-col divide-y divide-[var(--color-border)] sm:hidden">
        {data.map((item) => (
          <div key={item.id} className="flex flex-col gap-1.5 p-4">
            {/* Row 1: name + amount */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-base leading-none">{item.categoryIcon ?? '🔄'}</span>
                <span className="font-semibold text-[var(--color-text)] text-sm truncate">{item.name}</span>
              </div>
              <span
                className="font-bold text-sm shrink-0"
                style={{ color: item.amount < 0 ? 'var(--color-danger)' : 'var(--color-success)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}
              >
                {item.amount < 0 ? '-' : '+'}{fmtCurrency(item.amount)}
              </span>
            </div>
            {/* Row 2: frequency · next date */}
            <div className="text-xs text-[var(--color-text-muted)]">
              {frequencyLabel(item.frequency)} · Next: {fmtDate(item.nextDate)}
            </div>
            {/* Row 3: category badge + actions */}
            <div className="flex items-center justify-between gap-2 mt-0.5">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="inline-flex items-center py-0.5 px-2 rounded-[var(--radius-full)] text-[0.6875rem] font-semibold shrink-0"
                  style={{
                    backgroundColor: item.isActive ? 'var(--color-success-light)' : 'var(--color-border)',
                    color: item.isActive ? 'var(--color-success)' : 'var(--color-text-muted)',
                  }}
                >
                  {item.isActive ? 'Active' : 'Paused'}
                </span>
                {item.categoryName && (
                  <span className="text-xs text-[var(--color-text-muted)] truncate">{item.categoryName}</span>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => onToggle(item)}
                  title={item.isActive ? 'Pause' : 'Resume'}
                  className="bg-transparent border-none cursor-pointer text-[var(--color-text-muted)] p-1.5 rounded-[var(--radius-sm)] flex items-center hover:bg-[var(--color-surface-hover)]"
                >
                  {item.isActive ? <PauseCircle size={16} /> : <PlayCircle size={16} />}
                </button>
                <button
                  onClick={() => onEdit(item)}
                  title="Edit"
                  className="bg-transparent border-none cursor-pointer text-[var(--color-text-muted)] p-1.5 rounded-[var(--radius-sm)] flex items-center hover:bg-[var(--color-surface-hover)]"
                >
                  <Pencil size={16} />
                </button>
                <button
                  onClick={() => onDelete(item)}
                  title="Delete"
                  className="bg-transparent border-none cursor-pointer text-[var(--color-danger)] p-1.5 rounded-[var(--radius-sm)] flex items-center hover:bg-[var(--color-danger-light)]"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Desktop table layout (sm and above) ── */}
      <div className="hidden sm:block px-4 py-3">
        <div className="grid gap-2 pb-2 border-b border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-muted)]" style={{ gridTemplateColumns: '1fr 90px 100px 110px 140px 120px 80px 80px' }}>
          <span>Name</span>
          <span className="text-right">Amount</span>
          <span>Frequency</span>
          <span>Next Date</span>
          <span>Account</span>
          <span>Category</span>
          <span>Status</span>
          <span>Actions</span>
        </div>
        {data.map((item, idx) => (
          <div key={item.id}>
            <div className="grid gap-2 py-[0.625rem] items-center text-[0.8125rem]" style={{ gridTemplateColumns: '1fr 90px 100px 110px 140px 120px 80px 80px' }}>
              <div className="font-medium text-[var(--color-text)] whitespace-nowrap overflow-hidden text-ellipsis">
                {item.name}
              </div>
              <span className="text-right font-semibold" style={{ color: item.amount < 0 ? 'var(--color-danger)' : 'var(--color-success)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>
                {item.amount < 0 ? '-' : '+'}{fmtCurrency(item.amount)}
              </span>
              <span className="text-[var(--color-text-secondary)]">{frequencyLabel(item.frequency)}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-text-muted)' }}>{fmtDate(item.nextDate)}</span>
              <span className="text-[var(--color-text-secondary)] whitespace-nowrap overflow-hidden text-ellipsis">
                {accountLabel(item)}
              </span>
              <span className="text-[var(--color-text-secondary)] whitespace-nowrap overflow-hidden text-ellipsis">
                {item.categoryIcon ? `${item.categoryIcon} ` : ''}{item.categoryName}
              </span>
              <span
                className="inline-flex items-center py-0.5 px-2 rounded-[var(--radius-full)] text-[0.6875rem] font-semibold"
                style={{
                  backgroundColor: item.isActive ? 'var(--color-success-light)' : 'var(--color-border)',
                  color: item.isActive ? 'var(--color-success)' : 'var(--color-text-muted)',
                }}
              >
                {item.isActive ? 'Active' : 'Paused'}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onToggle(item)}
                  title={item.isActive ? 'Pause' : 'Resume'}
                  className="bg-transparent border-none cursor-pointer text-[var(--color-text-muted)] p-1 rounded-[var(--radius-sm)] flex items-center hover:bg-[var(--color-surface-hover)]"
                >
                  {item.isActive ? <PauseCircle size={14} /> : <PlayCircle size={14} />}
                </button>
                <button
                  onClick={() => onEdit(item)}
                  title="Edit"
                  className="bg-transparent border-none cursor-pointer text-[var(--color-text-muted)] p-1 rounded-[var(--radius-sm)] flex items-center hover:bg-[var(--color-surface-hover)]"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => onDelete(item)}
                  title="Delete"
                  className="bg-transparent border-none cursor-pointer text-[var(--color-danger)] p-1 rounded-[var(--radius-sm)] flex items-center hover:bg-[var(--color-danger-light)]"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            {idx < data.length - 1 && (
              <div className="h-px bg-[var(--color-border)]" />
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── Calendar View ────────────────────────────────────────────────────────────

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function buildCalendarGrid(year: number, month: number): Array<Date | null> {
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const startPad = firstDay.getDay(); // 0=Sun
  const endPad = 6 - lastDay.getDay();
  const cells: Array<Date | null> = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) cells.push(new Date(year, month - 1, d));
  for (let i = 0; i < endPad; i++) cells.push(null);
  return cells;
}

function CalendarView({
  allItems,
  isLoading,
}: {
  allItems?: RecurringItem[];
  isLoading: boolean;
}) {
  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth() + 1);

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const cells = buildCalendarGrid(calYear, calMonth);

  // Index items by their nextDate day (within the displayed month/year)
  const itemsByDay = new Map<number, RecurringItem[]>();
  if (allItems) {
    for (const item of allItems) {
      if (!item.isActive) continue;
      const d = new Date(item.nextDate);
      if (d.getFullYear() === calYear && d.getMonth() + 1 === calMonth) {
        const day = d.getDate();
        if (!itemsByDay.has(day)) itemsByDay.set(day, []);
        itemsByDay.get(day)!.push(item);
      }
    }
  }

  function chipStatus(item: RecurringItem): 'paid' | 'overdue' | 'upcoming' {
    if (item.isPaid) return 'paid';
    const d = new Date(item.nextDate);
    const itemDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return itemDay < today ? 'overdue' : 'upcoming';
  }

  const chipColors: Record<'paid' | 'overdue' | 'upcoming', { bg: string; text: string }> = {
    paid: { bg: 'var(--color-success-light)', text: 'var(--color-success)' },
    overdue: { bg: 'var(--color-danger-light)', text: 'var(--color-danger)' },
    upcoming: { bg: 'rgba(99,102,241,0.1)', text: 'var(--color-accent)' },
  };

  function prevMonth() {
    if (calMonth === 1) { setCalYear((y) => y - 1); setCalMonth(12); }
    else setCalMonth((m) => m - 1);
  }
  function nextMonth() {
    if (calMonth === 12) { setCalYear((y) => y + 1); setCalMonth(1); }
    else setCalMonth((m) => m + 1);
  }

  if (isLoading) {
    return (
      <Card padding="lg">
        <Skeleton height={400} width="100%" />
      </Card>
    );
  }

  return (
    <Card padding="lg">
      {/* Calendar header */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={prevMonth}
          className="w-7 h-7 flex items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] cursor-pointer text-[var(--color-text-secondary)] text-sm"
        >
          ‹
        </button>
        <span className="text-base font-bold text-[var(--color-text)]">
          {MONTH_NAMES_FULL[calMonth - 1]} {calYear}
        </span>
        <button
          onClick={nextMonth}
          className="w-7 h-7 flex items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] cursor-pointer text-[var(--color-text-secondary)] text-sm"
        >
          ›
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 gap-[2px] mb-[2px]">
        {DAY_NAMES.map((d) => (
          <div key={d} className="text-center text-[0.6875rem] font-semibold text-[var(--color-text-muted)] py-1 uppercase tracking-[0.04em]">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-[2px]">
        {cells.map((date, idx) => {
          if (!date) {
            return <div key={`pad-${idx}`} className="min-h-[80px] bg-[var(--color-surface-hover)] rounded-[var(--radius-sm)] opacity-40" />;
          }
          const day = date.getDate();
          const isToday = date.getTime() === today.getTime();
          const items = itemsByDay.get(day) ?? [];

          return (
            <div
              key={day}
              className="min-h-[80px] py-1 flex flex-col gap-[2px] rounded-[var(--radius-sm)]"
              style={{
                padding: '0.25rem 0.3125rem',
                backgroundColor: isToday ? 'rgba(99,102,241,0.07)' : 'var(--color-surface)',
                border: isToday ? '1.5px solid var(--color-accent)' : '1px solid var(--color-border)',
              }}
            >
              <span
                className="self-end leading-none"
                style={{
                  fontSize: '0.75rem',
                  fontWeight: isToday ? 700 : 500,
                  color: isToday ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                }}
              >
                {day}
              </span>
              {items.map((item) => {
                const status = chipStatus(item);
                const colors = chipColors[status];
                return (
                  <div
                    key={item.id}
                    title={`${item.name} — ${fmtCurrency(item.amount)}`}
                    className="text-[0.625rem] font-semibold whitespace-nowrap overflow-hidden text-ellipsis leading-[1.6]"
                    style={{
                      padding: '1px 4px',
                      borderRadius: 3,
                      backgroundColor: colors.bg,
                      color: colors.text,
                    }}
                  >
                    {item.categoryIcon ? `${item.categoryIcon} ` : ''}{item.name}
                    <span className="opacity-70"> {fmtCurrency(item.amount)}</span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex gap-4 mt-[0.875rem] flex-wrap">
        {(['upcoming', 'overdue', 'paid'] as const).map((s) => (
          <div key={s} className="flex items-center gap-1.5">
            <div className="w-[10px] h-[10px] rounded-[2px]" style={{ backgroundColor: chipColors[s].bg, border: `1px solid ${chipColors[s].text}` }} />
            <span className="text-xs text-[var(--color-text-secondary)] capitalize">{s}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── Detected Subscriptions Banner ───────────────────────────────────────────

interface DetectedSubscription {
  name: string;
  amount: number;
  frequency: Frequency;
  nextDate: string;
}

function DetectedSubscriptionsBanner({ onAdd }: { onAdd: (item: DetectedSubscription) => void }) {
  const [dismissed, setDismissed] = useState(false);

  const { data: detected = [] } = useQuery<DetectedSubscription[]>({
    queryKey: ['recurring-detect'],
    queryFn: () => api.post('/recurring/detect').then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });

  if (dismissed || detected.length === 0) return null;

  return (
    <div className="mb-4 p-4 rounded-[var(--radius-lg)] border border-[var(--color-accent)] bg-[var(--color-surface)]">
      <div className="flex items-start justify-between gap-3 mb-3">
        <p className="text-sm font-semibold text-[var(--color-text)] m-0">
          We detected {detected.length} potential subscription{detected.length > 1 ? 's' : ''}
        </p>
        <button
          onClick={() => setDismissed(true)}
          className="bg-transparent border-none cursor-pointer text-[var(--color-text-muted)] leading-none p-0 shrink-0"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
      <div className="flex flex-col gap-2">
        {detected.map((item) => {
          const key = `${item.name}${item.amount}`;
          return (
            <div key={key} className="flex items-center justify-between gap-3 py-1.5 px-3 rounded-[var(--radius-md)] bg-[var(--color-surface-hover)]">
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-medium text-[var(--color-text)] truncate">{item.name}</span>
                <span className="text-xs text-[var(--color-text-muted)]">
                  {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.abs(item.amount))} · {frequencyLabel(item.frequency)}
                </span>
              </div>
              <button
                onClick={() => onAdd(item)}
                className="shrink-0 py-1 px-3 rounded-[var(--radius-sm)] border-none cursor-pointer text-xs font-semibold bg-[var(--color-accent)] text-[var(--color-on-accent)]"
              >
                Add
              </button>
            </div>
          );
        })}
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="mt-3 bg-transparent border-none cursor-pointer text-xs text-[var(--color-text-muted)] underline p-0"
      >
        Dismiss
      </button>
    </div>
  );
}

// ─── Delete Confirm Modal ─────────────────────────────────────────────────────

function DeleteConfirmModal({
  open,
  onClose,
  item,
}: {
  open: boolean;
  onClose: () => void;
  item: RecurringItem | null;
}) {
  const qc = useQueryClient();
  const deleteMut = useMutation({
    mutationFn: () => api.delete(`/recurring/${item!.id}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recurring-monthly'] });
      qc.invalidateQueries({ queryKey: ['recurring-all'] });
      notify.success('Recurring item deleted');
      onClose();
    },
    onError: () => notify.error('Failed to delete recurring item'),
  });

  return (
    <Modal open={open} onClose={onClose} title="Delete Recurring Item" size="sm">
      <p className="text-sm text-[var(--color-text-secondary)]">
        Delete <strong>{item?.name}</strong>? This cannot be undone.
      </p>
      <ModalFooter>
        <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
        <Button variant="danger" loading={deleteMut.isPending} onClick={() => deleteMut.mutate()}>Delete</Button>
      </ModalFooter>
    </Modal>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RecurringPage() {
  const [view, setView] = useState<ViewMode>('monthly');
  const [year] = useState(new Date().getFullYear());
  const [month] = useState(new Date().getMonth() + 1);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringItem | null>(null);
  const [modalPrefill, setModalPrefill] = useState<Partial<RecurringFormValues> | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<RecurringItem | null>(null);

  const qc = useQueryClient();

  const { data: summary, isLoading: summaryLoading, isError: summaryError } =
    useQuery<MonthlySummary>({
      queryKey: ['recurring-monthly', year, month],
      queryFn: () => api.get(`/recurring/monthly-summary?year=${year}&month=${month}`).then((r) => r.data),
    });

  const { data: allRecurring, isLoading: allLoading, isError: allError } =
    useQuery<RecurringItem[]>({
      queryKey: ['recurring-all'],
      queryFn: () => api.get('/recurring').then((r) => r.data),
    });

  const { data: accounts = [] } = useQuery<AccountOption[]>({
    queryKey: ['accounts-options'],
    queryFn: () => api.get('/accounts').then((r) => {
      const accountsData: AccountsApiResponse = r.data;
      return (accountsData?.groups?.flatMap((g) => g.accounts) ?? []).map((a) => ({
        id: a.id,
        name: a.name,
        lastFour: a.lastFour,
      }));
    }),
  });

  const { data: categories = [] } = useQuery<CategoryOption[]>({
    queryKey: ['categories-options'],
    queryFn: () => api.get('/categories').then((r) =>
      (Array.isArray(r.data) ? r.data : []).map((category: CategoryResponse) => ({
        id: category.id,
        name: category.name,
        icon: category.icon ?? undefined,
      }))
    ),
  });

  const toggleMut = useMutation({
    mutationFn: (item: RecurringItem) =>
      api.put(`/recurring/${item.id}`, { isActive: !item.isActive }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recurring-monthly'] });
      qc.invalidateQueries({ queryKey: ['recurring-all'] });
    },
    onError: () => notify.error('Failed to update status'),
  });

  function openAdd() {
    setEditing(null);
    setModalPrefill(undefined);
    setModalOpen(true);
  }

  function openAddDetected(item: DetectedSubscription) {
    setEditing(null);
    setModalPrefill({
      name: item.name,
      amount: String(item.amount),
      frequency: normalizeFrequency(item.frequency),
      nextDate: item.nextDate ? item.nextDate.slice(0, 10) : '',
    });
    setModalOpen(true);
  }

  function openEdit(item: RecurringItem) {
    setEditing(item);
    setModalOpen(true);
  }

  function openDelete(item: RecurringItem) {
    setDeleteTarget(item);
  }

  return (
    <div className="py-6">
      {/* Page header */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <h1 className="text-2xl font-bold text-[var(--color-text)] m-0 shrink-0">
          Recurring
        </h1>

        {/* View toggle */}
        <div className="flex bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] overflow-hidden shrink-0">
          {(['monthly', 'all', 'calendar'] as ViewMode[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className="py-1.5 px-[0.875rem] border-none cursor-pointer text-[0.8125rem] font-medium transition-[background] duration-[0.15s]"
              style={{
                backgroundColor: view === v ? 'var(--color-accent)' : 'transparent',
                color: view === v ? '#fff' : 'var(--color-text-secondary)',
              }}
            >
              {v === 'monthly' ? 'Monthly' : v === 'all' ? 'All recurring' : 'Calendar'}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        <Button variant="secondary" size="sm" icon={<Settings size={14} />}>
          Manage recurring
        </Button>
        <Button size="sm" icon={<Plus size={14} />} onClick={openAdd}>
          Add recurring
        </Button>
      </div>

      <DetectedSubscriptionsBanner onAdd={openAddDetected} />

      {/* Content */}
      {view === 'monthly' ? (
        <MonthlyView
          data={summary}
          isLoading={summaryLoading}
          isError={summaryError}
          onAddIncome={openAdd}
        />
      ) : view === 'calendar' ? (
        <CalendarView
          allItems={allRecurring}
          isLoading={allLoading}
        />
      ) : (
        <AllRecurringView
          data={allRecurring}
          isLoading={allLoading}
          isError={allError}
          onEdit={openEdit}
          onDelete={openDelete}
          onToggle={(item) => toggleMut.mutate(item)}
        />
      )}

      {/* Add/Edit modal */}
      <RecurringModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editing}
        prefill={modalPrefill}
        accounts={accounts}
        categories={categories}
      />

      {/* Delete confirm modal */}
      <DeleteConfirmModal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        item={deleteTarget}
      />
    </div>
  );
}
