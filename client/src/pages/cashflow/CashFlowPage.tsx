import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import { api } from '@/lib/api';
import { Card, CardDivider, Skeleton } from '@/components/ui';

// ─── Formatters ───────────────────────────────────────────────────────────────

const fmtCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

const fmtPct = (value: number) => `${Math.round(value)}%`;

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ─── Types ────────────────────────────────────────────────────────────────────

interface MonthSummary {
  month: number;
  income: number;
  expenses: number;
  net: number;
  savingsRate: number;
}

// Matches GET /api/v1/cashflow response exactly
interface YearData {
  year: number;
  months: MonthSummary[];
  ytdIncome: number;
  ytdExpenses: number;
  ytdNet: number;
  ytdSavingsRate: number;
  averageMonthlyIncome: number;
  averageMonthlyExpenses: number;
}

// Matches items in income.byCategory from GET /api/v1/cashflow/month
interface IncomeCategory {
  categoryId: string;
  categoryName: string;
  categoryIcon: string | null;
  amount: number;
  percent: number;
}

// Matches items in expenses.byGroup[].categories from GET /api/v1/cashflow/month
interface ExpenseCategoryItem {
  categoryId: string;
  categoryName: string;
  categoryIcon: string | null;
  amount: number;
  percent: number;       // percent of total expenses
  groupName: string;
  groupId: string;
}

// Matches items in expenses.byGroup from GET /api/v1/cashflow/month
interface ExpenseGroup {
  groupName: string;
  amount: number;
  percent: number;       // percent of total expenses
  categories: ExpenseCategoryItem[];
}

