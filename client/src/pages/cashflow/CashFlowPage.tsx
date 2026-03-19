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
}

interface YearData {
  year: number;
  months: MonthSummary[];
  ytdIncome: number;
  ytdExpenses: number;
  ytdNet: number;
  avgMonthlySavingsPct: number;
}

interface IncomeCategory {
  id: string;
  name: string;
  icon: string;
  amount: number;
  pctOfTotal: number;
}

interface ExpenseCategory {
  id: string;
  name: string;
  icon: string;
  amount: number;
  pctOfGroupTotal: number;
  pctOfExpenses: number;
}

interface ExpenseGroup {
  id: string;
  name: string;
  amount: number;
  pctOfTotal: number;
  categories: ExpenseCategory[];
}

interface BudgetRow {
  categoryId: string;
  categoryName: string;
  budget: number;
  actual: number;
  remaining: number;
  pctOfIncome: number;
}

interface MonthData {
  year: number;
  month: number;
  income: number;
  expenses: number;
  net: number;
  savingsPct: number;
  incomeCategories: IncomeCategory[];
  expenseGroups: ExpenseGroup[];
  budgetRows: BudgetRow[];
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
      value: data?.income ?? 0,
      color: 'var(--color-success)',
      format: fmtCurrency,
    },
    {
      label: `Expenses — ${monthName}`,
      value: data?.expenses ?? 0,
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
      value: data?.savingsPct ?? 0,
      color: savingsColor(data?.savingsPct ?? 0),
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

type DetailTab = 'Bar Chart' | 'Table' | 'Sankey';

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

  const TABS: DetailTab[] = ['Bar Chart', 'Table', 'Sankey'];

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
      ) : tab === 'Bar Chart' ? (
        <BarChartView
          data={data}
          collapsedGroups={collapsedGroups}
          onToggleGroup={toggleGroup}
        />
      ) : (
        <TableView data={data} />
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Income section */}
      <div>
        <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-success)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
          Income — {fmtCurrency(data.income)}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
          {(data.incomeCategories ?? []).map((cat) => (
            <div key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '1rem', width: 20, textAlign: 'center' }}>{cat.icon}</span>
              <span style={{ fontSize: '0.875rem', color: 'var(--color-text)', minWidth: 120, whiteSpace: 'nowrap' }}>{cat.name}</span>
              <HorizontalBar pct={cat.pctOfTotal} color="var(--color-success)" />
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text)', minWidth: 72, textAlign: 'right' }}>{fmtCurrency(cat.amount)}</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', minWidth: 36, textAlign: 'right' }}>{fmtPct(cat.pctOfTotal)}</span>
            </div>
          ))}
          {(!data.incomeCategories || data.incomeCategories.length === 0) && (
            <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>No income categories.</span>
          )}
        </div>
      </div>

      <CardDivider />

      {/* Expenses section */}
      <div>
        <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-danger)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
          Expenses — {fmtCurrency(data.expenses)}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {(data.expenseGroups ?? []).map((group) => {
            const collapsed = collapsedGroups.has(group.id);
            return (
              <div key={group.id}>
                {/* Group row */}
                <button
                  onClick={() => onToggleGroup(group.id)}
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
                  <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)', flex: 1 }}>{group.name}</span>
                  <HorizontalBar pct={group.pctOfTotal} color="var(--color-danger)" />
                  <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text)', minWidth: 72, textAlign: 'right' }}>{fmtCurrency(group.amount)}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', minWidth: 36, textAlign: 'right' }}>{fmtPct(group.pctOfTotal)}</span>
                </button>

                {/* Category rows */}
                {!collapsed && (
                  <div style={{ paddingLeft: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.125rem', marginBottom: '0.25rem' }}>
                    {group.categories.map((cat) => (
                      <div key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.25rem 0.25rem' }}>
                        <span style={{ fontSize: '0.9375rem', width: 20, textAlign: 'center' }}>{cat.icon}</span>
                        <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', flex: 1 }}>{cat.name}</span>
                        <HorizontalBar pct={cat.pctOfGroupTotal} color="var(--color-danger)" />
                        <span style={{ fontSize: '0.8125rem', color: 'var(--color-text)', minWidth: 72, textAlign: 'right' }}>{fmtCurrency(cat.amount)}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', minWidth: 36, textAlign: 'right' }}>{fmtPct(cat.pctOfGroupTotal)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {(!data.expenseGroups || data.expenseGroups.length === 0) && (
            <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>No expense data.</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Table view ───────────────────────────────────────────────────────────────

function TableView({ data }: { data?: MonthData }) {
  if (!data) {
    return <div style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', padding: '1rem 0' }}>No data for this month.</div>;
  }

  const rows = data.budgetRows ?? [];
  const totalBudget = rows.reduce((s, r) => s + r.budget, 0);
  const totalActual = rows.reduce((s, r) => s + r.actual, 0);
  const totalRemaining = rows.reduce((s, r) => s + r.remaining, 0);

  const COL_STYLE: React.CSSProperties = {
    padding: '0.625rem 0.75rem',
    fontSize: '0.8125rem',
    textAlign: 'right',
  };
  const COL_STYLE_LEFT: React.CSSProperties = {
    ...COL_STYLE,
    textAlign: 'left',
  };

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
            {['Category', 'Budget', 'Actual', 'Remaining', '% of Income'].map((h, i) => (
              <th
                key={h}
                style={{
                  ...( i === 0 ? COL_STYLE_LEFT : COL_STYLE),
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: 'var(--color-text-secondary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  paddingBottom: '0.5rem',
                  whiteSpace: 'nowrap',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr
              key={row.categoryId}
              style={{
                borderBottom: idx < rows.length - 1 ? '1px solid var(--color-border)' : 'none',
                backgroundColor: 'transparent',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <td style={{ ...COL_STYLE_LEFT, color: 'var(--color-text)', fontWeight: 500 }}>{row.categoryName}</td>
              <td style={{ ...COL_STYLE, color: 'var(--color-text-secondary)' }}>{fmtCurrency(row.budget)}</td>
              <td style={{ ...COL_STYLE, color: row.actual > row.budget ? 'var(--color-danger)' : 'var(--color-text)', fontWeight: 500 }}>{fmtCurrency(row.actual)}</td>
              <td style={{ ...COL_STYLE, color: row.remaining >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>{fmtCurrency(row.remaining)}</td>
              <td style={{ ...COL_STYLE, color: 'var(--color-text-secondary)' }}>{fmtPct(row.pctOfIncome)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: '2px solid var(--color-border)' }}>
            <td style={{ ...COL_STYLE_LEFT, fontWeight: 700, color: 'var(--color-text)' }}>Total</td>
            <td style={{ ...COL_STYLE, fontWeight: 600, color: 'var(--color-text)' }}>{fmtCurrency(totalBudget)}</td>
            <td style={{ ...COL_STYLE, fontWeight: 600, color: totalActual > totalBudget ? 'var(--color-danger)' : 'var(--color-text)' }}>{fmtCurrency(totalActual)}</td>
            <td style={{ ...COL_STYLE, fontWeight: 600, color: totalRemaining >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>{fmtCurrency(totalRemaining)}</td>
            <td style={{ ...COL_STYLE, color: 'var(--color-text-secondary)' }}>—</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ─── Section 4: YTD Summary ───────────────────────────────────────────────────

function YtdSummary({ data, isLoading }: { data?: YearData; isLoading: boolean }) {
  const stats = [
    { label: 'YTD Income', value: data?.ytdIncome ?? 0, color: 'var(--color-success)', format: fmtCurrency },
    { label: 'YTD Expenses', value: data?.ytdExpenses ?? 0, color: 'var(--color-danger)', format: fmtCurrency },
    { label: 'YTD Net', value: data?.ytdNet ?? 0, color: netColor(data?.ytdNet ?? 0), format: fmtCurrency },
    { label: 'Avg Monthly Savings', value: data?.avgMonthlySavingsPct ?? 0, color: savingsColor(data?.avgMonthlySavingsPct ?? 0), format: fmtPct },
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
