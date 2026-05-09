import { useState, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { Check, PartyPopper } from 'lucide-react';
import { api } from '@/lib/api';
import { getColorToken } from '@/lib/colors';
import { Card, CardHeader, CardDivider, Skeleton, notify } from '@/components/ui';

// ─── Formatters ──────────────────────────────────────────────────────────────

const fmtCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

const fmtDate = (date: string) =>
  new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

// ─── Types ────────────────────────────────────────────────────────────────────

interface SummaryData {
  netWorth: { current: number; changeAmount: number; changePercent: number };
  spending: { thisMonth: number; lastMonth: number; changePercent: number };
  income: { thisMonth: number; lastMonth: number };
  savings: { rate: number; amount: number };
}

interface NetWorthPoint {
  date: string;
  value: number;
}

interface BudgetCategory {
  id: string;
  name: string;
  icon: string;
  spent: number;
  budget: number;
}

interface BudgetData {
  month?: string;
  categories: BudgetCategory[];
  totalSpent: number;
  totalBudget: number;
}

interface SpendingPoint {
  day: number;
  thisMonth: number;
  lastMonth: number;
}

interface SpendingChart {
  currentMonthTotal: number;
  data: SpendingPoint[];
}

interface SpendingChartRaw {
  thisMonth: { day: number; amount: number }[];
  lastMonth: { day: number; amount: number }[];
}

interface Transaction {
  id: string;
  merchantName: string;
  categoryName: string;
  categoryColor: string | null;
  amount: number;
  date: string;
  accountName: string;
}

type RecentTxns = Transaction[];

interface RecurringItem {
  id: string;
  name: string;
  amount: number;
  paid: boolean;
  daysUntilDue?: number;
}

interface RecurringData {
  totalPaid: number;
  totalUpcoming: number;
  totalMonthly: number;
  paid: RecurringItem[];
  upcoming: RecurringItem[];
}

interface Goal {
  id: string;
  name: string;
  currentAmount: number;
  targetAmount: number;
  percent: number;
  status: 'on_track' | 'at_risk' | 'completed';
  targetDate: string;
}

interface GoalsData {
  goals: Goal[];
}

interface WeeklyRecapData {
  period: { start: string; end: string; label: string };
  spending: { total: number; change: number; changePercent: number };
  netWorth: { current: number; change: number; changePercent: number };
  topCategory: { name: string; amount: number; icon: string | null } | null;
  upcoming: Array<{ name: string; amount: number; dueDate: string; daysUntilDue: number }>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CHECKLIST_KEY = 'kuber_checklist_dismissed';

const NET_WORTH_TABS = ['1M', '3M', '6M', '1Y'] as const;
type NetWorthTab = typeof NET_WORTH_TABS[number];

function filterNetWorthData(data: NetWorthPoint[], tab: NetWorthTab): NetWorthPoint[] {
  if (!data?.length) return [];
  const now = new Date();
  const months = tab === '1M' ? 1 : tab === '3M' ? 3 : tab === '6M' ? 6 : 12;
  const cutoff = new Date(now.getFullYear(), now.getMonth() - months, now.getDate());
  return data.filter((p) => new Date(p.date) >= cutoff);
}

function progressColor(spent: number, budget: number): string {
  const pct = budget > 0 ? spent / budget : 0;
  if (pct >= 1) return 'var(--color-danger)';
  if (pct >= 0.75) return 'var(--color-warning)';
  return 'var(--color-success)';
}

function goalStatusStyle(status: Goal['status']): { bg: string; color: string; label: string } {
  switch (status) {
    case 'on_track': return { bg: 'var(--color-success-light)', color: 'var(--color-success)', label: 'On Track' };
    case 'at_risk':  return { bg: 'var(--color-warning-light)', color: 'var(--color-warning)', label: 'At Risk' };
    case 'completed': return { bg: 'var(--color-border)', color: 'var(--color-text-secondary)', label: 'Completed' };
  }
}

function merchantInitial(name: string) {
  return (name ?? '?')[0].toUpperCase();
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function WidgetHeader({
  title,
  action,
}: {
  title: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
      <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {title}
      </span>
      {action && <div style={{ flexShrink: 0 }}>{action}</div>}
    </div>
  );
}

function WidgetError({ message = 'Failed to load' }: { message?: string }) {
  return (
    <div style={{ color: 'var(--color-danger)', fontSize: '0.875rem', padding: '1rem 0' }}>
      {message}
    </div>
  );
}

// Goal progress ring
function GoalRing({ pct, size = 48 }: { pct: number; size?: number }) {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(pct, 1));
  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-border)" strokeWidth={5} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke="var(--color-accent)" strokeWidth={5}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

// ─── Widget: Net Worth ────────────────────────────────────────────────────────

function NetWorthWidget({
  summary,
  chartData,
  summaryLoading,
  chartLoading,
  summaryError,
  chartError,
}: {
  summary?: SummaryData;
  chartData?: NetWorthPoint[];
  summaryLoading: boolean;
  chartLoading: boolean;
  summaryError: boolean;
  chartError: boolean;
}) {
  const [tab, setTab] = useState<NetWorthTab>('1Y');
  const filtered = filterNetWorthData(chartData ?? [], tab);

  return (
    <Card padding="lg">
      <WidgetHeader title="Net Worth" />

      {summaryLoading ? (
        <div style={{ marginBottom: '1rem' }}>
          <Skeleton height={36} width={160} style={{ marginBottom: '0.5rem' }} />
          <Skeleton height={16} width={200} />
        </div>
      ) : summaryError || !summary ? (
        <WidgetError />
      ) : (
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '2.25rem', fontWeight: 700, color: 'var(--color-text)', lineHeight: 1.05, fontVariantNumeric: 'tabular-nums' }}>
            {fmtCurrency(summary.netWorth.current)}
          </div>
          <div style={{ marginTop: '0.375rem', display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
              fontSize: '0.8125rem', fontWeight: 500,
              padding: '2px 8px', borderRadius: 'var(--radius-full)',
              backgroundColor: summary.netWorth.changeAmount >= 0 ? 'var(--color-success-light)' : 'var(--color-danger-light)',
              color: summary.netWorth.changeAmount >= 0 ? 'var(--color-success)' : 'var(--color-danger)',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: summary.netWorth.changeAmount >= 0 ? 'var(--color-success)' : 'var(--color-danger)', display: 'inline-block' }} />
              {summary.netWorth.changeAmount >= 0 ? '+' : ''}{fmtCurrency(summary.netWorth.changeAmount)} · {summary.netWorth.changeAmount >= 0 ? '+' : ''}{summary.netWorth.changePercent.toFixed(1)}%
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>this month</span>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'inline-flex', gap: 2, padding: 3, backgroundColor: 'var(--color-surface-alt)', borderRadius: 'var(--radius-md)', marginBottom: '0.75rem' }}>
        {NET_WORTH_TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '0.25rem 0.625rem',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.75rem',
              fontWeight: 500,
              border: 'none',
              cursor: 'pointer',
              backgroundColor: tab === t ? 'var(--color-surface)' : 'transparent',
              color: tab === t ? 'var(--color-text)' : 'var(--color-text-muted)',
              boxShadow: tab === t ? 'var(--shadow-sm)' : 'none',
              transition: 'all 0.15s',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {chartLoading ? (
        <Skeleton height={200} width="100%" />
      ) : chartError || !chartData ? (
        <WidgetError />
      ) : (
        <div role="img" aria-label="Net worth over time chart" tabIndex={0} className="focus:outline-2 focus:outline-[var(--color-accent)] focus:outline-offset-2 rounded">
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={filtered} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={getColorToken('accent')} stopOpacity={0.2} />
                <stop offset="95%" stopColor={getColorToken('accent')} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="date" hide />
            <YAxis hide />
            <Tooltip
              formatter={(value: number) => [fmtCurrency(value), 'Net Worth']}
              labelFormatter={(label: string) => fmtDate(label)}
              contentStyle={{
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.8125rem',
              }}
            />
            <Area type="monotone" dataKey="value" stroke={getColorToken('accent')} strokeWidth={2} fill="url(#nwGrad)" dot={false} />
          </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

// ─── Widget: Budget ───────────────────────────────────────────────────────────

function BudgetWidget({ data, isLoading, isError }: { data?: BudgetData; isLoading: boolean; isError: boolean }) {
  return (
    <Card padding="lg">
      <WidgetHeader
        title={`Budget — ${data?.month ?? new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}`}
        action={
          <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
            Expenses ▼
          </span>
        }
      />

      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} height={40} width="100%" />)}
        </div>
      ) : isError || !data ? (
        <WidgetError />
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            {data.categories.map((cat) => {
              const pct = cat.budget > 0 ? Math.min(cat.spent / cat.budget, 1) : 0;
              const color = progressColor(cat.spent, cat.budget);
              return (
                <div key={cat.id}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.375rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '1.25rem', lineHeight: 1 }}>{cat.icon}</span>
                      <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text)' }}>{cat.name}</span>
                    </div>
                    <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                      {fmtCurrency(cat.spent)} / {fmtCurrency(cat.budget)}
                    </span>
                  </div>
                  <div style={{ height: 6, backgroundColor: 'var(--color-border)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${pct * 100}%`,
                      backgroundColor: color,
                      borderRadius: 'var(--radius-full)',
                      transition: 'width 0.4s ease',
                    }} />
                  </div>
                </div>
              );
            })}
          </div>

          <CardDivider />

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
            <span style={{ color: 'var(--color-text-secondary)' }}>Total</span>
            <span style={{ fontWeight: 600, color: 'var(--color-text)' }}>
              {fmtCurrency(data.totalSpent)} <span style={{ fontWeight: 400, color: 'var(--color-text-secondary)' }}>of {fmtCurrency(data.totalBudget)}</span>
            </span>
          </div>
        </>
      )}
    </Card>
  );
}