// Matches GET /api/v1/cashflow/month response exactly
interface MonthData {
  year: number;
  month: number;
  income: {
    total: number;
    byCategory: IncomeCategory[];
  };
  expenses: {
    total: number;
    byCategory: ExpenseCategoryItem[];
    byGroup: ExpenseGroup[];
  };
  net: number;
  savingsRate: number;
  topExpenseCategories: Array<{ name: string; amount: number; percent: number }>;
  dailyFlow: Array<{ day: number; income: number; expenses: number }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function savingsColor(pct: number): string {
  if (pct >= 20) return 'var(--color-success)';
  if (pct >= 10) return 'var(--color-warning)';
  return 'var(--color-danger)';
}

function netColor(net: number): string {
  return net >= 0 ? 'var(--color-success)' : 'var(--color-danger)';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PageHeader({
  year,
  period,
  onPrevYear,
  onNextYear,
  onPeriodChange,
}: {
  year: number;
  period: 'Monthly' | 'Quarterly' | 'Yearly';
  onPrevYear: () => void;
  onNextYear: () => void;
  onPeriodChange: (p: 'Monthly' | 'Quarterly' | 'Yearly') => void;
}) {
  const PERIODS = ['Monthly', 'Quarterly', 'Yearly'] as const;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: '0.75rem',
      marginBottom: '1.25rem',
    }}>
      <h1 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>
        Cash Flow
      </h1>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        {/* Period toggle */}
        <div style={{
          display: 'flex',
          backgroundColor: 'var(--color-surface-hover)',
          borderRadius: 'var(--radius-md)',
          padding: '0.125rem',
        }}>
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => onPeriodChange(p)}
              style={{
                padding: '0.3125rem 0.75rem',
                borderRadius: 'calc(var(--radius-md) - 2px)',
                fontSize: '0.8125rem',
                fontWeight: 500,
                border: 'none',
                cursor: 'pointer',
                backgroundColor: period === p ? 'var(--color-surface)' : 'transparent',
                color: period === p ? 'var(--color-text)' : 'var(--color-text-secondary)',
                boxShadow: period === p ? 'var(--shadow-sm)' : 'none',
                transition: 'all 0.15s',
              }}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Filters placeholder */}
        <button style={{
          padding: '0.3125rem 0.875rem',
          borderRadius: 'var(--radius-md)',
          fontSize: '0.8125rem',
          fontWeight: 500,
          border: '1px solid var(--color-border)',
          cursor: 'pointer',
          backgroundColor: 'var(--color-surface)',
          color: 'var(--color-text-secondary)',
        }}>
          Filters
        </button>

        {/* Year nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <button
            onClick={onPrevYear}
            style={{
              width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)',
              backgroundColor: 'var(--color-surface)', cursor: 'pointer',
              color: 'var(--color-text-secondary)', fontSize: '0.875rem',
            }}
          >
            ‹
          </button>
          <span style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--color-text)', minWidth: 36, textAlign: 'center' }}>
            {year}
          </span>
          <button
            onClick={onNextYear}
            style={{
              width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)',
              backgroundColor: 'var(--color-surface)', cursor: 'pointer',
              color: 'var(--color-text-secondary)', fontSize: '0.875rem',
            }}
          >
            ›
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Section 1: Year Overview Bar Chart ───────────────────────────────────────

interface ChartPoint {
  month: string;
  monthIndex: number;
  income: number;
  expenses: number;
  net: number;
}

function YearOverviewChart({
  data,
  isLoading,
  selectedMonth,
  onSelectMonth,
}: {
  data?: YearData;
  isLoading: boolean;
  selectedMonth: number;
  onSelectMonth: (month: number) => void;
}) {
  const chartData: ChartPoint[] = MONTH_NAMES.map((name, i) => {
    const monthNum = i + 1;
    const found = data?.months.find((m) => m.month === monthNum);
    return {
      month: name,
      monthIndex: monthNum,
      income: found?.income ?? 0,
      expenses: found?.expenses ?? 0,
      net: found?.net ?? 0,
    };
  });

  if (isLoading) {
    return (
      <Card padding="lg">
        <Skeleton height={220} width="100%" />
      </Card>
    );
  }

  return (
    <Card padding="lg">
      <div style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {data?.year ?? '—'} Overview
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginLeft: 'auto' }}>
          <LegendDot color="var(--color-success)" label="Income" />
          <LegendDot color="var(--color-danger)" label="Expenses" />
          <LegendDot color="var(--color-text-muted)" label="Net" line />
        </div>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
          onClick={(e) => {
            if (e?.activePayload?.[0]) {
              const point = e.activePayload[0].payload as ChartPoint;
              onSelectMonth(point.monthIndex);
            }
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
            tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
            width={42}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.8125rem',
            }}
            formatter={(value: number, name: string) => [
              fmtCurrency(value),
              name === 'income' ? 'Income' : name === 'expenses' ? 'Expenses' : 'Net',
            ]}
          />
          <Bar dataKey="income" name="income" radius={[3, 3, 0, 0]} maxBarSize={28}>
            {chartData.map((entry) => (
              <Cell
                key={entry.monthIndex}
                fill="var(--color-success)"
                opacity={entry.monthIndex === selectedMonth ? 1 : 0.65}
              />
            ))}
          </Bar>
          <Bar dataKey="expenses" name="expenses" radius={[3, 3, 0, 0]} maxBarSize={28}>
            {chartData.map((entry) => (
              <Cell
                key={entry.monthIndex}
                fill="var(--color-danger)"
                opacity={entry.monthIndex === selectedMonth ? 1 : 0.65}
              />
            ))}
          </Bar>
          <Line
            type="monotone"
            dataKey="net"
            name="net"
            stroke="var(--color-text-muted)"
            strokeWidth={2}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </Card>
  );
}

function LegendDot({ color, label, line }: { color: string; label: string; line?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
      {line ? (
        <div style={{ width: 16, height: 2, backgroundColor: color, borderRadius: 1 }} />
      ) : (
        <div style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: color }} />
      )}
      <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>{label}</span>
    </div>
  );
}

// ─── Section 2: KPI Cards ─────────────────────────────────────────────────────

function KpiCards({ data, isLoading }: { data?: MonthData; isLoading: boolean }) {
  const monthName = data ? MONTH_NAMES[(data.month ?? 1) - 1] : '—';

  const cards = [
    {
      label: `Income — ${monthName}`,
      value: data?.income?.total ?? 0,
      color: 'var(--color-success)',
      format: fmtCurrency,
    },
    {
      label: `Expenses — ${monthName}`,
      value: data?.expenses?.total ?? 0,
      color: 'var(--color-danger)',
      format: fmtCurrency,
    },
    {
      label: 'Net',
      value: data?.net ?? 0,
      color: netColor(data?.net ?? 0),
      format: fmtCurrency,
    },
    {
      label: 'Savings Rate',
      value: data?.savingsRate ?? 0,
      color: savingsColor(data?.savingsRate ?? 0),
      format: fmtPct,
    },
  ];

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: '0.75rem',
    }}>
      {cards.map((card) => (
        <Card key={card.label} padding="lg">
          {isLoading ? (
            <>
              <Skeleton height={12} width="70%" style={{ marginBottom: '0.625rem' }} />
              <Skeleton height={28} width="85%" />
            </>
          ) : (
            <>
              <div style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '0.375rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {card.label}
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: card.color, lineHeight: 1.1 }}>
                {card.format(card.value)}
              </div>
            </>
          )}
        </Card>
      ))}
    </div>
  );
}

// ─── Section 3: Month Detail ──────────────────────────────────────────────────

type DetailTab = 'Bar Chart' | 'Sankey';

function MonthDetail({ data, isLoading, selectedMonth }: { data?: MonthData; isLoading: boolean; selectedMonth: number }) {
  const [tab, setTab] = useState<DetailTab>('Bar Chart');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const monthName = MONTH_NAMES[selectedMonth - 1];

  function toggleGroup(id: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const TABS: DetailTab[] = ['Bar Chart', 'Sankey'];

  return (
    <Card padding="lg">
      {/* Header + tabs */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {monthName} Detail
        </span>
        <div style={{ display: 'flex', gap: '0.25rem' }}>
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '0.25rem 0.75rem',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.8125rem',
                fontWeight: 500,
                border: '1px solid',
                borderColor: tab === t ? 'var(--color-accent)' : 'var(--color-border)',
                cursor: 'pointer',
                backgroundColor: tab === t ? 'var(--color-accent)' : 'transparent',
                color: tab === t ? '#fff' : 'var(--color-text-secondary)',
                transition: 'all 0.15s',
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} height={32} width="100%" />)}
        </div>
      ) : tab === 'Sankey' ? (
        <SankeyPlaceholder />
      ) : (
        <BarChartView
          data={data}
          collapsedGroups={collapsedGroups}
          onToggleGroup={toggleGroup}
        />
      )}
    </Card>
  );
}

