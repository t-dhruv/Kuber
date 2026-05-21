import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, Sankey, Rectangle,
} from 'recharts';
import { api } from '@/lib/api';
import { Card, CardDivider, Skeleton } from '@/components/ui';

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: CURRENT_YEAR - 2019 }, (_, i) => CURRENT_YEAR - i);

// ─── Formatters ───────────────────────────────────────────────────────

const fmtCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

const fmtPct = (value: number) => `${Math.round(value)}%`;

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// ─── Types ──────────────────────────────────────────────────────────────

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

// Matches items in expenses.byGroup from GET /api/v1/cashflow/month
interface ExpenseGroup {
  groupName: string;
  amount: number;
  percent: number;
  categories: ExpenseCategoryItem[];
}

interface ExpenseCategoryItem {
  categoryId: string;
  categoryName: string;
  categoryIcon: string | null;
  amount: number;
  percent: number;
}

// Matches items in income.byMerchant / expenses.byMerchant from GET /api/v1/cashflow/month
interface MerchantBreakdownItem {
  merchantId: string | null;
  merchantName: string;
  amount: number;
  transactionCount: number;
  percentage: number;
}

// Matches GET /api/v1/cashflow/month response exactly
interface MonthData {
  year: number;
  month: number;
  income: {
    total: number;
    byCategory: IncomeCategory[];
    byMerchant: MerchantBreakdownItem[];
  };
  expenses: {
    total: number;
    byCategory: ExpenseCategoryItem[];
    byGroup: ExpenseGroup[];
    byMerchant: MerchantBreakdownItem[];
  };
  net: number;
  savingsRate: number;
  topExpenseCategories: Array<{ name: string; amount: number; percent: number }>;
  dailyFlow: Array<{ day: number; income: number; expenses: number }>;
}

