import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, MoreHorizontal, Pencil, Trash2, MessageSquare, Wallet, CreditCard, TrendingDown, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '@/lib/api';
import {
  Card, Button, Input, Modal, ModalFooter, Skeleton, Select,
} from '@/components/ui';
import { notify } from '@/components/ui';

// ─── Types ────────────────────────────────────────────────────────────────────

type GoalStatus = 'on_track' | 'at_risk' | 'completed';
type GoalType = 'savings' | 'vacation' | 'home' | 'wedding' | 'education' | 'car' | 'other' | 'debt';
type SubTab = 'save_up' | 'pay_down';

interface LinkedAccount {
  id: string;
  name: string;
  balance: number;
  type: string;
  institution?: string | null;
}

interface Goal {
  id: string;
  name: string;
  type: GoalType;
  currentAmount: number;
  targetAmount: number;
  targetDate?: string;
  monthlyContribution?: number;
  status: GoalStatus;
  imageUrl?: string;
  accountId?: string | null;
  linkedAccount?: LinkedAccount | null;
}

interface DebtAccount {
  id: string;
  name: string;
  type: string;
  balance: number;
  institution?: string | null;
}

interface GoalFormValues {
  name: string;
  type: GoalType;
  targetAmount: string;
  targetDate: string;
  currentAmount: string;
  monthlyContribution: string;
}

interface DebtGoalFormValues {
  name: string;
  targetAmount: string;
  accountId: string;
  monthlyContribution: string;
  targetDate: string;
}

const EMPTY_GOAL_FORM: GoalFormValues = {
  name: '',
  type: 'savings',
  targetAmount: '',
  targetDate: '',
  currentAmount: '0',
  monthlyContribution: '',
};

const EMPTY_DEBT_FORM: DebtGoalFormValues = {
  name: '',
  targetAmount: '',
  accountId: '',
  monthlyContribution: '',
  targetDate: '',
};

