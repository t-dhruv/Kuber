import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Settings, MoreHorizontal, Pencil, Trash2, PauseCircle, PlayCircle } from 'lucide-react';
import { api } from '@/lib/api';
import {
  Card, Button, Input, Select, Modal, ModalFooter, Skeleton, Toggle,
} from '@/components/ui';
import { notify } from '@/components/ui';

// ─── Types ────────────────────────────────────────────────────────────────────

type Frequency = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY';
type ViewMode = 'monthly' | 'all';

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

interface MonthlySummary {
  incomeTotal: number;
  expensesPaid: number;
  expensesRemaining: number;
  expensesTotal: number;
  upcoming: RecurringItem[];
  completed: RecurringItem[];
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

const FREQUENCY_OPTIONS = [
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'BIWEEKLY', label: 'Bi-weekly' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'QUARTERLY', label: 'Quarterly' },
  { value: 'ANNUALLY', label: 'Annually' },
];

const FREQUENCY_LABELS: Record<Frequency, string> = {
  WEEKLY: 'Weekly',
  BIWEEKLY: 'Bi-weekly',
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  ANNUALLY: 'Annually',
};

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

function accountLabel(item: RecurringItem): string {
  return item.accountLastFour
    ? `${item.accountName} ••${item.accountLastFour}`
    : item.accountName;
}

// ─── Overflow Menu ────────────────────────────────────────────────────────────