interface SankeyLinkProps {
  sourceX: number;
  sourceY: number;
  sourceControlX: number;
  targetControlX: number;
  targetX: number;
  targetY: number;
  linkWidth: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function savingsColor(pct: number): string {
  if (pct >= 20) return 'var(--color-success)';
  if (pct >= 10) return 'var(--color-warning)';
  return 'var(--color-danger)';
}

function netColor(net: number): string {
  return net >= 0 ? 'var(--color-success)' : 'var(--color-danger)';
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function PageHeader({
  year,
  period,
  onPrevYear,
  onNextYear,
  onPeriodChange,
  onFilterToggle,
  filterOpen,
}: {
  year: number;
  period: 'Monthly' | 'Quarterly' | 'Yearly';
  onPrevYear: () => void;
  onNextYear: () => void;
  onPeriodChange: (p: 'Monthly' | 'Quarterly' | 'Yearly') => void;
  onFilterToggle: () => void;
  filterOpen: boolean;
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
          background: 'var(--color-surface-alt)',
          borderRadius: 'var(--radius-md)',
          padding: '3px',
          display: 'inline-flex',
          gap: '2px',
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
                background: period === p ? 'var(--color-surface)' : 'transparent',
                color: period === p ? 'var(--color-text)' : 'var(--color-text-muted)',
                boxShadow: period === p ? 'var(--shadow-sm)' : 'none',
                transition: 'all 0.15s',
              }}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Filters dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={onFilterToggle}
            style={{
              padding: '0.3125rem 0.875rem',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.8125rem',
              fontWeight: 500,
              border: '1px solid var(--color-border)',
              cursor: 'pointer',
              backgroundColor: filterOpen ? 'var(--color-accent-light)' : 'var(--color-surface)',
              color: filterOpen ? 'var(--color-accent)' : 'var(--color-text-secondary)',
            }}
          >
            Filters
          </button>
        </div>

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

  const hasData = (data?.months ?? []).some((m) => m.income > 0 || m.expenses > 0);

  if (!hasData) {
    return (
      <Card padding="lg">
        <div className="flex flex-col items-center justify-center py-12 text-[color:var(--color-text-muted)] text-sm">
          No transactions yet — add income or expenses to see your cash flow.
        </div>
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

      <div role="img" aria-label="Cash flow year overview chart">
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
      </div>
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
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {cards.map((card) => (
        <Card key={card.label} padding="lg">
          {isLoading ? (
            <>
              <Skeleton height={11} width="60%" style={{ marginBottom: '0.375rem' }} />
              <Skeleton height={20} width="75%" />
            </>
          ) : (
            <>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem', whiteSpace: 'nowrap' }}>
                {card.label}
              </div>
              {card.label === 'Savings Rate' ? (
                <div>
                  <span style={{
                    display: 'inline-block',
                    background: card.color === 'var(--color-success)' ? 'var(--color-success-light)' : card.color === 'var(--color-warning)' ? 'var(--color-warning-light)' : 'var(--color-danger-light)',
                    color: card.color,
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-full)',
                    fontSize: 12,
                    fontWeight: 500,
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {card.format(card.value)}
                  </span>
                </div>
              ) : (
                <div style={{
                  fontSize: '1.75rem',
                  fontWeight: 700,
                  color: card.color,
                  fontFamily: 'var(--font-display)',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {card.format(card.value)}
                </div>
              )}
            </>
          )}
        </Card>
      ))}
    </div>
  );
}

// ─── Section 3: Month Detail ──────────────────────────────────────────────────

type DetailTab = 'Bar Chart' | 'Sankey' | 'Merchants';

function MonthDetail({ data, isLoading, selectedMonth, year }: { data?: MonthData; isLoading: boolean; selectedMonth: number; year: number }) {
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

  const TABS: DetailTab[] = ['Bar Chart', 'Sankey', 'Merchants'];

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
        <SankeyChart data={data} year={year} month={selectedMonth} />
      ) : tab === 'Merchants' ? (
        <MerchantBreakdownView data={data} />
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

const SANKEY_COLORS = [
  '#2f9e44', '#1971c2', '#9c36b5', '#e67700', '#c92a2a',
  '#0c8599', '#f76707', '#5c7cfa', '#f59f00', '#868e96',
];

function SankeyChart({ data, year, month }: { data?: MonthData; year: number; month: number }) {
  const navigate = useNavigate();
  const [hovered, setHovered] = useState<number | null>(null);

  if (!data || data.income.total <= 0) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: 220, color: 'var(--color-text-muted)', fontSize: '0.875rem',
      }}>
        No data for this month
      </div>
    );
  }

  const incomeNodes = data.income.byCategory.map((c) => ({ name: c.categoryName, amount: c.amount }));
  const cfIndex = incomeNodes.length;
  const expenseNodes = data.expenses.byGroup.map((g) => ({ name: g.groupName, amount: g.amount }));
  const net = data.income.total - data.expenses.total;
  const hasSavings = net > 0;
  const nodes = [
    ...incomeNodes,
    { name: 'Cash Flow', amount: data.income.total },
    ...expenseNodes,
    ...(hasSavings ? [{ name: 'Savings', amount: net }] : []),
  ];

  function handleNodeClick(index: number) {
    const node = nodes[index];
    if (index === cfIndex) return;
    if (hasSavings && index === nodes.length - 1) return;

    const from = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const to = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
    navigate(`/transactions?search=${encodeURIComponent(node.name)}&startDate=${from}&endDate=${to}`);
  }

  const links: { source: number; target: number; value: number }[] = [];

  data.income.byCategory.forEach((c, i) => {
    if (c.amount > 0) links.push({ source: i, target: cfIndex, value: Math.round(c.amount * 100) / 100 });
  });
  data.expenses.byGroup.forEach((g, i) => {
    if (g.amount > 0) links.push({ source: cfIndex, target: cfIndex + 1 + i, value: Math.round(g.amount * 100) / 100 });
  });
  if (hasSavings) {
    links.push({ source: cfIndex, target: nodes.length - 1, value: Math.round(net * 100) / 100 });
  }

  if (links.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 220, color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
        No transactions this month
      </div>
    );
  }

  return (
    <div>
      <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem', textAlign: 'center' }}>
        Click a category node to view transactions
      </p>
      <div style={{ height: 320 }} role="img" aria-label="Cash flow Sankey diagram">
        <ResponsiveContainer width="100%" height="100%">
          <Sankey
            data={{ nodes, links }}
            nodePadding={14}
            nodeWidth={18}
            margin={{ top: 8, right: 140, bottom: 8, left: 140 }}
            link={({ sourceX, sourceY, sourceControlX, targetControlX, targetX, targetY, linkWidth }: SankeyLinkProps) => (
              <path
                d={`M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
                fill="none"
                stroke="var(--color-border)"
                strokeWidth={linkWidth}
                strokeOpacity={0.45}
              />
            )}
            node={({ x, y, width, height, index, payload }: {
              x: number; y: number; width: number; height: number; index: number; payload: { name: string; value: number };
            }) => {
              const isCenter = index === cfIndex;
              const isSavings = hasSavings && index === nodes.length - 1;
              const isClickable = !isCenter && !isSavings;
              const isHov = hovered === index;
              const color = isCenter
                ? 'var(--color-accent)'
                : isSavings
                  ? '#2f9e44'
                  : SANKEY_COLORS[index % SANKEY_COLORS.length];
              const nodeAmount = nodes[index]?.amount ?? 0;
              const amtStr = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Math.abs(nodeAmount));

              return (
                <g
                  onClick={() => handleNodeClick(index)}
                  onMouseEnter={() => setHovered(index)}
                  onMouseLeave={() => setHovered(null)}
                  style={{ cursor: isClickable ? 'pointer' : 'default' }}
                >
                  <Rectangle
                    x={x} y={y} width={width} height={Math.max(height, 4)}
                    fill={color} fillOpacity={isHov ? 1 : 0.85} radius={3}
                  />
                  {/* Node label */}
                  <text
                    x={index <= cfIndex ? x - 8 : x + width + 8}
                    y={y + height / 2 - (isHov ? 7 : 0)}
                    textAnchor={index <= cfIndex ? 'end' : 'start'}
                    dominantBaseline="middle"
                    style={{
                      fontSize: '0.6875rem',
                      fill: isHov ? 'var(--color-text)' : 'var(--color-text-secondary)',
                      fontFamily: 'inherit',
                      fontWeight: isHov ? 600 : 400,
                      transition: 'all 0.1s',
                    }}
                  >
                    {payload.name}
                  </text>
                  {/* Amount label shown on hover */}
                  {isHov && (
                    <text
                      x={index <= cfIndex ? x - 8 : x + width + 8}
                      y={y + height / 2 + 8}
                      textAnchor={index <= cfIndex ? 'end' : 'start'}
                      dominantBaseline="middle"
                      style={{ fontSize: '0.625rem', fill: color, fontFamily: 'inherit', fontWeight: 600 }}
                    >
                      {amtStr}
                    </text>
                  )}
                  {/* Clickable hint */}
                  {isHov && isClickable && (
                    <text
                      x={index <= cfIndex ? x - 8 : x + width + 8}
                      y={y + height / 2 + 20}
                      textAnchor={index <= cfIndex ? 'end' : 'start'}
                      dominantBaseline="middle"
                      style={{ fontSize: '0.5625rem', fill: 'var(--color-accent)', fontFamily: 'inherit' }}
                    >
                      View transactions →
                    </text>
                  )}
                </g>
              );
            }}
          />
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Bar Chart view ───────────────────────────────────────────────────────────

function HorizontalBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ flex: 1, height: 8, backgroundColor: 'var(--color-border)', borderRadius: 'var(--radius-full)', overflow: 'hidden', minWidth: 40 }}>
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
              <span style={{ fontSize: '1rem', width: 20, textAlign: 'center', flexShrink: 0 }}>{cat.categoryIcon ?? ''}</span>
              <span style={{ fontSize: '0.875rem', color: 'var(--color-text)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.categoryName}</span>
              <HorizontalBar pct={cat.percent} color="var(--color-success)" />
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text)', flexShrink: 0, textAlign: 'right', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>{fmtCurrency(cat.amount)}</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', flexShrink: 0, textAlign: 'right' }}>{fmtPct(cat.percent)}</span>
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
                  <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text)', minWidth: 72, textAlign: 'right', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>{fmtCurrency(group.amount)}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', minWidth: 36, textAlign: 'right' }}>{fmtPct(group.percent)}</span>
                </button>

                {/* Category rows */}
                {!collapsed && (
                  <div style={{ paddingLeft: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.125rem', marginBottom: '0.25rem' }}>
                    {group.categories.map((cat) => {
                      const groupPct = group.percent > 0
                        ? (cat.amount / group.amount) * 100
                        : 0;
                      return (
                        <div key={cat.categoryId} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.25rem 0.25rem' }}>
                          <span style={{ fontSize: '0.9375rem', width: 20, textAlign: 'center' }}>{cat.categoryIcon ?? ''}</span>
                          <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', flex: 1 }}>{cat.categoryName}</span>
                          <HorizontalBar pct={groupPct} color="var(--color-danger)" />
                          <span style={{ fontSize: '0.8125rem', color: 'var(--color-text)', minWidth: 72, textAlign: 'right', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>{fmtCurrency(cat.amount)}</span>
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

// ─── Merchant Breakdown View ──────────────────────────────────────────────────

function MerchantBreakdownView({ data }: { data?: MonthData }) {
  const [showAllExpense, setShowAllExpense] = useState(false);
  const [showAllIncome, setShowAllIncome] = useState(false);

  if (!data) {
    return <div style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', padding: '1rem 0' }}>No data for this month.</div>;
  }

  const expenseMerchants = data.expenses?.byMerchant ?? [];
  const incomeMerchants = data.income?.byMerchant ?? [];

  const visibleExpense = showAllExpense ? expenseMerchants : expenseMerchants.slice(0, 15);
  const visibleIncome = showAllIncome ? incomeMerchants : incomeMerchants.slice(0, 15);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Income sources */}
      <div>
        <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-success)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
          Income Sources — {fmtCurrency(data.income?.total ?? 0)}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {visibleIncome.length === 0 && (
            <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>No income this month.</span>
          )}
          {visibleIncome.map((m, idx) => (
            <div key={m.merchantId ?? m.merchantName + idx} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text)', minWidth: 0, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {m.merchantName}
              </span>
              <HorizontalBar pct={m.percentage} color="var(--color-success)" />
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text)', minWidth: 72, textAlign: 'right' }}>{fmtCurrency(m.amount)}</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', minWidth: 36, textAlign: 'right' }}>{fmtPct(m.percentage)}</span>
              <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', minWidth: 48, textAlign: 'right' }}>{m.transactionCount}×</span>
            </div>
          ))}
          {incomeMerchants.length > 15 && (
            <button
              onClick={() => setShowAllIncome((v) => !v)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8125rem', color: 'var(--color-accent)', padding: '0.25rem 0', textAlign: 'left' }}
            >
              {showAllIncome ? 'Show less' : `Show ${incomeMerchants.length - 15} more`}
            </button>
          )}
        </div>
      </div>

      <CardDivider />

      {/* Expense merchants */}
      <div>
        <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-danger)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
          Top Merchants — {fmtCurrency(data.expenses?.total ?? 0)}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {visibleExpense.length === 0 && (
            <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>No expense merchants this month.</span>
          )}
          {visibleExpense.map((m, idx) => (
            <div key={m.merchantId ?? m.merchantName + idx} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', minWidth: 20, textAlign: 'right' }}>
                {idx + 1}
              </span>
              <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text)', minWidth: 0, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {m.merchantName}
              </span>
              <HorizontalBar pct={m.percentage} color="var(--color-danger)" />
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text)', minWidth: 72, textAlign: 'right' }}>{fmtCurrency(m.amount)}</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', minWidth: 36, textAlign: 'right' }}>{fmtPct(m.percentage)}</span>
              <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', minWidth: 48, textAlign: 'right' }}>{m.transactionCount}×</span>
            </div>
          ))}
          {expenseMerchants.length > 15 && (
            <button
              onClick={() => setShowAllExpense((v) => !v)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8125rem', color: 'var(--color-accent)', padding: '0.25rem 0', textAlign: 'left' }}
            >
              {showAllExpense ? 'Show less' : `Show ${expenseMerchants.length - 15} more`}
            </button>
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
                {stat.label === 'YTD Savings Rate' ? (
                  <div style={{ marginTop: '0.25rem' }}>
                    <span style={{
                      display: 'inline-block',
                      background: stat.color === 'var(--color-success)' ? 'var(--color-success-light)' : stat.color === 'var(--color-warning)' ? 'var(--color-warning-light)' : 'var(--color-danger-light)',
                      color: stat.color,
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-full)',
                      fontSize: 12,
                      fontWeight: 500,
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {stat.format(stat.value)}
                    </span>
                  </div>
                ) : (
                  <div style={{
                    fontSize: '1.75rem',
                    fontWeight: 700,
                    color: stat.color,
                    fontFamily: 'var(--font-display)',
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {stat.format(stat.value)}
                  </div>
                )}
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
  const [filterOpen, setFilterOpen] = useState(false);

  const { data: yearData, isLoading: yearLoading, isError: yearError } = useQuery<YearData>({
    queryKey: ['cashflow', year],
    queryFn: () => api.get(`/cashflow?year=${year}`).then((r) => r.data),
  });

  const { data: monthData, isLoading: monthLoading, isError: monthError } = useQuery<MonthData>({
    queryKey: ['cashflow-month', year, selectedMonth],
    queryFn: () => api.get(`/cashflow/month?year=${year}&month=${selectedMonth}`).then((r) => r.data),
  });

  // Quick filter actions
  const quickFilters = [
    {
      label: 'This Year',
      action: () => { setYear(CURRENT_YEAR); setSelectedMonth(new Date().getMonth() + 1); setFilterOpen(false); },
    },
    {
      label: 'Last Year',
      action: () => { setYear(CURRENT_YEAR - 1); setFilterOpen(false); },
    },
    {
      label: 'This Month',
      action: () => { setYear(CURRENT_YEAR); setSelectedMonth(new Date().getMonth() + 1); setFilterOpen(false); },
    },
  ];

  if (yearError || monthError) {
    return (
      <div className="flex items-center justify-center py-24 text-[color:var(--color-text-secondary)]">
        <p>Failed to load cash flow data. Please refresh the page.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '1rem 0', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <PageHeader
        year={year}
        period={period}
        onPrevYear={() => setYear((y) => y - 1)}
        onNextYear={() => setYear((y) => y + 1)}
        onPeriodChange={setPeriod}
        onFilterToggle={() => setFilterOpen((o) => !o)}
        filterOpen={filterOpen}
      />

      {/* Filter dropdown — rendered inline */}
      {filterOpen && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 40 }}
            onClick={() => setFilterOpen(false)}
          />
          <div
            style={{
              position: 'fixed',
              top: 80,
              right: 24,
              zIndex: 41,
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-md)',
              padding: '0.5rem 0',
              minWidth: 200,
            }}
          >
            <div style={{ padding: '0.25rem 0.75rem', fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Quick select
            </div>
            {quickFilters.map((f) => (
              <button
                key={f.label}
                onClick={f.action}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '0.375rem 0.75rem',
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  color: 'var(--color-text)',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                {f.label}
              </button>
            ))}

            <div style={{ height: 1, backgroundColor: 'var(--color-border)', margin: '0.25rem 0' }} />

            <div style={{ padding: '0.25rem 0.75rem', fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Year
            </div>
            <select
              value={year}
              onChange={(e) => { setYear(parseInt(e.target.value)); setFilterOpen(false); }}
              style={{
                margin: '0 0.5rem',
                padding: '0.375rem 0.5rem',
                borderRadius: 'calc(var(--radius-md) - 2px)',
                fontSize: '0.8125rem',
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-surface)',
                color: 'var(--color-text)',
                cursor: 'pointer',
                width: 'calc(100% - 1rem)',
              }}
            >
              {YEAR_OPTIONS.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>

            <div style={{ padding: '0.25rem 0.75rem', fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: '0.25rem' }}>
              Month (detail view)
            </div>
            <select
              value={selectedMonth}
              onChange={(e) => { setSelectedMonth(parseInt(e.target.value)); setFilterOpen(false); }}
              style={{
                margin: '0 0.5rem',
                padding: '0.375rem 0.5rem',
                borderRadius: 'calc(var(--radius-md) - 2px)',
                fontSize: '0.8125rem',
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-surface)',
                color: 'var(--color-text)',
                cursor: 'pointer',
                width: 'calc(100% - 1rem)',
              }}
            >
              <option value={0}>-- Year overview --</option>
              {MONTH_NAMES.map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>
        </>
      )}

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
        year={year}
      />

      {/* Section 4: YTD summary */}
      <YtdSummary data={yearData} isLoading={yearLoading} />
    </div>
  );
}
