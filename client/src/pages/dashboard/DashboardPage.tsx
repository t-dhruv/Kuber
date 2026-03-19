import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { api } from '@/lib/api';
import { Card, CardHeader, CardDivider, Skeleton } from '@/components/ui';

// ─── Formatters ──────────────────────────────────────────────────────────────

const fmtCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

const fmtDate = (date: string) =>
  new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

// ─── Types ────────────────────────────────────────────────────────────────────

interface SummaryData {
  netWorth: number;
  netWorthChange: number;
  netWorthChangePct: number;
  totalIncome: number;
  totalExpenses: number;
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
  month: string;
  categories: BudgetCategory[];
  totalSpent: number;
  totalBudget: number;
}

interface SpendingPoint {
  day: number;
  current: number;
  previous: number;
}

interface SpendingChart {
  currentMonthTotal: number;
  data: SpendingPoint[];
}

interface Transaction {
  id: string;
  merchant: string;
  category: string;
  categoryColor: string;
  amount: number;
  date: string;
}

interface RecentTxns {
  transactions: Transaction[];
}

interface RecurringItem {
  id: string;
  name: string;
  amount: number;
  paid: boolean;
  daysUntilDue?: number;
}

interface RecurringData {
  paidTotal: number;
  upcomingTotal: number;
  paid: RecurringItem[];
  upcoming: RecurringItem[];
}

interface Goal {
  id: string;
  name: string;
  current: number;
  target: number;
  status: 'on_track' | 'at_risk' | 'completed';
}