function SankeyPlaceholder() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: 220,
      border: '2px dashed var(--color-border)',
      borderRadius: 'var(--radius-lg)',
      color: 'var(--color-text-muted)',
      fontSize: '0.9375rem',
    }}>
      Sankey diagram — full implementation in Sprint 5
    </div>
  );
}

// ─── Bar Chart view ───────────────────────────────────────────────────────────

function HorizontalBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ flex: 1, height: 8, backgroundColor: 'var(--color-border)', borderRadius: 'var(--radius-full)', overflow: 'hidden', minWidth: 80 }}>
      <div style={{
        height: '100%',
        width: `${Math.min(pct, 100)}%`,
        backgroundColor: color,
        borderRadius: 'var(--radius-full)',
        transition: 'width 0.4s ease',
      }} />
    </div>
  );
}

function BarChartView({
  data,
  collapsedGroups,
  onToggleGroup,
}: {
  data?: MonthData;
  collapsedGroups: Set<string>;
  onToggleGroup: (id: string) => void;
}) {
  if (!data) {
    return <div style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', padding: '1rem 0' }}>No data for this month.</div>;
  }

  const incomeCategories = data.income?.byCategory ?? [];
  const expenseGroups = data.expenses?.byGroup ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Income section */}
      <div>
        <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-success)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
          Income — {fmtCurrency(data.income?.total ?? 0)}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
          {incomeCategories.map((cat) => (
            <div key={cat.categoryId} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '1rem', width: 20, textAlign: 'center' }}>{cat.categoryIcon ?? ''}</span>
              <span style={{ fontSize: '0.875rem', color: 'var(--color-text)', minWidth: 120, whiteSpace: 'nowrap' }}>{cat.categoryName}</span>
              <HorizontalBar pct={cat.percent} color="var(--color-success)" />
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text)', minWidth: 72, textAlign: 'right' }}>{fmtCurrency(cat.amount)}</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', minWidth: 36, textAlign: 'right' }}>{fmtPct(cat.percent)}</span>
            </div>
          ))}
          {incomeCategories.length === 0 && (
            <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>No income categories.</span>
          )}
        </div>
      </div>

      <CardDivider />

      {/* Expenses section */}
      <div>
        <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-danger)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
          Expenses — {fmtCurrency(data.expenses?.total ?? 0)}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {expenseGroups.map((group) => {
            const collapsed = collapsedGroups.has(group.groupName);
            return (
              <div key={group.groupName}>
                {/* Group row */}
                <button
                  onClick={() => onToggleGroup(group.groupName)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                    width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                    padding: '0.375rem 0.25rem',
                    borderRadius: 'var(--radius-sm)',
                    textAlign: 'left',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', width: 12 }}>
                    {collapsed ? '▶' : '▾'}
                  </span>
                  <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)', flex: 1 }}>{group.groupName}</span>
                  <HorizontalBar pct={group.percent} color="var(--color-danger)" />
                  <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text)', minWidth: 72, textAlign: 'right' }}>{fmtCurrency(group.amount)}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', minWidth: 36, textAlign: 'right' }}>{fmtPct(group.percent)}</span>
                </button>

                {/* Category rows */}
                {!collapsed && (
                  <div style={{ paddingLeft: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.125rem', marginBottom: '0.25rem' }}>
                    {group.categories.map((cat) => {
                      // percent here is cat's share of total expenses; compute share within group
                      const groupPct = group.percent > 0
                        ? (cat.amount / group.amount) * 100
                        : 0;
                      return (
                        <div key={cat.categoryId} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.25rem 0.25rem' }}>
                          <span style={{ fontSize: '0.9375rem', width: 20, textAlign: 'center' }}>{cat.categoryIcon ?? ''}</span>
                          <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', flex: 1 }}>{cat.categoryName}</span>
                          <HorizontalBar pct={groupPct} color="var(--color-danger)" />
                          <span style={{ fontSize: '0.8125rem', color: 'var(--color-text)', minWidth: 72, textAlign: 'right' }}>{fmtCurrency(cat.amount)}</span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', minWidth: 36, textAlign: 'right' }}>{fmtPct(groupPct)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {expenseGroups.length === 0 && (
            <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>No expense data.</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Section 4: YTD Summary ───────────────────────────────────────────────────

function YtdSummary({ data, isLoading }: { data?: YearData; isLoading: boolean }) {
  const stats = [
    { label: 'YTD Income', value: data?.ytdIncome ?? 0, color: 'var(--color-success)', format: fmtCurrency },
    { label: 'YTD Expenses', value: data?.ytdExpenses ?? 0, color: 'var(--color-danger)', format: fmtCurrency },
    { label: 'YTD Net', value: data?.ytdNet ?? 0, color: netColor(data?.ytdNet ?? 0), format: fmtCurrency },
    { label: 'YTD Savings Rate', value: data?.ytdSavingsRate ?? 0, color: savingsColor(data?.ytdSavingsRate ?? 0), format: fmtPct },
  ];

  return (
    <Card padding="lg">
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0',
      }}>
        {stats.map((stat, idx) => (
          <div
            key={stat.label}
            style={{
              flex: '1 1 160px',
              padding: '0.25rem 1.25rem',
              borderLeft: idx > 0 ? '1px solid var(--color-border)' : 'none',
            }}
          >
            {isLoading ? (
              <>
                <Skeleton height={11} width="60%" style={{ marginBottom: '0.375rem' }} />
                <Skeleton height={20} width="75%" />
              </>
            ) : (
              <>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem', whiteSpace: 'nowrap' }}>
                  {stat.label}
                </div>
                <div style={{ fontSize: '1.125rem', fontWeight: 700, color: stat.color }}>
                  {stat.format(stat.value)}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CashFlowPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [period, setPeriod] = useState<'Monthly' | 'Quarterly' | 'Yearly'>('Monthly');

  const { data: yearData, isLoading: yearLoading } = useQuery<YearData>({
    queryKey: ['cashflow', year],
    queryFn: () => api.get(`/cashflow?year=${year}`).then((r) => r.data),
  });

  const { data: monthData, isLoading: monthLoading } = useQuery<MonthData>({
    queryKey: ['cashflow-month', year, selectedMonth],
    queryFn: () => api.get(`/cashflow/month?year=${year}&month=${selectedMonth}`).then((r) => r.data),
  });

  return (
    <div style={{ padding: '1rem 0', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <PageHeader
        year={year}
        period={period}
        onPrevYear={() => setYear((y) => y - 1)}
        onNextYear={() => setYear((y) => y + 1)}
        onPeriodChange={setPeriod}
      />

      {/* Section 1: Year overview chart */}
      <YearOverviewChart
        data={yearData}
        isLoading={yearLoading}
        selectedMonth={selectedMonth}
        onSelectMonth={setSelectedMonth}
      />

      {/* Section 2: KPI cards */}
      <KpiCards data={monthData} isLoading={monthLoading} />

      {/* Section 3: Month detail */}
      <MonthDetail
        data={monthData}
        isLoading={monthLoading}
        selectedMonth={selectedMonth}
      />

      {/* Section 4: YTD summary */}
      <YtdSummary data={yearData} isLoading={yearLoading} />
    </div>
  );
}