function OverflowMenu({
  onEdit,
  onToggle,
  onDelete,
  isActive,
}: {
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  isActive: boolean;
}) {
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

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem 0.375rem',
          borderRadius: 'var(--radius-sm)', color: 'var(--color-text-muted)',
          display: 'flex', alignItems: 'center',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        aria-label="More options"
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: '100%', marginTop: '0.25rem',
          backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)',
          minWidth: 140, zIndex: 50,
        }}>
          {[
            { label: 'Edit', icon: <Pencil size={13} />, action: onEdit },
            {
              label: isActive ? 'Pause' : 'Resume',
              icon: isActive ? <PauseCircle size={13} /> : <PlayCircle size={13} />,
              action: onToggle,
            },
            { label: 'Delete', icon: <Trash2 size={13} />, action: onDelete, danger: true },
          ].map((item) => (
            <button
              key={item.label}
              onClick={() => { item.action(); setOpen(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                width: '100%', padding: '0.5rem 0.75rem', background: 'none', border: 'none',
                cursor: 'pointer', fontSize: '0.8125rem',
                color: (item as any).danger ? 'var(--color-danger)' : 'var(--color-text)',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Add/Edit Modal ───────────────────────────────────────────────────────────

function RecurringModal({
  open,
  onClose,
  editing,
  accounts,
  categories,
}: {
  open: boolean;
  onClose: () => void;
  editing: RecurringItem | null;
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
        frequency: editing.frequency,
        nextDate: editing.nextDate ? editing.nextDate.slice(0, 10) : '',
        accountId: editing.accountId,
        categoryId: editing.categoryId,
        isActive: editing.isActive,
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [editing, open]);

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

  const categoryOptions = categories.map((c) => ({
    value: c.id,
    label: c.icon ? `${c.icon} ${c.name}` : c.name,
  }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit Recurring' : 'Add Recurring'}
      size="md"
    >
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
          {categoryOptions.length > 0 && (
            <Select
              label="Category"
              options={categoryOptions}
              placeholder="Select category"
              value={form.categoryId}
              onChange={(e) => set('categoryId', e.target.value)}
            />
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text)' }}>Active</span>
            <Toggle
              checked={form.isActive}
              onChange={(e) => set('isActive', e.target.checked)}
            />
          </div>
        </div>
        <ModalFooter>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
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
  onEdit,
  onDelete,
  onToggle,
  onAddIncome,
}: {
  data?: MonthlySummary;
  isLoading: boolean;
  isError: boolean;
  onEdit: (item: RecurringItem) => void;
  onDelete: (item: RecurringItem) => void;
  onToggle: (item: RecurringItem) => void;
  onAddIncome: () => void;
}) {
  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <Skeleton height={80} width="100%" />
        <Skeleton height={200} width="100%" />
        <Skeleton height={160} width="100%" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Card padding="lg">
        <p style={{ color: 'var(--color-danger)', fontSize: '0.875rem' }}>Failed to load monthly summary.</p>
      </Card>
    );
  }

  const expensePct = data.expensesTotal > 0
    ? Math.min(data.expensesPaid / data.expensesTotal, 1) * 100
    : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Summary bar */}
      <Card padding="lg">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          {/* Income row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-secondary)', width: 72 }}>Income</span>
              <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-success)' }}>
                {fmtCurrency(data.incomeTotal)}
              </span>
            </div>
            <Button size="sm" variant="outline" icon={<Plus size={12} />} onClick={onAddIncome}>
              Add income
            </Button>
          </div>

          {/* Expenses row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-secondary)', width: 72, flexShrink: 0 }}>Expenses</span>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ height: 8, backgroundColor: 'var(--color-border)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${expensePct}%`,
                  backgroundColor: 'var(--color-accent)', borderRadius: 'var(--radius-full)',
                  transition: 'width 0.4s ease',
                }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.25rem', fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                <span>{fmtCurrency(data.expensesPaid)} paid</span>
                <span>{fmtCurrency(data.expensesRemaining)} remaining</span>
              </div>
            </div>
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)', flexShrink: 0 }}>
              Total: {fmtCurrency(data.expensesTotal)}
            </span>
          </div>
        </div>
      </Card>

      {/* Upcoming */}
      <Card padding="lg">
        <div style={{ marginBottom: '0.75rem' }}>
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Upcoming
          </span>
        </div>

        {data.upcoming.length === 0 ? (
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', padding: '0.5rem 0' }}>
            No upcoming items this month.
          </p>
        ) : (
          <>
            {/* Header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 100px 140px 120px 90px 36px',
              gap: '0.5rem',
              padding: '0 0 0.5rem',
              borderBottom: '1px solid var(--color-border)',
              fontSize: '0.75rem',
              fontWeight: 600,
              color: 'var(--color-text-muted)',
            }}>
              <span>Name</span>
              <span>Date</span>
              <span>Account</span>
              <span>Category</span>
              <span style={{ textAlign: 'right' }}>Amount</span>
              <span />
            </div>

            {data.upcoming.map((item, idx) => (
              <div key={item.id}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 100px 140px 120px 90px 36px',
                  gap: '0.5rem',
                  padding: '0.625rem 0',
                  alignItems: 'center',
                  fontSize: '0.8125rem',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                    <span style={{ fontSize: '1rem' }}>{item.categoryIcon ?? '🔵'}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 500, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.name}
                      </div>
                      <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>
                        {FREQUENCY_LABELS[item.frequency]}
                      </div>
                    </div>
                  </div>
                  <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.75rem' }}>
                    {formatDaysUntil(item.daysUntilDue)}
                  </span>
                  <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.75rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {accountLabel(item)}
                  </span>
                  <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.75rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.categoryName}
                  </span>
                  <span style={{ textAlign: 'right', fontWeight: 600, color: item.amount < 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
                    {item.amount < 0 ? '-' : '+'}{fmtCurrency(item.amount)}
                  </span>
                  <OverflowMenu
                    isActive={item.isActive}
                    onEdit={() => onEdit(item)}
                    onToggle={() => onToggle(item)}
                    onDelete={() => onDelete(item)}
                  />
                </div>
                {idx < data.upcoming.length - 1 && (
                  <div style={{ height: 1, backgroundColor: 'var(--color-border)' }} />
                )}
              </div>
            ))}

            {/* Total row */}
            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '0.625rem', marginTop: '0.25rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
              <span style={{ color: 'var(--color-text-secondary)' }}>Upcoming total</span>
              <span style={{ fontWeight: 600, color: 'var(--color-text)' }}>
                {fmtCurrency(data.upcoming.reduce((sum, i) => sum + Math.abs(i.amount), 0))}
              </span>
            </div>
          </>
        )}
      </Card>

      {/* Completed */}
      <Card padding="lg">
        <div style={{ marginBottom: '0.75rem' }}>
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Completed ✓
          </span>
        </div>

        {data.completed.length === 0 ? (
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', padding: '0.5rem 0' }}>
            No completed items yet.
          </p>
        ) : (
          <>
            {/* Header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 100px 140px 120px 90px 36px',
              gap: '0.5rem',
              padding: '0 0 0.5rem',
              borderBottom: '1px solid var(--color-border)',
              fontSize: '0.75rem',
              fontWeight: 600,
              color: 'var(--color-text-muted)',
            }}>
              <span>Name</span>
              <span>Date</span>
              <span>Account</span>
              <span>Category</span>
              <span style={{ textAlign: 'right' }}>Amount</span>
              <span />
            </div>

            {data.completed.map((item, idx) => (
              <div key={item.id}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 100px 140px 120px 90px 36px',
                  gap: '0.5rem',
                  padding: '0.625rem 0',
                  alignItems: 'center',
                  fontSize: '0.8125rem',
                  opacity: 0.8,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                    <span style={{ color: 'var(--color-success)', fontSize: '0.875rem', fontWeight: 700 }}>✓</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 500, color: 'var(--color-text-muted)', textDecoration: 'line-through', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.name}
                      </div>
                      <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>
                        {FREQUENCY_LABELS[item.frequency]}
                      </div>
                    </div>
                  </div>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>
                    {item.paidDate ? fmtDate(item.paidDate) : '—'}
                  </span>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {accountLabel(item)}
                  </span>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.categoryName}
                  </span>
                  <span style={{ textAlign: 'right', fontWeight: 600, color: 'var(--color-text-muted)' }}>
                    {fmtCurrency(item.amount)}
                  </span>
                  <OverflowMenu
                    isActive={item.isActive}
                    onEdit={() => {}}
                    onToggle={() => {}}
                    onDelete={() => {}}
                  />
                </div>
                {idx < data.completed.length - 1 && (
                  <div style={{ height: 1, backgroundColor: 'var(--color-border)' }} />
                )}
              </div>
            ))}

            {/* Total row */}
            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '0.625rem', marginTop: '0.25rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
              <span style={{ color: 'var(--color-text-secondary)' }}>Completed total</span>
              <span style={{ fontWeight: 600, color: 'var(--color-text)' }}>
                {fmtCurrency(data.completed.reduce((sum, i) => sum + Math.abs(i.amount), 0))}
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} height={44} width="100%" />)}
        </div>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card padding="lg">
        <p style={{ color: 'var(--color-danger)', fontSize: '0.875rem' }}>Failed to load recurring items.</p>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card padding="lg">
        <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--color-text-muted)' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🔄</div>
          <p style={{ fontSize: '0.875rem' }}>No recurring items yet. Add your first one above.</p>
        </div>
      </Card>
    );
  }

  return (
    <Card padding="lg">
      {/* Table header */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 90px 100px 110px 140px 120px 80px 80px',
        gap: '0.5rem',
        paddingBottom: '0.5rem',
        borderBottom: '1px solid var(--color-border)',
        fontSize: '0.75rem',
        fontWeight: 600,
        color: 'var(--color-text-muted)',
      }}>
        <span>Name</span>
        <span style={{ textAlign: 'right' }}>Amount</span>
        <span>Frequency</span>
        <span>Next Date</span>
        <span>Account</span>
        <span>Category</span>
        <span>Status</span>
        <span>Actions</span>
      </div>

      {data.map((item, idx) => (
        <div key={item.id}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 90px 100px 110px 140px 120px 80px 80px',
            gap: '0.5rem',
            padding: '0.625rem 0',
            alignItems: 'center',
            fontSize: '0.8125rem',
          }}>
            <div style={{ fontWeight: 500, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {item.name}
            </div>
            <span style={{ textAlign: 'right', fontWeight: 600, color: item.amount < 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
              {item.amount < 0 ? '-' : '+'}{fmtCurrency(item.amount)}
            </span>
            <span style={{ color: 'var(--color-text-secondary)' }}>{FREQUENCY_LABELS[item.frequency]}</span>
            <span style={{ color: 'var(--color-text-secondary)' }}>{fmtDate(item.nextDate)}</span>
            <span style={{ color: 'var(--color-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {accountLabel(item)}
            </span>
            <span style={{ color: 'var(--color-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {item.categoryIcon ? `${item.categoryIcon} ` : ''}{item.categoryName}
            </span>
            <span style={{
              display: 'inline-flex', alignItems: 'center',
              padding: '0.125rem 0.5rem', borderRadius: 'var(--radius-full)',
              fontSize: '0.6875rem', fontWeight: 600,
              backgroundColor: item.isActive ? 'var(--color-success-light)' : 'var(--color-border)',
              color: item.isActive ? 'var(--color-success)' : 'var(--color-text-muted)',
            }}>
              {item.isActive ? 'Active' : 'Paused'}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <button
                onClick={() => onToggle(item)}
                title={item.isActive ? 'Pause' : 'Resume'}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: '0.25rem', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center' }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                {item.isActive ? <PauseCircle size={14} /> : <PlayCircle size={14} />}
              </button>
              <button
                onClick={() => onEdit(item)}
                title="Edit"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: '0.25rem', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center' }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <Pencil size={14} />
              </button>
              <button
                onClick={() => onDelete(item)}
                title="Delete"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-danger)', padding: '0.25rem', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center' }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-danger-light)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
          {idx < data.length - 1 && (
            <div style={{ height: 1, backgroundColor: 'var(--color-border)' }} />
          )}
        </div>
      ))}
    </Card>
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
      <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
        Delete <strong>{item?.name}</strong>? This cannot be undone.
      </p>
      <ModalFooter>
        <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
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
    queryFn: () => api.get('/accounts').then((r) =>
      (r.data.accounts ?? r.data ?? []).map((a: any) => ({
        id: a.id,
        name: a.name,
        lastFour: a.lastFour,
      }))
    ),
  });

  const { data: categories = [] } = useQuery<CategoryOption[]>({
    queryKey: ['categories-options'],
    queryFn: () => api.get('/categories').then((r) =>
      (r.data.categories ?? r.data ?? []).map((c: any) => ({
        id: c.id,
        name: c.name,
        icon: c.icon,
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
    <div style={{ padding: '1.5rem 0' }}>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-text)', margin: 0, flex: '0 0 auto' }}>
          Recurring
        </h1>

        {/* View toggle */}
        <div style={{
          display: 'flex', background: 'var(--color-surface)', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)', overflow: 'hidden', flex: '0 0 auto',
        }}>
          {(['monthly', 'all'] as ViewMode[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: '0.375rem 0.875rem', border: 'none', cursor: 'pointer',
                fontSize: '0.8125rem', fontWeight: 500,
                backgroundColor: view === v ? 'var(--color-accent)' : 'transparent',
                color: view === v ? '#fff' : 'var(--color-text-secondary)',
                transition: 'background 0.15s',
              }}
            >
              {v === 'monthly' ? 'Monthly' : 'All recurring'}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        <Button variant="secondary" size="sm" icon={<Settings size={14} />}>
          Manage recurring
        </Button>
        <Button size="sm" icon={<Plus size={14} />} onClick={openAdd}>
          Add recurring
        </Button>
      </div>

      {/* Content */}
      {view === 'monthly' ? (
        <MonthlyView
          data={summary}
          isLoading={summaryLoading}
          isError={summaryError}
          onEdit={openEdit}
          onDelete={openDelete}
          onToggle={(item) => toggleMut.mutate(item)}
          onAddIncome={openAdd}
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