// ─── Widget: Getting Started Checklist ───────────────────────────────────────

function ChecklistWidget() {
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(CHECKLIST_KEY) === 'true'
  );

  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const { data: accountsData } = useQuery<{ groups: { accounts: unknown[] }[] }>({
    queryKey: ['accounts'],
    queryFn: () => api.get('/accounts').then((r) => r.data),
    enabled: !dismissed,
  });
  const { data: budgetsData } = useQuery<unknown[]>({
    queryKey: ['budgets', month, year],
    queryFn: () => api.get(`/budgets?month=${month}&year=${year}`).then((r) => r.data),
    enabled: !dismissed,
  });
  const { data: goalsData } = useQuery<unknown[]>({
    queryKey: ['goals'],
    queryFn: () => api.get('/goals').then((r) => r.data),
    enabled: !dismissed,
  });
  const { data: recurringData } = useQuery<unknown[]>({
    queryKey: ['recurring-all'],
    queryFn: () => api.get('/recurring').then((r) => r.data),
    enabled: !dismissed,
  });

  const items = [
    {
      label: 'Add an account',
      done: accountsData?.groups?.some((g) => g.accounts.length > 0) ?? false,
      path: '/accounts',
    },
    {
      label: 'Create a budget',
      done: Array.isArray(budgetsData) && budgetsData.length > 0,
      path: '/budgets',
    },
    {
      label: 'Set a goal',
      done: Array.isArray(goalsData) && goalsData.length > 0,
      path: '/goals',
    },
    {
      label: 'Add a recurring bill',
      done: Array.isArray(recurringData) && recurringData.length > 0,
      path: '/recurring',
    },
  ];

  const doneCount = items.filter((i) => i.done).length;
  const total = items.length;
  const pct = (doneCount / total) * 100;
  const allDone = doneCount === total;

  function dismiss() {
    localStorage.setItem(CHECKLIST_KEY, 'true');
    setDismissed(true);
  }

  if (dismissed || allDone) return null;

  return (
    <Card padding="lg">
      <WidgetHeader title="Getting Started" />

      <div style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', color: 'var(--color-text-secondary)', marginBottom: '0.375rem' }}>
          <span>{doneCount} of {total} complete</span>
          <span>{Math.round(pct)}%</span>
        </div>
        <div style={{ height: 6, backgroundColor: 'var(--color-border)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, backgroundColor: 'var(--color-accent)', borderRadius: 'var(--radius-full)', transition: 'width 0.4s' }} />
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
        {items.map((item) => (
          <div
            key={item.label}
            style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', cursor: item.done ? 'default' : 'pointer' }}
            onClick={item.done ? undefined : () => navigate(item.path)}
          >
            <div style={{
              width: 20, height: 20, borderRadius: 'var(--radius-full)', flexShrink: 0,
              backgroundColor: item.done ? 'var(--color-success)' : 'transparent',
              border: item.done ? 'none' : '2px solid var(--color-border-strong)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {item.done && <Check size={12} className="text-white font-bold" />}
            </div>
            <span style={{
              fontSize: '0.875rem',
              color: item.done ? 'var(--color-text-muted)' : 'var(--color-accent)',
              textDecoration: item.done ? 'line-through' : 'underline',
            }}>
              {item.label}
            </span>
          </div>
        ))}
      </div>

      <div style={{ textAlign: 'right', marginTop: '1rem' }}>
        <button
          onClick={dismiss}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8125rem', color: 'var(--color-text-muted)', textDecoration: 'underline' }}
        >
          Hide this widget
        </button>
      </div>
    </Card>
  );
}

// ─── Widget: Spending ─────────────────────────────────────────────────────────

function SpendingWidget({ data, isLoading, isError }: { data?: SpendingChart; isLoading: boolean; isError: boolean }) {
  return (
    <Card padding="lg">
      <WidgetHeader
        title={`Spending ${data ? fmtCurrency(data.currentMonthTotal) : ''} this month`}
        action={
          <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
            This month vs last month ▼
          </span>
        }
      />

      {isLoading ? (
        <Skeleton height={200} width="100%" />
      ) : isError || !data ? (
        <WidgetError />
      ) : (
        <div role="img" aria-label="Spending comparison chart: this month vs last month" tabIndex={0} className="focus:outline-2 focus:outline-[var(--color-accent)] focus:outline-offset-2 rounded">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data.data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} />
            <YAxis hide />
            <Tooltip
              formatter={(value: number, name: string) => [fmtCurrency(value), name === 'thisMonth' ? 'This month' : 'Last month']}
              contentStyle={{
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.8125rem',
              }}
            />
            <Legend
              formatter={(value) => value === 'thisMonth' ? 'This month' : 'Last month'}
              wrapperStyle={{ fontSize: '0.75rem', paddingTop: '0.375rem' }}
            />
            <Line type="monotone" dataKey="thisMonth" stroke={getColorToken('accent')} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="lastMonth" stroke="#adb5bd" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
          </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

// ─── Widget: Recent Transactions ──────────────────────────────────────────────

function RecentTransactionsWidget({ data, isLoading, isError }: { data?: Transaction[]; isLoading: boolean; isError: boolean }) {
  const navigate = useNavigate();

  return (
    <Card padding="lg">
      <WidgetHeader
        title="Recent Transactions"
        action={
          <button
            onClick={() => navigate('/transactions')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8125rem', color: 'var(--color-accent)', fontWeight: 500 }}
          >
            All transactions →
          </button>
        }
      />

      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Skeleton width={36} height={36} rounded />
              <div style={{ flex: 1 }}>
                <Skeleton height={13} width="60%" style={{ marginBottom: '0.25rem' }} />
                <Skeleton height={11} width="40%" />
              </div>
              <Skeleton height={13} width={60} />
            </div>
          ))}
        </div>
      ) : isError || !data ? (
        <WidgetError />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {data.map((txn, idx) => (
            <div key={txn.id}>
              <div
                onClick={() => navigate('/transactions')}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.75rem',
                  padding: '0.5rem 0', cursor: 'pointer',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                {/* Merchant icon */}
                <div style={{
                  width: 36, height: 36, borderRadius: 'var(--radius-full)',
                  backgroundColor: txn.categoryColor ?? 'var(--color-accent)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontSize: '0.875rem', fontWeight: 700, flexShrink: 0,
                }}>
                  {merchantInitial(txn.merchantName)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {txn.merchantName}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                    {txn.categoryName} · {fmtDate(txn.date)}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexShrink: 0 }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: 600, color: txn.amount < 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
                    {txn.amount < 0 ? '-' : '+'}{fmtCurrency(Math.abs(txn.amount))}
                  </span>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>›</span>
                </div>
              </div>
              {idx < data.length - 1 && (
                <div style={{ height: 1, backgroundColor: 'var(--color-border)' }} />
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ─── Widget: Recurring ────────────────────────────────────────────────────────

function RecurringWidget({ data, isLoading, isError }: { data?: RecurringData; isLoading: boolean; isError: boolean }) {
  return (
    <Card padding="lg">
      <WidgetHeader title="Recurring — This Month" />

      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} height={28} width="100%" />)}
        </div>
      ) : isError || !data ? (
        <WidgetError />
      ) : (
        <>
          {/* Paid section */}
          <div style={{ marginBottom: '0.75rem' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-success)', marginBottom: '0.375rem' }}>
              Paid ({fmtCurrency(data.totalPaid)})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              {data.paid.map((item) => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Check size={14} className="text-[var(--color-success)]" />
                    <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', textDecoration: 'line-through' }}>{item.name}</span>
                  </div>
                  <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>{fmtCurrency(item.amount)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Upcoming section */}
          <div style={{ marginBottom: '0.75rem' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '0.375rem' }}>
              Upcoming ({fmtCurrency(data.totalUpcoming)})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              {data.upcoming.map((item) => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ color: 'var(--color-border-strong)', fontSize: '0.875rem' }}>○</span>
                    <span style={{ fontSize: '0.875rem', color: 'var(--color-text)' }}>{item.name}</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.875rem', color: 'var(--color-text)', fontWeight: 500 }}>{fmtCurrency(item.amount)}</div>
                    {item.daysUntilDue !== undefined && (
                      <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>in {item.daysUntilDue}d</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ height: 1, backgroundColor: 'var(--color-border)', margin: '0.5rem 0' }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
            <span style={{ color: 'var(--color-text-secondary)' }}>Total this month</span>
            <span style={{ fontWeight: 600, color: 'var(--color-text)' }}>
              {fmtCurrency((data.totalPaid ?? 0) + (data.totalUpcoming ?? 0))}
            </span>
          </div>
        </>
      )}
    </Card>
  );
}

// ─── Widget: Goals ────────────────────────────────────────────────────────────

function GoalsWidget({ data, isLoading, isError }: { data?: GoalsData; isLoading: boolean; isError: boolean }) {
  return (
    <Card padding="lg">
      <WidgetHeader title="Goals" />

      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          {[1, 2].map((i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
              <Skeleton width={48} height={48} rounded />
              <div style={{ flex: 1 }}>
                <Skeleton height={13} width="55%" style={{ marginBottom: '0.375rem' }} />
                <Skeleton height={10} width="80%" style={{ marginBottom: '0.375rem' }} />
                <Skeleton height={6} width="100%" />
              </div>
            </div>
          ))}
        </div>
      ) : isError || !data ? (
        <WidgetError />
      ) : data.goals.length === 0 ? (
        <div style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', padding: '0.5rem 0' }}>No goals yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {data.goals.map((goal) => {
            const pct = goal.targetAmount > 0 ? goal.currentAmount / goal.targetAmount : 0;
            const statusStyle = goalStatusStyle(goal.status);
            return (
              <div key={goal.id} style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
                <GoalRing pct={pct} size={48} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)' }}>{goal.name}</span>
                    <span style={{
                      fontSize: '0.6875rem', fontWeight: 600,
                      padding: '0.125rem 0.5rem', borderRadius: 'var(--radius-full)',
                      backgroundColor: statusStyle.bg, color: statusStyle.color,
                    }}>
                      {statusStyle.label}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: '0.375rem' }}>
                    {fmtCurrency(goal.currentAmount)} / {fmtCurrency(goal.targetAmount)} · {Math.round(pct * 100)}%
                  </div>
                  <div style={{ height: 5, backgroundColor: 'var(--color-border)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${Math.min(pct, 1) * 100}%`,
                      backgroundColor: 'var(--color-accent)',
                      borderRadius: 'var(--radius-full)',
                      transition: 'width 0.4s',
                    }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ─── Widget: Weekly Recap ─────────────────────────────────────────────────────

function WeeklyRecapWidget({ data, isLoading, isError }: { data?: WeeklyRecapData; isLoading: boolean; isError: boolean }) {
  return (
    <Card padding="lg">
      <WidgetHeader
        title="Your Weekly Recap"
        action={
          data?.period?.label ? (
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 400 }}>
              {data.period.label}
            </span>
          ) : undefined
        }
      />

      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[1, 2, 3].map(i => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                <Skeleton height={12} width="60%" />
                <Skeleton height={22} width="80%" />
                <Skeleton height={12} width="50%" />
              </div>
            ))}
          </div>
          <Skeleton height={80} width="100%" />
        </div>
      ) : isError || !data ? (
        <WidgetError />
      ) : (
        <>
          {/* Stat tiles */}
          <div className="mb-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Spending */}
            <div style={{
              backgroundColor: 'var(--color-surface-hover)',
              borderRadius: 'var(--radius-md)',
              padding: '0.75rem',
            }}>
              <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.375rem' }}>
                Spending
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text)', lineHeight: 1.05, fontVariantNumeric: 'tabular-nums' }}>
                {fmtCurrency(data.spending.total)}
              </div>
              <div style={{
                marginTop: '0.25rem', fontSize: '0.6875rem',
                color: data.spending.change > 0 ? 'var(--color-danger)' : data.spending.change < 0 ? 'var(--color-success)' : 'var(--color-text-muted)',
              }}>
                {data.spending.change > 0 ? '↑' : data.spending.change < 0 ? '↓' : '—'}{' '}
                {data.spending.change !== 0 ? `${Math.abs(data.spending.changePercent).toFixed(1)}% vs last week` : 'Same as last week'}
              </div>
            </div>

            {/* Net Worth */}
            <div style={{
              backgroundColor: 'var(--color-surface-hover)',
              borderRadius: 'var(--radius-md)',
              padding: '0.75rem',
            }}>
              <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.375rem' }}>
                Net Worth
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text)', lineHeight: 1.05, fontVariantNumeric: 'tabular-nums' }}>
                {fmtCurrency(data.netWorth.current)}
              </div>
              <div style={{
                marginTop: '0.25rem', fontSize: '0.6875rem',
                color: data.netWorth.change >= 0 ? 'var(--color-success)' : 'var(--color-danger)',
              }}>
                {data.netWorth.change >= 0 ? '+' : ''}{fmtCurrency(data.netWorth.change)} this week
              </div>
            </div>

            {/* Top Category */}
            <div style={{
              backgroundColor: 'var(--color-surface-hover)',
              borderRadius: 'var(--radius-md)',
              padding: '0.75rem',
            }}>
              <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.375rem' }}>
                Top Category
              </div>
              {data.topCategory ? (
                <>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-text)', lineHeight: 1.1 }}>
                    {data.topCategory.icon ? `${data.topCategory.icon} ` : ''}{data.topCategory.name}
                  </div>
                  <div style={{ marginTop: '0.25rem', fontSize: '0.6875rem', color: 'var(--color-text-secondary)' }}>
                    {fmtCurrency(data.topCategory.amount)}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>No spending</div>
              )}
            </div>
          </div>
          </div>

          {/* Upcoming bills strip */}
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Upcoming Bills (Next 7 Days)
            </div>
            {data.upcoming.length === 0 ? (
              <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', padding: '0.5rem 0' }}>
                No bills due in the next 7 days <PartyPopper size={16} className="inline" />
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                {data.upcoming.map((bill, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '0.375rem 0.625rem',
                      backgroundColor: 'var(--color-surface-hover)',
                      borderRadius: 'var(--radius-sm)',
                    }}
                  >
                    <span style={{ fontSize: '0.875rem', color: 'var(--color-text)', fontWeight: 500 }}>{bill.name}</span>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.875rem', color: 'var(--color-text)', fontWeight: 600 }}>{fmtCurrency(bill.amount)}</div>
                      <div style={{ fontSize: '0.6875rem', color: bill.daysUntilDue <= 1 ? 'var(--color-danger)' : 'var(--color-text-muted)' }}>
                        {bill.daysUntilDue === 0 ? 'Due today' : bill.daysUntilDue === 1 ? 'Due tomorrow' : `in ${bill.daysUntilDue}d`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </Card>
  );
}

// ─── Widget: Financial Health Score ──────────────────────────────────────────

interface HealthScoreData {
  score: number;
  summary: string;
}

function HealthScoreWidget() {
  const { data, isLoading, isError } = useQuery<HealthScoreData>({
    queryKey: ['dashboard-health-score'],
    queryFn: () => api.get('/dashboard/health-score').then((r) => r.data),
  });

  function scoreColor(score: number): string {
    if (score >= 70) return 'var(--color-success)';
    if (score >= 40) return 'var(--color-warning)';
    return 'var(--color-danger)';
  }

  return (
    <Card padding="lg">
      <WidgetHeader title="Financial Health" />

      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <Skeleton height={56} width={80} />
          <Skeleton height={6} width="100%" />
          <Skeleton height={14} width="80%" />
        </div>
      ) : isError || !data ? (
        <WidgetError />
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.25rem', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '3rem', fontWeight: 700, lineHeight: 1, color: scoreColor(data.score) }}>
              {data.score}
            </span>
            <span style={{ fontSize: '1rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>/100</span>
          </div>

          <div style={{ height: 8, backgroundColor: 'var(--color-border)', borderRadius: 'var(--radius-full)', overflow: 'hidden', marginBottom: '0.75rem' }}>
            <div style={{
              height: '100%',
              width: `${data.score}%`,
              backgroundColor: scoreColor(data.score),
              borderRadius: 'var(--radius-full)',
              transition: 'width 0.4s ease',
            }} />
          </div>

          <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
            {data.summary}
          </p>
        </>
      )}
    </Card>
  );
}

// ─── Widget Layout Types & Defaults ──────────────────────────────────────────

interface WidgetLayout {
  id: string;
  visible: boolean;
  order: number;
}

const WIDGET_META: Array<{ id: string; label: string; column: 'left' | 'right' }> = [
  { id: 'netWorth',            label: 'Net Worth',            column: 'left' },
  { id: 'weeklyRecap',         label: 'Weekly Recap',         column: 'left' },
  { id: 'budgetProgress',      label: 'Budget Progress',      column: 'left' },
  { id: 'gettingStarted',      label: 'Getting Started',      column: 'left' },
  { id: 'healthScore',         label: 'Financial Health',     column: 'left' },
  { id: 'spendingChart',       label: 'Spending Chart',       column: 'right' },
  { id: 'recentTransactions',  label: 'Recent Transactions',  column: 'right' },
  { id: 'recurring',           label: 'Recurring Bills',      column: 'right' },
  { id: 'goals',               label: 'Goals',                column: 'right' },
];

const DEFAULT_LAYOUT: WidgetLayout[] = WIDGET_META.map((w, i) => ({
  id: w.id,
  visible: true,
  order: i,
}));

function mergeLayout(saved: WidgetLayout[] | null): WidgetLayout[] {
  if (!saved) return DEFAULT_LAYOUT;
  // Ensure any widgets added since save are included
  const savedIds = new Set(saved.map(w => w.id));
  const extras = DEFAULT_LAYOUT
    .filter(d => !savedIds.has(d.id))
    .map((d, i) => ({ ...d, order: saved.length + i }));
  return [...saved, ...extras];
}

// ─── Widget Customize Modal ───────────────────────────────────────────────────

function CustomizeModal({
  layout,
  onSave,
  onClose,
  isSaving,
}: {
  layout: WidgetLayout[];
  onSave: (layout: WidgetLayout[]) => void;
  onClose: () => void;
  isSaving: boolean;
}) {
  const [items, setItems] = useState<WidgetLayout[]>(() =>
    [...layout].sort((a, b) => a.order - b.order)
  );
  const dragIndex = useRef<number | null>(null);

  const handleDragStart = useCallback((idx: number) => {
    dragIndex.current = idx;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault();
    const from = dragIndex.current;
    if (from === null || from === idx) return;
    setItems(prev => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(idx, 0, moved);
      dragIndex.current = idx;
      return next;
    });
  }, []);

  const handleDrop = useCallback(() => {
    dragIndex.current = null;
  }, []);

  const toggleVisible = useCallback((id: string) => {
    setItems(prev => prev.map(w => w.id === id ? { ...w, visible: !w.visible } : w));
  }, []);

  const handleSave = () => {
    const normalized = items.map((w, i) => ({ ...w, order: i }));
    onSave(normalized);
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        backgroundColor: 'rgba(0,0,0,0.45)',
        zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          padding: '1.5rem',
          width: '100%',
          maxWidth: 420,
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--color-text)' }}>
            Customize Dashboard
          </h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: 'var(--color-text-muted)', lineHeight: 1 }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', margin: '0 0 1rem' }}>
          Drag to reorder. Toggle switches to show or hide widgets.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {items.map((w, idx) => {
            const meta = WIDGET_META.find(m => m.id === w.id);
            return (
              <div
                key={w.id}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragOver={e => handleDragOver(e, idx)}
                onDrop={handleDrop}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.625rem 0.75rem',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--color-surface-hover)',
                  cursor: 'grab',
                  border: '1px solid var(--color-border)',
                  opacity: w.visible ? 1 : 0.5,
                  transition: 'opacity 0.15s',
                  userSelect: 'none',
                }}
              >
                {/* Drag handle */}
                <span style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', flexShrink: 0 }}>⠿</span>

                {/* Label */}
                <span style={{ flex: 1, fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text)' }}>
                  {meta?.label ?? w.id}
                </span>

                {/* Column badge */}
                <span style={{
                  fontSize: '0.6875rem',
                  padding: '0.125rem 0.4rem',
                  borderRadius: 'var(--radius-full)',
                  backgroundColor: 'var(--color-border)',
                  color: 'var(--color-text-secondary)',
                  flexShrink: 0,
                }}>
                  {meta?.column ?? ''}
                </span>

                {/* Toggle */}
                <button
                  onClick={() => toggleVisible(w.id)}
                  aria-label={w.visible ? 'Hide widget' : 'Show widget'}
                  style={{
                    width: 36, height: 20,
                    borderRadius: 'var(--radius-full)',
                    border: 'none',
                    cursor: 'pointer',
                    backgroundColor: w.visible ? 'var(--color-accent)' : 'var(--color-border-strong)',
                    position: 'relative',
                    transition: 'background-color 0.2s',
                    flexShrink: 0,
                  }}
                >
                  <span style={{
                    position: 'absolute',
                    top: 2,
                    left: w.visible ? 18 : 2,
                    width: 16, height: 16,
                    borderRadius: '50%',
                    backgroundColor: '#fff',
                    transition: 'left 0.2s',
                    display: 'block',
                  }} />
                </button>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
          <button
            onClick={onClose}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              background: 'transparent',
              cursor: 'pointer',
              fontSize: '0.875rem',
              color: 'var(--color-text)',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            style={{
              padding: '0.5rem 1.25rem',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              backgroundColor: 'var(--color-accent)',
              color: '#fff',
              cursor: isSaving ? 'not-allowed' : 'pointer',
              fontSize: '0.875rem',
              fontWeight: 600,
              opacity: isSaving ? 0.7 : 1,
            }}
          >
            {isSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const [showCustomize, setShowCustomize] = useState(false);

  // ── Widget data queries ──────────────────────────────────────────────────
  const { data: summaryData, isLoading: summaryLoading, isError: summaryError } =
    useQuery<SummaryData>({
      queryKey: ['dashboard', 'summary'],
      queryFn: () => api.get('/dashboard/summary').then((r) => r.data),
    });

  const { data: netWorthChart, isLoading: nwChartLoading, isError: nwChartError } =
    useQuery<NetWorthPoint[]>({
      queryKey: ['dashboard', 'net-worth-chart'],
      queryFn: () => api.get('/dashboard/net-worth-chart').then((r) => r.data),
    });

  const { data: budgetData, isLoading: budgetLoading, isError: budgetError } =
    useQuery<BudgetData>({
      queryKey: ['dashboard', 'budget-summary'],
      queryFn: () => api.get('/dashboard/budget-summary').then((r) => r.data),
    });

  const { data: spendingChart, isLoading: spendingLoading, isError: spendingError } =
    useQuery<SpendingChart>({
      queryKey: ['dashboard', 'spending-chart'],
      queryFn: () => api.get('/dashboard/spending-chart').then((r) => {
        const raw: SpendingChartRaw = r.data;
        const prevMap = new Map(raw.lastMonth.map((p) => [p.day, p.amount]));
        const currMap = new Map(raw.thisMonth.map((p) => [p.day, p.amount]));
        // Build day 1-31 range covering all days in either dataset
        const maxDay = Math.max(
          ...raw.thisMonth.map(p => p.day),
          ...raw.lastMonth.map(p => p.day),
          1,
        );
        const days = Array.from({ length: maxDay }, (_, i) => i + 1);
        // Build cumulative (running total) for each series
        let cumCurr = 0;
        let cumPrev = 0;
        const data: SpendingPoint[] = days.map((day) => {
          cumCurr += currMap.get(day) ?? 0;
          cumPrev += prevMap.get(day) ?? 0;
          return { day, thisMonth: cumCurr, lastMonth: cumPrev };
        });
        const currentMonthTotal = raw.thisMonth.reduce((s, p) => s + p.amount, 0);
        return { currentMonthTotal, data };
      }),
    });

  const { data: recentTxns, isLoading: txnsLoading, isError: txnsError } =
    useQuery<RecentTxns>({
      queryKey: ['dashboard', 'recent-transactions'],
      queryFn: () => api.get('/dashboard/recent-transactions').then((r) => r.data as Transaction[]),
    });

  const { data: recurringData, isLoading: recurringLoading, isError: recurringError } =
    useQuery<RecurringData>({
      queryKey: ['dashboard', 'recurring-summary'],
      queryFn: () => api.get('/dashboard/recurring-summary').then((r) => r.data),
    });

  const { data: goalsData, isLoading: goalsLoading, isError: goalsError } =
    useQuery<GoalsData>({
      queryKey: ['dashboard', 'goals-summary'],
      queryFn: () => api.get('/dashboard/goals-summary').then((r) => ({ goals: r.data as Goal[] })),
    });

  const { data: weeklyRecapData, isLoading: weeklyRecapLoading, isError: weeklyRecapError } =
    useQuery<WeeklyRecapData>({
      queryKey: ['dashboard', 'weekly-recap'],
      queryFn: () => api.get('/dashboard/weekly-recap').then((r) => r.data),
    });

  // ── Layout query + mutation ──────────────────────────────────────────────
  const { data: savedLayout } = useQuery<WidgetLayout[] | null>({
    queryKey: ['settings', 'dashboard-layout'],
    queryFn: () => api.get('/settings/dashboard-layout').then((r) => r.data),
  });

  const layout = mergeLayout(savedLayout ?? null);

  const saveLayoutMutation = useMutation({
    mutationFn: (newLayout: WidgetLayout[]) =>
      api.put('/settings/dashboard-layout', { layout: newLayout }).then((r) => r.data),
    onSuccess: (data: WidgetLayout[]) => {
      queryClient.setQueryData(['settings', 'dashboard-layout'], data);
      setShowCustomize(false);
    },
    onError: () => notify.error('Failed to save dashboard layout'),
  });

  // ── Build ordered, filtered widget lists per column ──────────────────────
  const sortedLayout = [...layout].sort((a, b) => a.order - b.order);

  // Render a widget node by its ID
  function renderWidget(id: string): React.ReactNode {
    switch (id) {
      case 'netWorth':
        return (
          <NetWorthWidget
            key={id}
            summary={summaryData}
            chartData={netWorthChart}
            summaryLoading={summaryLoading}
            chartLoading={nwChartLoading}
            summaryError={summaryError}
            chartError={nwChartError}
          />
        );
      case 'weeklyRecap':
        return (
          <WeeklyRecapWidget
            key={id}
            data={weeklyRecapData}
            isLoading={weeklyRecapLoading}
            isError={weeklyRecapError}
          />
        );
      case 'budgetProgress':
        return (
          <BudgetWidget
            key={id}
            data={budgetData}
            isLoading={budgetLoading}
            isError={budgetError}
          />
        );
      case 'gettingStarted':
        return <ChecklistWidget key={id} />;
      case 'healthScore':
        return <HealthScoreWidget key={id} />;
      case 'spendingChart':
        return (
          <SpendingWidget
            key={id}
            data={spendingChart}
            isLoading={spendingLoading}
            isError={spendingError}
          />
        );
      case 'recentTransactions':
        return (
          <RecentTransactionsWidget
            key={id}
            data={recentTxns}
            isLoading={txnsLoading}
            isError={txnsError}
          />
        );
      case 'recurring':
        return (
          <RecurringWidget
            key={id}
            data={recurringData}
            isLoading={recurringLoading}
            isError={recurringError}
          />
        );
      case 'goals':
        return (
          <GoalsWidget
            key={id}
            data={goalsData}
            isLoading={goalsLoading}
            isError={goalsError}
          />
        );
      default:
        return null;
    }
  }

  const leftWidgets = sortedLayout
    .filter(w => w.visible && WIDGET_META.find(m => m.id === w.id)?.column === 'left')
    .map(w => renderWidget(w.id));

  const rightWidgets = sortedLayout
    .filter(w => w.visible && WIDGET_META.find(m => m.id === w.id)?.column === 'right')
    .map(w => renderWidget(w.id));

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="grid grid-cols-1 gap-4 py-4">
      {/* Dashboard header with Customize button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text)' }}>
          Dashboard
        </h1>
        <button
          onClick={() => setShowCustomize(true)}
          title="Customize dashboard"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.375rem',
            padding: '0.375rem 0.875rem',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border)',
            background: 'transparent',
            cursor: 'pointer',
            fontSize: '0.8125rem',
            fontWeight: 500,
            color: 'var(--color-text-secondary)',
          }}
        >
          {/* gear icon (unicode) */}
          <span style={{ fontSize: '0.875rem' }}>⚙</span>
          Customize
        </button>
      </div>

      {/* 2-column widget grid — single column on mobile, 2-col on md+ */}
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-4 items-start">
        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {leftWidgets}
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {rightWidgets}
        </div>
      </div>

      {/* Customize modal */}
      {showCustomize && (
        <CustomizeModal
          layout={layout}
          onSave={(newLayout) => saveLayoutMutation.mutate(newLayout)}
          onClose={() => setShowCustomize(false)}
          isSaving={saveLayoutMutation.isPending}
        />
      )}
    </div>
  );
}