interface ContributeFormValues {
  amount: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const GOAL_TYPES: { value: GoalType; label: string; emoji: string }[] = [
  { value: 'savings', label: 'Savings', emoji: '💰' },
  { value: 'vacation', label: 'Vacation', emoji: '🏖' },
  { value: 'home', label: 'Home Down Payment', emoji: '🏠' },
  { value: 'wedding', label: 'Wedding', emoji: '💍' },
  { value: 'education', label: 'Education', emoji: '📚' },
  { value: 'car', label: 'Car', emoji: '🚗' },
  { value: 'other', label: 'Other', emoji: '🎯' },
];

const GOAL_GRADIENTS: Record<GoalType, string> = {
  savings: 'linear-gradient(135deg, #2f9e44 0%, #0c8599 100%)',
  vacation: 'linear-gradient(135deg, #1971c2 0%, #0c8599 100%)',
  home: 'linear-gradient(135deg, #E5622A 0%, #e67700 100%)',
  wedding: 'linear-gradient(135deg, #9c36b5 0%, #E5622A 100%)',
  education: 'linear-gradient(135deg, #1971c2 0%, #9c36b5 100%)',
  car: 'linear-gradient(135deg, #0c8599 0%, #2f9e44 100%)',
  other: 'linear-gradient(135deg, #e67700 0%, #E5622A 100%)',
  debt: 'linear-gradient(135deg, #c92a2a 0%, #e67700 100%)',
};

// ─── Formatters ───────────────────────────────────────────────────────────────

const fmtCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

const fmtDate = (date: string) =>
  new Date(date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

function goalStatusStyle(status: GoalStatus): { bg: string; color: string; label: string } {
  switch (status) {
    case 'on_track':
      return { bg: 'var(--color-success-light)', color: 'var(--color-success)', label: 'On Track' };
    case 'at_risk':
      return { bg: 'var(--color-warning-light)', color: 'var(--color-warning)', label: 'At Risk' };
    case 'completed':
      return { bg: 'var(--color-border)', color: 'var(--color-text-secondary)', label: 'Completed ✓' };
  }
}

// ─── Goal Card Overflow Menu ──────────────────────────────────────────────────

function GoalOverflowMenu({
  onEdit,
  onDelete,
}: {
  onEdit: () => void;
  onDelete: () => void;
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
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center bg-black/35 border-none cursor-pointer py-1 px-1.5 rounded-[var(--radius-sm)] text-white"
        aria-label="Goal options"
      >
        <MoreHorizontal size={14} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-[var(--shadow-md)] min-w-[120px] z-50">
          {[
            { label: 'Edit', icon: <Pencil size={13} />, action: onEdit, danger: false },
            { label: 'Delete', icon: <Trash2 size={13} />, action: onDelete, danger: true },
          ].map((item) => (
            <button
              key={item.label}
              onClick={() => { item.action(); setOpen(false); }}
              className={`flex items-center gap-2 w-full px-3 py-2 bg-transparent border-none cursor-pointer text-[0.8125rem] text-left hover:bg-[var(--color-surface-hover)] ${item.danger ? 'text-[var(--color-danger)]' : 'text-[var(--color-text)]'}`}
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

// ─── Goal Card ────────────────────────────────────────────────────────────────

function GoalCard({
  goal,
  onEdit,
  onDelete,
  onContribute,
}: {
  goal: Goal;
  onEdit: () => void;
  onDelete: () => void;
  onContribute: () => void;
}) {
  const pct = goal.targetAmount > 0 ? Math.min(goal.currentAmount / goal.targetAmount, 1) : 0;
  const statusStyle = goalStatusStyle(goal.status);
  const gradient = GOAL_GRADIENTS[goal.type] ?? GOAL_GRADIENTS.other;
  const typeInfo = GOAL_TYPES.find((t) => t.value === goal.type) ?? GOAL_TYPES[6];

  return (
    <div className="bg-[var(--color-surface)] rounded-[var(--radius-xl)] border border-[var(--color-border)] shadow-[var(--shadow-sm)] overflow-hidden">
      {/* Card image / gradient header */}
      <div
        className="h-20 relative flex items-start justify-end p-2"
        style={{ background: goal.imageUrl ? `url(${goal.imageUrl}) center/cover` : gradient }}
      >
        <GoalOverflowMenu onEdit={onEdit} onDelete={onDelete} />
      </div>

      {/* Card body */}
      <div className="p-4">
        {/* Name + status */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-base">{typeInfo.emoji}</span>
              <span className="text-[0.9375rem] font-semibold text-[var(--color-text)]">{goal.name}</span>
            </div>
          </div>
          <span
            className="shrink-0 text-[0.6875rem] font-semibold py-0.5 px-2 rounded-[var(--radius-full)]"
            style={{ backgroundColor: statusStyle.bg, color: statusStyle.color }}
          >
            {statusStyle.label}
          </span>
        </div>

        {/* Progress bar */}
        <div className="mb-2">
          <div className="flex justify-between mb-1.5 text-xs text-[var(--color-text-secondary)]">
            <span>{Math.round(pct * 100)}%</span>
          </div>
          <div className="h-2 bg-[var(--color-border)] rounded-[var(--radius-full)] overflow-hidden">
            <div
              className="h-full bg-[var(--color-accent)] rounded-[var(--radius-full)] transition-[width] duration-[400ms] ease-in-out"
              style={{ width: `${pct * 100}%` }}
            />
          </div>
        </div>

        {/* Amounts */}
        <div className="text-sm text-[var(--color-text-secondary)] mb-1.5">
          <span className="font-semibold text-[var(--color-text)]">{fmtCurrency(goal.currentAmount)}</span>
          {' / '}
          {fmtCurrency(goal.targetAmount)}
        </div>

        {/* Target date + monthly */}
        <div className="flex flex-col gap-0.5 mb-3.5 text-xs text-[var(--color-text-muted)]">
          {goal.targetDate && (
            <span>Target: {fmtDate(goal.targetDate)}</span>
          )}
          {goal.monthlyContribution != null && goal.monthlyContribution > 0 && (
            <span>Monthly: {fmtCurrency(goal.monthlyContribution)}/mo</span>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          {goal.status !== 'completed' && (
            <Button size="sm" variant="outline" icon={<Plus size={12} />} onClick={onContribute} className="flex-1">
              Add funds
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Debt Goal Card ───────────────────────────────────────────────────────────

function DebtGoalCard({
  goal,
  onEdit,
  onDelete,
  onPayment,
}: {
  goal: Goal;
  onEdit: () => void;
  onDelete: () => void;
  onPayment: () => void;
}) {
  const pct = goal.targetAmount > 0 ? Math.min(goal.currentAmount / goal.targetAmount, 1) : 0;
  const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);
  const statusStyle = goalStatusStyle(goal.status);

  return (
    <div className="bg-[var(--color-surface)] rounded-[var(--radius-xl)] border border-[var(--color-border)] shadow-[var(--shadow-sm)] overflow-hidden">
      {/* Gradient header */}
      <div
        className="h-20 flex items-center justify-between px-3 py-2"
        style={{ background: GOAL_GRADIENTS.debt }}
      >
        <span className="text-[1.75rem]">💳</span>
        <GoalOverflowMenu onEdit={onEdit} onDelete={onDelete} />
      </div>

      {/* Card body */}
      <div className="p-4">
        {/* Name + status */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <span className="text-[0.9375rem] font-semibold text-[var(--color-text)]">{goal.name}</span>
          <span
            className="shrink-0 text-[0.6875rem] font-semibold py-0.5 px-2 rounded-[var(--radius-full)]"
            style={{ backgroundColor: statusStyle.bg, color: statusStyle.color }}
          >
            {statusStyle.label}
          </span>
        </div>

        {/* Debt amounts row */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="text-center">
            <div className="text-[0.6875rem] text-[var(--color-text-muted)] mb-0.5">Original</div>
            <div className="text-[0.8125rem] font-semibold text-[var(--color-text)]">{fmtCurrency(goal.targetAmount)}</div>
          </div>
          <div className="text-center">
            <div className="text-[0.6875rem] text-[var(--color-text-muted)] mb-0.5">Paid Off</div>
            <div className="text-[0.8125rem] font-semibold text-[var(--color-success)]">{fmtCurrency(goal.currentAmount)}</div>
          </div>
          <div className="text-center">
            <div className="text-[0.6875rem] text-[var(--color-text-muted)] mb-0.5">Remaining</div>
            <div className="text-[0.8125rem] font-semibold text-[var(--color-danger)]">{fmtCurrency(remaining)}</div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-2.5">
          <div className="flex justify-between mb-1 text-xs text-[var(--color-text-secondary)]">
            <span>{Math.round(pct * 100)}% paid off</span>
          </div>
          <div className="h-2 bg-[var(--color-border)] rounded-[var(--radius-full)] overflow-hidden">
            <div
              className="h-full rounded-[var(--radius-full)] transition-[width] duration-[400ms] ease-in-out"
              style={{ width: `${pct * 100}%`, background: 'linear-gradient(90deg, #c92a2a, #e67700)' }}
            />
          </div>
        </div>

        {/* Linked account */}
        {goal.linkedAccount && (
          <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)] bg-[var(--color-surface-hover)] rounded-[var(--radius-sm)] px-2 py-1 mb-2.5">
            <CreditCard size={11} />
            <span>{goal.linkedAccount.name}</span>
            <span className="ml-auto text-[var(--color-danger)] font-medium">
              {fmtCurrency(goal.linkedAccount.balance)}
            </span>
          </div>
        )}

        {/* Meta */}
        <div className="flex flex-col gap-0.5 mb-3.5 text-xs text-[var(--color-text-muted)]">
          {goal.targetDate && <span>Target payoff: {fmtDate(goal.targetDate)}</span>}
          {goal.monthlyContribution != null && goal.monthlyContribution > 0 && (
            <span>Monthly payment: {fmtCurrency(goal.monthlyContribution)}/mo</span>
          )}
        </div>

        {/* Actions */}
        {goal.status !== 'completed' && (
          <Button size="sm" variant="outline" icon={<CreditCard size={12} />} onClick={onPayment} className="w-full">
            Make Payment
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Pay Down Summary Strip ───────────────────────────────────────────────────

function PayDownSummary({ goals }: { goals: Goal[] }) {
  const totalDebt = goals.reduce((s, g) => s + Math.max(0, g.targetAmount - g.currentAmount), 0);
  const totalMonthly = goals.reduce((s, g) => s + (g.monthlyContribution ?? 0), 0);

  let debtFreeLabel = '—';
  if (totalMonthly > 0 && totalDebt > 0) {
    const monthsToFree = Math.ceil(totalDebt / totalMonthly);
    const freeDate = new Date();
    freeDate.setMonth(freeDate.getMonth() + monthsToFree);
    debtFreeLabel = freeDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  } else if (totalDebt === 0) {
    debtFreeLabel = 'Debt free!';
  }

  return (
    <div className="flex mb-5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-lg)] overflow-hidden">
      {[
        { label: 'Total Debt', value: fmtCurrency(totalDebt), color: 'var(--color-danger)' },
        { label: 'Monthly Payments', value: totalMonthly > 0 ? `${fmtCurrency(totalMonthly)}/mo` : '—', color: 'var(--color-text)' },
        { label: 'Debt-Free Date', value: `~${debtFreeLabel}`, color: 'var(--color-success)' },
      ].map((item, i) => (
        <div
          key={item.label}
          className={`flex-1 px-4 py-3.5 text-center${i > 0 ? ' border-l border-[var(--color-border)]' : ''}`}
        >
          <div className="text-[0.6875rem] text-[var(--color-text-muted)] mb-1 font-medium uppercase tracking-[0.05em]">
            {item.label}
          </div>
          <div className="text-base font-bold" style={{ color: item.color }}>
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function GoalsEmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <svg width="96" height="96" viewBox="0 0 96 96" fill="none" className="mb-6">
        <circle cx="48" cy="48" r="44" fill="var(--color-accent-light)" />
        <circle cx="48" cy="48" r="28" fill="none" stroke="var(--color-accent)" strokeWidth="3" strokeDasharray="6 4" />
        <circle cx="48" cy="48" r="16" fill="var(--color-accent)" opacity="0.2" />
        <circle cx="48" cy="48" r="8" fill="var(--color-accent)" />
        <path d="M48 8 L52 16 L60 16 L54 22 L56 30 L48 26 L40 30 L42 22 L36 16 L44 16 Z" fill="var(--color-accent)" opacity="0.6" />
      </svg>
      <h2 className="text-xl font-bold text-[var(--color-text)] mb-2">
        Plan for your future
      </h2>
      <p className="text-sm text-[var(--color-text-secondary)] max-w-[320px] mb-6">
        Set financial goals and track your progress toward what matters most.
      </p>
      <Button icon={<Plus size={14} />} onClick={onAdd}>
        Add goal
      </Button>
    </div>
  );
}

function DebtEmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div
        className="w-[72px] h-[72px] rounded-[var(--radius-full)] flex items-center justify-center text-[2rem] mb-5"
        style={{ background: GOAL_GRADIENTS.debt }}
      >
        💳
      </div>
      <h2 className="text-xl font-bold text-[var(--color-text)] mb-2">
        No debt goals yet
      </h2>
      <p className="text-sm text-[var(--color-text-secondary)] max-w-[340px] mb-6">
        Link a loan or credit card and track your payoff journey.
      </p>
      <Button icon={<Plus size={14} />} onClick={onAdd}>
        Add debt goal
      </Button>
    </div>
  );
}

// ─── Add Goal Modal (Save Up) ─────────────────────────────────────────────────

function AddGoalModal({
  open,
  onClose,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  editing: Goal | null;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<GoalFormValues>(EMPTY_GOAL_FORM);

  useEffect(() => {
    if (editing) {
      setForm({
        name: editing.name,
        type: editing.type as GoalType,
        targetAmount: String(editing.targetAmount),
        targetDate: editing.targetDate ? editing.targetDate.slice(0, 10) : '',
        currentAmount: String(editing.currentAmount),
        monthlyContribution: editing.monthlyContribution != null ? String(editing.monthlyContribution) : '',
      });
    } else {
      setForm(EMPTY_GOAL_FORM);
    }
  }, [editing, open]);

  function set(field: keyof GoalFormValues, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  const createMut = useMutation({
    mutationFn: (body: object) => api.post('/goals', body).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['goals'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      notify.success('Goal created');
      onClose();
    },
    onError: () => notify.error('Failed to create goal'),
  });

  const updateMut = useMutation({
    mutationFn: (body: object) => api.put(`/goals/${editing!.id}`, body).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['goals'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      notify.success('Goal updated');
      onClose();
    },
    onError: () => notify.error('Failed to update goal'),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body = {
      name: form.name.trim(),
      type: form.type,
      targetAmount: parseFloat(form.targetAmount),
      targetDate: form.targetDate || undefined,
      currentAmount: parseFloat(form.currentAmount) || 0,
      monthlyContribution: form.monthlyContribution ? parseFloat(form.monthlyContribution) : undefined,
    };
    if (editing) {
      updateMut.mutate(body);
    } else {
      createMut.mutate(body);
    }
  }

  const isPending = createMut.isPending || updateMut.isPending;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit Goal' : 'New Goal'}
      size="lg"
    >
      <form onSubmit={handleSubmit}>
        {/* Goal type selector */}
        {!editing && (
          <div className="mb-5">
            <p className="text-sm font-medium text-[var(--color-text)] mb-2.5">
              Goal type
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {GOAL_TYPES.map((gt) => (
                <button
                  key={gt.value}
                  type="button"
                  onClick={() => set('type', gt.value)}
                  className="flex flex-col items-center py-2.5 px-1.5 rounded-[var(--radius-md)] cursor-pointer gap-1 transition-all duration-150"
                  style={{
                    border: form.type === gt.value ? '2px solid var(--color-accent)' : '1px solid var(--color-border)',
                    backgroundColor: form.type === gt.value ? 'var(--color-accent-light)' : 'var(--color-surface)',
                  }}
                >
                  <span className="text-xl">{gt.emoji}</span>
                  <span
                    className="text-[0.6875rem] font-medium text-center leading-[1.3]"
                    style={{ color: form.type === gt.value ? 'var(--color-accent)' : 'var(--color-text-secondary)' }}
                  >
                    {gt.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-4">
          <Input
            label="Goal name"
            placeholder="e.g. Emergency Fund, Bali Trip..."
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            required
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Target amount"
              type="number"
              step="0.01"
              min="0"
              placeholder="10000"
              value={form.targetAmount}
              onChange={(e) => set('targetAmount', e.target.value)}
              required
            />
            <Input
              label="Target date"
              type="date"
              value={form.targetDate}
              onChange={(e) => set('targetDate', e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Starting amount"
              type="number"
              step="0.01"
              min="0"
              placeholder="0"
              value={form.currentAmount}
              onChange={(e) => set('currentAmount', e.target.value)}
            />
            <Input
              label="Monthly contribution"
              type="number"
              step="0.01"
              min="0"
              placeholder="150"
              value={form.monthlyContribution}
              onChange={(e) => set('monthlyContribution', e.target.value)}
            />
          </div>
        </div>

        <ModalFooter>
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={isPending}>{editing ? 'Save' : 'Create goal'}</Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

// ─── Add Debt Goal Modal ──────────────────────────────────────────────────────

function AddDebtGoalModal({
  open,
  onClose,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  editing: Goal | null;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<DebtGoalFormValues>(EMPTY_DEBT_FORM);

  const { data: debtAccounts } = useQuery<DebtAccount[]>({
    queryKey: ['goals', 'accounts-for-debt'],
    queryFn: () => api.get('/goals/accounts-for-debt').then((r) => r.data),
    enabled: open,
  });

  useEffect(() => {
    if (editing) {
      setForm({
        name: editing.name,
        targetAmount: String(editing.targetAmount),
        accountId: editing.accountId ?? '',
        monthlyContribution: editing.monthlyContribution != null ? String(editing.monthlyContribution) : '',
        targetDate: editing.targetDate ? editing.targetDate.slice(0, 10) : '',
      });
    } else {
      setForm(EMPTY_DEBT_FORM);
    }
  }, [editing, open]);

  function set(field: keyof DebtGoalFormValues, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  // When account is selected, auto-fill targetAmount from abs(balance) if not editing
  function handleAccountChange(accountId: string) {
    set('accountId', accountId);
    if (!editing && accountId && debtAccounts) {
      const acct = debtAccounts.find((a) => a.id === accountId);
      if (acct && !form.targetAmount) {
        set('targetAmount', String(Math.abs(acct.balance)));
      }
    }
  }

  const createMut = useMutation({
    mutationFn: (body: object) => api.post('/goals', body).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['goals'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      notify.success('Debt goal created');
      onClose();
    },
    onError: () => notify.error('Failed to create debt goal'),
  });

  const updateMut = useMutation({
    mutationFn: (body: object) => api.put(`/goals/${editing!.id}`, body).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['goals'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      notify.success('Debt goal updated');
      onClose();
    },
    onError: () => notify.error('Failed to update debt goal'),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body = {
      name: form.name.trim(),
      type: 'debt',
      targetAmount: parseFloat(form.targetAmount),
      accountId: form.accountId || undefined,
      monthlyContribution: form.monthlyContribution ? parseFloat(form.monthlyContribution) : undefined,
      targetDate: form.targetDate || undefined,
    };
    if (editing) {
      updateMut.mutate(body);
    } else {
      createMut.mutate(body);
    }
  }

  const isPending = createMut.isPending || updateMut.isPending;

  const accountOptions = debtAccounts?.map((a) => ({
    value: a.id,
    label: `${a.name}${a.institution ? ` (${a.institution})` : ''} — ${fmtCurrency(a.balance)}`,
  })) ?? [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit Debt Goal' : 'New Debt Goal'}
      size="lg"
    >
      <form onSubmit={handleSubmit}>
        <div className="flex flex-col gap-4">
          <Input
            label="Goal name"
            placeholder="e.g. Pay off Visa, Student Loan..."
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            required
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Total debt amount"
              type="number"
              step="0.01"
              min="0"
              placeholder="5000"
              value={form.targetAmount}
              onChange={(e) => set('targetAmount', e.target.value)}
              required
            />
            <Input
              label="Monthly payment"
              type="number"
              step="0.01"
              min="0"
              placeholder="200"
              value={form.monthlyContribution}
              onChange={(e) => set('monthlyContribution', e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm font-medium text-[var(--color-text)] block mb-1.5">
              Link account <span className="text-[var(--color-text-muted)] font-normal">(optional)</span>
            </label>
            {debtAccounts && debtAccounts.length > 0 ? (
              <Select
                value={form.accountId}
                onChange={(e) => handleAccountChange(e.target.value)}
                options={[
                  { value: '', label: 'No linked account' },
                  ...accountOptions,
                ]}
              />
            ) : (
              <p className="text-[0.8125rem] text-[var(--color-text-muted)] py-2">
                No credit card or loan accounts found. Add one in Accounts first.
              </p>
            )}
          </div>

          <Input
            label="Target payoff date"
            type="date"
            value={form.targetDate}
            onChange={(e) => set('targetDate', e.target.value)}
          />
        </div>

        <ModalFooter>
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={isPending}>{editing ? 'Save' : 'Create debt goal'}</Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

// ─── Contribute Modal ─────────────────────────────────────────────────────────

function ContributeModal({
  open,
  onClose,
  goal,
}: {
  open: boolean;
  onClose: () => void;
  goal: Goal | null;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<ContributeFormValues>({ amount: '' });

  useEffect(() => {
    if (open) setForm({ amount: '' });
  }, [open]);

  const contributeMut = useMutation({
    mutationFn: (body: object) =>
      api.post(`/goals/${goal!.id}/contribute`, body).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['goals'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      notify.success(goal?.type === 'debt' ? 'Payment recorded' : 'Funds added');
      onClose();
    },
    onError: () => notify.error('Failed to record payment'),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    contributeMut.mutate({ amount: parseFloat(form.amount) });
  }

  const isDebt = goal?.type === 'debt';
  const remaining = goal ? Math.max(goal.targetAmount - goal.currentAmount, 0) : 0;
  const pct = goal && goal.targetAmount > 0 ? Math.min(goal.currentAmount / goal.targetAmount, 1) : 0;

  return (
    <Modal open={open} onClose={onClose} title={isDebt ? 'Make Payment' : 'Add Funds'} size="sm">
      {goal && (
        <div className="mb-4">
          <p className="text-sm font-semibold text-[var(--color-text)] mb-2">
            {goal.name}
          </p>
          <div className="h-1.5 bg-[var(--color-border)] rounded-[var(--radius-full)] overflow-hidden mb-1.5">
            <div
              className="h-full rounded-[var(--radius-full)]"
              style={{
                width: `${pct * 100}%`,
                background: isDebt ? 'linear-gradient(90deg, #c92a2a, #e67700)' : 'var(--color-accent)',
              }}
            />
          </div>
          <div className="flex justify-between text-xs text-[var(--color-text-secondary)]">
            {isDebt ? (
              <>
                <span>{fmtCurrency(goal.currentAmount)} paid off</span>
                <span>{fmtCurrency(remaining)} remaining</span>
              </>
            ) : (
              <>
                <span>{fmtCurrency(goal.currentAmount)} saved</span>
                <span>{fmtCurrency(remaining)} to go</span>
              </>
            )}
          </div>
        </div>
      )}
      <form onSubmit={handleSubmit}>
        <Input
          label={isDebt ? 'Payment amount' : 'Amount to add'}
          type="number"
          step="0.01"
          min="0.01"
          placeholder={goal?.monthlyContribution ? String(goal.monthlyContribution) : '150.00'}
          value={form.amount}
          onChange={(e) => setForm({ amount: e.target.value })}
          required
        />
        <ModalFooter>
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={contributeMut.isPending}>
            {isDebt ? 'Record payment' : 'Add funds'}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

// ─── Delete Confirm Modal ─────────────────────────────────────────────────────

function DeleteGoalModal({
  open,
  onClose,
  goal,
}: {
  open: boolean;
  onClose: () => void;
  goal: Goal | null;
}) {
  const qc = useQueryClient();
  const deleteMut = useMutation({
    mutationFn: () => api.delete(`/goals/${goal!.id}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['goals'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      notify.success('Goal deleted');
      onClose();
    },
    onError: () => notify.error('Failed to delete goal'),
  });

  return (
    <Modal open={open} onClose={onClose} title="Delete Goal" size="sm">
      <p className="text-sm text-[var(--color-text-secondary)]">
        Delete <strong>{goal?.name}</strong>? This cannot be undone.
      </p>
      <ModalFooter>
        <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
        <Button variant="danger" loading={deleteMut.isPending} onClick={() => deleteMut.mutate()}>Delete</Button>
      </ModalFooter>
    </Modal>
  );
}

// ─── Pay Down Goals Panel ─────────────────────────────────────────────────────

function PayDownGoals({
  goals,
  isLoading,
  isError,
  onAdd,
  onEdit,
  onDelete,
  onPayment,
}: {
  goals: Goal[] | undefined;
  isLoading: boolean;
  isError: boolean;
  onAdd: () => void;
  onEdit: (goal: Goal) => void;
  onDelete: (goal: Goal) => void;
  onPayment: (goal: Goal) => void;
}) {
  const debtGoals = goals?.filter((g) => g.type === 'debt') ?? [];

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[1, 2].map((i) => (
          <Card key={i} padding="none">
            <Skeleton height={80} width="100%" style={{ borderRadius: '0' }} />
            <div className="p-4 flex flex-col gap-2.5">
              <Skeleton height={16} width="60%" />
              <Skeleton height={8} width="100%" />
              <Skeleton height={13} width="80%" />
              <Skeleton height={32} width="100%" />
            </div>
          </Card>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <Card padding="lg">
        <p className="text-[var(--color-danger)] text-sm">Failed to load debt goals.</p>
      </Card>
    );
  }

  if (debtGoals.length === 0) {
    return <DebtEmptyState onAdd={onAdd} />;
  }

  return (
    <>
      <PayDownSummary goals={debtGoals} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {debtGoals.map((goal) => (
          <DebtGoalCard
            key={goal.id}
            goal={goal}
            onEdit={() => onEdit(goal)}
            onDelete={() => onDelete(goal)}
            onPayment={() => onPayment(goal)}
          />
        ))}
      </div>
    </>
  );
}

// ─── Debt Payoff Panel ────────────────────────────────────────────────────────

interface PayoffEntry {
  id: string;
  name: string;
  months: number;
  totalInterest: number;
  payoffDate: string;
}

interface DebtPayoffData {
  totalMinMonthly: number;
  extraMonthly: number;
  avalanche: PayoffEntry[];
  snowball: PayoffEntry[];
  totalInterest: { avalanche: number; snowball: number };
}

function DebtPayoffPanel() {
  const [open, setOpen] = useState(false);
  const [extra, setExtra] = useState('0');

  const { data, isLoading, refetch } = useQuery<DebtPayoffData>({
    queryKey: ['debt-payoff', extra],
    queryFn: () =>
      api.get(`/liabilities/debt-payoff?extraMonthly=${parseFloat(extra) || 0}`).then((r) => r.data),
    enabled: open,
  });

  const fmtC = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

  const interestSaved = data
    ? Math.max(0, data.totalInterest.snowball - data.totalInterest.avalanche)
    : 0;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 w-full text-left px-4 py-3 rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] text-[var(--color-text-muted)] text-sm hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors"
      >
        <TrendingDown size={15} />
        <span>Show payoff strategy (avalanche vs snowball)</span>
        <ChevronDown size={14} className="ml-auto" />
      </button>
    );
  }

  return (
    <Card padding="none">
      <button
        onClick={() => setOpen(false)}
        className="flex items-center gap-2 w-full text-left px-4 py-3 border-b border-[var(--color-border)] bg-transparent"
      >
        <TrendingDown size={15} style={{ color: 'var(--color-danger)' }} />
        <span className="text-sm font-semibold text-[var(--color-text)]">Payoff Strategy</span>
        <ChevronUp size={14} className="ml-auto text-[var(--color-text-muted)]" />
      </button>

      <div className="p-4 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <label className="text-sm text-[var(--color-text-secondary)] whitespace-nowrap">Extra monthly payment</label>
          <input
            type="number"
            min="0"
            step="50"
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            onBlur={() => refetch()}
            className="w-28 px-2 py-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-input-bg)] text-sm text-[var(--color-text)] text-right"
          />
        </div>

        {isLoading && (
          <div className="flex flex-col gap-2">
            {[1, 2, 3].map((i) => <div key={i} className="h-10 bg-[var(--color-surface-hover)] rounded animate-pulse" />)}
          </div>
        )}

        {data && data.avalanche.length === 0 && (
          <p className="text-sm text-[var(--color-text-muted)]">No liabilities with an interest rate found. Add liabilities in the Net Worth section to use this tool.</p>
        )}

        {data && data.avalanche.length > 0 && (
          <>
            {interestSaved > 0 && (
              <div className="rounded-[var(--radius-md)] bg-[var(--color-success-light,#f0fdf4)] border border-[var(--color-success)] px-3 py-2 text-sm text-[var(--color-success)]">
                Avalanche saves <strong>{fmtC(interestSaved)}</strong> in interest vs snowball
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide">
                    <th className="text-left py-1.5 pr-3 font-semibold">Debt</th>
                    <th className="text-right py-1.5 px-2 font-semibold">Avalanche</th>
                    <th className="text-right py-1.5 px-2 font-semibold">Snowball</th>
                  </tr>
                </thead>
                <tbody>
                  {data.avalanche.map((av) => {
                    const sw = data.snowball.find((s) => s.id === av.id);
                    return (
                      <tr key={av.id} className="border-t border-[var(--color-border)]">
                        <td className="py-2 pr-3 text-[var(--color-text)] font-medium">{av.name}</td>
                        <td className="py-2 px-2 text-right">
                          <div className="text-[var(--color-text)]">{av.payoffDate}</div>
                          <div className="text-xs text-[var(--color-text-muted)]">{fmtC(av.totalInterest)} interest</div>
                        </td>
                        <td className="py-2 px-2 text-right">
                          <div className="text-[var(--color-text)]">{sw?.payoffDate ?? '—'}</div>
                          <div className="text-xs text-[var(--color-text-muted)]">{sw ? fmtC(sw.totalInterest) : '—'} interest</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[var(--color-border)]">
                    <td className="py-2 pr-3 text-xs font-semibold text-[var(--color-text-muted)] uppercase">Total interest</td>
                    <td className="py-2 px-2 text-right font-semibold text-[var(--color-danger)]">{fmtC(data.totalInterest.avalanche)}</td>
                    <td className="py-2 px-2 text-right font-semibold text-[var(--color-danger)]">{fmtC(data.totalInterest.snowball)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function GoalsPage() {
  const [subTab, setSubTab] = useState<SubTab>('save_up');
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addDebtModalOpen, setAddDebtModalOpen] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [editingDebt, setEditingDebt] = useState<Goal | null>(null);
  const [contributeTarget, setContributeTarget] = useState<Goal | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Goal | null>(null);

  const { data: goals, isLoading, isError } = useQuery<Goal[]>({
    queryKey: ['goals'],
    queryFn: () => api.get('/goals').then((r) => r.data),
  });

  function openAdd() {
    if (subTab === 'pay_down') {
      setEditingDebt(null);
      setAddDebtModalOpen(true);
    } else {
      setEditing(null);
      setAddModalOpen(true);
    }
  }

  function openEdit(goal: Goal) {
    if (goal.type === 'debt') {
      setEditingDebt(goal);
      setAddDebtModalOpen(true);
    } else {
      setEditing(goal);
      setAddModalOpen(true);
    }
  }

  const saveUpGoals = goals?.filter((g) => g.type !== 'debt') ?? [];

  return (
    <div className="py-6">
      {/* Page header */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <h1 className="text-2xl font-bold text-[var(--color-text)] m-0 shrink-0">
          Goals
        </h1>

        {/* Sub-tabs */}
        <div className="flex bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] overflow-hidden shrink-0">
          {([
            { value: 'save_up', label: 'Save up' },
            { value: 'pay_down', label: 'Pay down' },
          ] as { value: SubTab; label: string }[]).map((tab) => (
            <button
              key={tab.value}
              onClick={() => setSubTab(tab.value)}
              className="py-1.5 px-3.5 border-none cursor-pointer text-[0.8125rem] font-medium transition-[background] duration-150"
              style={{
                backgroundColor: subTab === tab.value ? 'var(--color-accent)' : 'transparent',
                color: subTab === tab.value ? '#fff' : 'var(--color-text-secondary)',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        <Button variant="secondary" size="sm" icon={<Wallet size={14} />}>
          Goal accounts
        </Button>
        <Button size="sm" icon={<Plus size={14} />} onClick={openAdd}>
          Add goal
        </Button>
      </div>

      {/* Content */}
      {subTab === 'pay_down' ? (
        <div className="flex flex-col gap-4">
          <PayDownGoals
            goals={goals}
            isLoading={isLoading}
            isError={isError}
            onAdd={openAdd}
            onEdit={openEdit}
            onDelete={setDeleteTarget}
            onPayment={setContributeTarget}
          />
          <DebtPayoffPanel />
        </div>
      ) : isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} padding="none">
              <Skeleton height={80} width="100%" style={{ borderRadius: '0' }} />
              <div className="p-4 flex flex-col gap-2.5">
                <Skeleton height={16} width="60%" />
                <Skeleton height={8} width="100%" />
                <Skeleton height={13} width="80%" />
                <Skeleton height={13} width="50%" />
                <Skeleton height={32} width="100%" />
              </div>
            </Card>
          ))}
        </div>
      ) : isError ? (
        <Card padding="lg">
          <p className="text-[var(--color-danger)] text-sm">Failed to load goals.</p>
        </Card>
      ) : !saveUpGoals.length ? (
        <GoalsEmptyState onAdd={openAdd} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {saveUpGoals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              onEdit={() => openEdit(goal)}
              onDelete={() => setDeleteTarget(goal)}
              onContribute={() => setContributeTarget(goal)}
            />
          ))}
        </div>
      )}

      {/* Save Up Add/Edit modal */}
      <AddGoalModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        editing={editing}
      />

      {/* Debt Add/Edit modal */}
      <AddDebtGoalModal
        open={addDebtModalOpen}
        onClose={() => setAddDebtModalOpen(false)}
        editing={editingDebt}
      />

      {/* Contribute / Make Payment modal */}
      <ContributeModal
        open={contributeTarget !== null}
        onClose={() => setContributeTarget(null)}
        goal={contributeTarget}
      />

      {/* Delete confirm modal */}
      <DeleteGoalModal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        goal={deleteTarget}
      />
    </div>
  );
}