interface GoalsData {
  goals: Goal[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CHECKLIST_KEY = 'kuber_checklist_dismissed';

const CHECKLIST_ITEMS = [
  { label: 'Create your account', done: true },
  { label: 'Add your first account', done: true },
  { label: 'Set up a budget', done: false },
  { label: 'Create a savings goal', done: false },
  { label: 'Add a recurring bill', done: false },
];

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
          <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--color-text)', lineHeight: 1.1 }}>
            {fmtCurrency(summary.netWorth)}
          </div>
          <div style={{ marginTop: '0.25rem', fontSize: '0.875rem', color: summary.netWorthChange >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
            {summary.netWorthChange >= 0 ? '▲' : '▼'}{' '}
            {fmtCurrency(Math.abs(summary.netWorthChange))}{' '}
            ({summary.netWorthChange >= 0 ? '+' : ''}{summary.netWorthChangePct.toFixed(1)}%) this month
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.75rem' }}>
        {NET_WORTH_TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '0.25rem 0.625rem',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.75rem',
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
              backgroundColor: tab === t ? 'var(--color-accent)' : 'transparent',
              color: tab === t ? '#fff' : 'var(--color-text-secondary)',
              transition: 'background 0.15s',
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
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={filtered} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#E5622A" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#E5622A" stopOpacity={0} />
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
            <Area type="monotone" dataKey="value" stroke="#E5622A" strokeWidth={2} fill="url(#nwGrad)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

// ─── Widget: Budget ───────────────────────────────────────────────────────────

function BudgetWidget({ data, isLoading, isError }: { data?: BudgetData; isLoading: boolean; isError: boolean }) {
  return (
    <Card padding="lg">
      <WidgetHeader
        title={`Budget — ${data?.month ?? '…'}`}
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
                      <span style={{ fontSize: '1rem' }}>{cat.icon}</span>
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
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(CHECKLIST_KEY) === 'true'
  );

  if (dismissed) return null;

  const doneCount = CHECKLIST_ITEMS.filter((i) => i.done).length;
  const total = CHECKLIST_ITEMS.length;
  const pct = (doneCount / total) * 100;

  function dismiss() {
    localStorage.setItem(CHECKLIST_KEY, 'true');
    setDismissed(true);
  }

  return (
    <Card padding="lg">
      <WidgetHeader title="Getting Started" />

      {/* Progress bar */}
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
        {CHECKLIST_ITEMS.map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <div style={{
              width: 20, height: 20, borderRadius: 'var(--radius-full)', flexShrink: 0,
              backgroundColor: item.done ? 'var(--color-success)' : 'transparent',
              border: item.done ? 'none' : '2px solid var(--color-border-strong)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {item.done && <span style={{ color: '#fff', fontSize: '0.6875rem', fontWeight: 700 }}>✓</span>}
            </div>
            <span style={{
              fontSize: '0.875rem',
              color: item.done ? 'var(--color-text-muted)' : 'var(--color-text)',
              textDecoration: item.done ? 'line-through' : 'none',
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
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={data.data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="spendCurr" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#E5622A" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#E5622A" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="spendPrev" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#adb5bd" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#adb5bd" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} />
            <YAxis hide />
            <Tooltip
              formatter={(value: number, name: string) => [fmtCurrency(value), name === 'current' ? 'This month' : 'Last month']}
              contentStyle={{
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.8125rem',
              }}
            />
            <Area type="monotone" dataKey="current" stroke="#E5622A" strokeWidth={2} fill="url(#spendCurr)" dot={false} />
            <Area type="monotone" dataKey="previous" stroke="#adb5bd" strokeWidth={1.5} fill="url(#spendPrev)" dot={false} strokeDasharray="4 2" />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

// ─── Widget: Recent Transactions ──────────────────────────────────────────────

function RecentTransactionsWidget({ data, isLoading, isError }: { data?: RecentTxns; isLoading: boolean; isError: boolean }) {
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
          {data.transactions.map((txn, idx) => (
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
                  {merchantInitial(txn.merchant)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {txn.merchant}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                    {txn.category} · {fmtDate(txn.date)}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexShrink: 0 }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: 600, color: txn.amount < 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
                    {txn.amount < 0 ? '-' : '+'}{fmtCurrency(Math.abs(txn.amount))}
                  </span>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>›</span>
                </div>
              </div>
              {idx < data.transactions.length - 1 && (
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
              Paid ({fmtCurrency(data.paidTotal)})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              {data.paid.map((item) => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ color: 'var(--color-success)', fontSize: '0.875rem' }}>✓</span>
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
              Upcoming ({fmtCurrency(data.upcomingTotal)})
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
              {fmtCurrency((data.paidTotal ?? 0) + (data.upcomingTotal ?? 0))}
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
            const pct = goal.target > 0 ? goal.current / goal.target : 0;
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
                    {fmtCurrency(goal.current)} / {fmtCurrency(goal.target)} · {Math.round(pct * 100)}%
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

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { data: summaryData, isLoading: summaryLoading, isError: summaryError } =
    useQuery<SummaryData>({
      queryKey: ['dashboard', 'summary'],
      queryFn: () => api.get('/dashboard/summary').then((r) => r.data.data),
    });

  const { data: netWorthChart, isLoading: nwChartLoading, isError: nwChartError } =
    useQuery<NetWorthPoint[]>({
      queryKey: ['dashboard', 'net-worth-chart'],
      queryFn: () => api.get('/dashboard/net-worth-chart').then((r) => r.data.data),
    });

  const { data: budgetData, isLoading: budgetLoading, isError: budgetError } =
    useQuery<BudgetData>({
      queryKey: ['dashboard', 'budget-summary'],
      queryFn: () => api.get('/dashboard/budget-summary').then((r) => r.data.data),
    });

  const { data: spendingChart, isLoading: spendingLoading, isError: spendingError } =
    useQuery<SpendingChart>({
      queryKey: ['dashboard', 'spending-chart'],
      queryFn: () => api.get('/dashboard/spending-chart').then((r) => r.data.data),
    });

  const { data: recentTxns, isLoading: txnsLoading, isError: txnsError } =
    useQuery<RecentTxns>({
      queryKey: ['dashboard', 'recent-transactions'],
      queryFn: () => api.get('/dashboard/recent-transactions').then((r) => r.data.data),
    });

  const { data: recurringData, isLoading: recurringLoading, isError: recurringError } =
    useQuery<RecurringData>({
      queryKey: ['dashboard', 'recurring-summary'],
      queryFn: () => api.get('/dashboard/recurring-summary').then((r) => r.data.data),
    });

  const { data: goalsData, isLoading: goalsLoading, isError: goalsError } =
    useQuery<GoalsData>({
      queryKey: ['dashboard', 'goals-summary'],
      queryFn: () => api.get('/dashboard/goals-summary').then((r) => r.data.data),
    });

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr',
      gap: '1rem',
      padding: '1rem 0',
    }}>
      {/* 2-column grid for md+ */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)',
        gap: '1rem',
        alignItems: 'start',
      }}>
        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <NetWorthWidget
            summary={summaryData}
            chartData={netWorthChart}
            summaryLoading={summaryLoading}
            chartLoading={nwChartLoading}
            summaryError={summaryError}
            chartError={nwChartError}
          />
          <BudgetWidget
            data={budgetData}
            isLoading={budgetLoading}
            isError={budgetError}
          />
          <ChecklistWidget />
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <SpendingWidget
            data={spendingChart}
            isLoading={spendingLoading}
            isError={spendingError}
          />
          <RecentTransactionsWidget
            data={recentTxns}
            isLoading={txnsLoading}
            isError={txnsError}
          />
          <RecurringWidget
            data={recurringData}
            isLoading={recurringLoading}
            isError={recurringError}
          />
          <GoalsWidget
            data={goalsData}
            isLoading={goalsLoading}
            isError={goalsError}
          />
        </div>
      </div>
    </div>
  );
}
