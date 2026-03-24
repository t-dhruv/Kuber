import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { Plus, ChevronRight, ChevronDown, Trash2, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import {
  Card, Skeleton, Button, Modal, ModalFooter, Input, Select, notify,
} from '@/components/ui';

// ─── Formatters ───────────────────────────────────────────────────────────────

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const fmtDateFull = (d: string) =>
  new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

// ─── Types ────────────────────────────────────────────────────────────────────

interface HoldingLot {
  id: string;
  date: string;
  shares: number;
  pricePerShare: number;
  note?: string | null;
  status: 'confirmed' | 'pending';
}

interface Holding {
  id: string;
  accountId: string;
  accountName: string;
  ticker: string;
  name: string;
  shares: number;
  avgCostBasis: number;
  currentPrice: number;
  currentValue: number;
  totalCost: number;
  gain: number;
  gainPercent: number;
  dayChange: number;
  dayChangePercent: number;
  priceSource: 'live' | 'cached';
  lots: HoldingLot[];
}

interface HoldingsData {
  holdings: Holding[];
  totalValue: number;
  totalCostBasis: number;
  totalGain: number;
  totalGainPercent: number;
}

interface AssetClassSegment {
  assetClass: string;
  value: number;
  percent: number;
}

interface AllocationHolding {
  ticker: string;
  name: string;
  value: number;
  percent: number;
  type: string;
}

interface AllocationData {
  totalValue: number;
  byAssetClass: AssetClassSegment[];
  byAccount: Array<{
    accountId: string;
    accountName: string;
    value: number;
    percent: number;
  }>;
  holdings: AllocationHolding[];
}

interface HistoryPoint {
  date: string;
  value: number;
}

interface BenchmarksObj {
  sp500: number;
  usBonds: number;
  usStocks: number;
}

interface PerformanceData {
  period: string;
  portfolioReturn: number;
  portfolioReturnValue: number;
  benchmarks: BenchmarksObj;
  history: HistoryPoint[];
}

interface AccountGroup {
  accounts: InvestmentAccount[];
}

interface InvestmentAccount {
  id: string;
  name: string;
}

interface AccountsResponse {
  groups: AccountGroup[];
  netWorth: number;
}

interface RecurringSchedule {
  id: string;
  holdingId: string;
  amount: number;
  frequency: string;
  dayOfMonth: number;
  status: 'active' | 'paused';
  lastRunAt: string | null;
  nextRunAt: string;
}

interface PendingLot {
  id: string;
  holdingId: string;
  ticker: string;
  name: string;
  date: string;
  shares: number;
  pricePerShare: number;
  note?: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PERIOD_OPTIONS = ['1W', '1M', '3M', '6M', 'YTD', '1Y', '5Y'] as const;
type Period = typeof PERIOD_OPTIONS[number];

const ALLOCATION_COLORS = [
  '#E5622A', '#2f9e44', '#1971c2', '#9c36b5',
  '#e67700', '#0c8599', '#c2255c', '#74b816',
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function PeriodToggle({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
      {PERIOD_OPTIONS.map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          style={{
            padding: '0.25rem 0.5rem',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.75rem',
            fontWeight: 600,
            border: 'none',
            cursor: 'pointer',
            backgroundColor: value === p ? 'var(--color-accent)' : 'transparent',
            color: value === p ? '#fff' : 'var(--color-text-secondary)',
            transition: 'background 0.15s',
          }}
        >
          {p}
        </button>
      ))}
    </div>
  );
}

function TabToggle({
  value,
  onChange,
}: {
  value: 'holdings' | 'allocation';
  onChange: (t: 'holdings' | 'allocation') => void;
}) {
  return (
    <div style={{
      display: 'flex',
      backgroundColor: 'var(--color-surface-hover)',
      borderRadius: 'var(--radius-md)',
      padding: '0.125rem',
      gap: '0.125rem',
    }}>
      {(['holdings', 'allocation'] as const).map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          style={{
            padding: '0.375rem 0.875rem',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.8125rem',
            fontWeight: 600,
            border: 'none',
            cursor: 'pointer',
            backgroundColor: value === t ? 'var(--color-surface)' : 'transparent',
            color: value === t ? 'var(--color-text)' : 'var(--color-text-secondary)',
            boxShadow: value === t ? 'var(--shadow-sm)' : 'none',
            transition: 'all 0.15s',
            textTransform: 'capitalize',
          }}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

function SkeletonRow() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 0' }}>
      <Skeleton width={36} height={36} rounded />
      <div style={{ flex: 2 }}>
        <Skeleton height={13} width="55%" style={{ marginBottom: '0.25rem' }} />
        <Skeleton height={11} width="30%" />
      </div>
      <Skeleton height={13} width={50} />
      <Skeleton height={13} width={60} />
      <Skeleton height={13} width={70} />
      <Skeleton height={13} width={80} />
      <Skeleton height={13} width={80} />
    </div>
  );
}

function GainBadge({ amount, pct, showArrow = true }: { amount: number; pct: number; showArrow?: boolean }) {
  const positive = amount >= 0;
  const color = positive ? 'var(--color-success)' : 'var(--color-danger)';
  return (
    <span style={{ color, fontSize: '0.8125rem', fontWeight: 500, whiteSpace: 'nowrap' }}>
      {showArrow && (positive ? '▲' : '▼')}{' '}
      {positive ? '+' : '-'}{fmtCurrency(Math.abs(amount))}{' '}
      <span style={{ opacity: 0.85 }}>{fmtPct(pct)}</span>
    </span>
  );
}

// ─── Performance Cards ────────────────────────────────────────────────────────

interface BenchmarkCard {
  name: string;
  returnPct: number;
}

function benchmarksToCards(
  performanceData: PerformanceData | undefined,
): BenchmarkCard[] {
  if (!performanceData) return [];
  const { portfolioReturn, benchmarks } = performanceData;
  return [
    { name: 'Your Portfolio', returnPct: portfolioReturn },
    { name: 'S&P 500', returnPct: benchmarks.sp500 },
    { name: 'US Stocks', returnPct: benchmarks.usStocks },
    { name: 'US Bonds', returnPct: benchmarks.usBonds },
  ];
}

function PerformanceCards({ performanceData, period, isLoading }: {
  performanceData?: PerformanceData;
  period: Period;
  isLoading: boolean;
}) {
  const cards = isLoading
    ? Array.from({ length: 4 }, (_, i) => ({ name: '', returnPct: 0, key: i }))
    : benchmarksToCards(performanceData).map((b, i) => ({ ...b, key: i }));

  return (
    <div style={{ display: 'flex', gap: '0.75rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
      {cards.map((card, idx) => (
        <div
          key={card.key}
          style={{
            minWidth: 160,
            flexShrink: 0,
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            padding: '0.875rem 1rem',
            boxShadow: 'var(--shadow-sm)',
            transition: 'box-shadow 0.15s',
            cursor: 'default',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-md)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-sm)'; }}
        >
          {isLoading ? (
            <>
              <Skeleton height={12} width="70%" style={{ marginBottom: '0.5rem' }} />
              <Skeleton height={18} width="55%" style={{ marginBottom: '0.25rem' }} />
              <Skeleton height={12} width="45%" />
            </>
          ) : (
            <>
              <div style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                color: idx === 0 ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                marginBottom: '0.375rem',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {card.name}
              </div>
              <div style={{
                fontSize: '1rem',
                fontWeight: 700,
                color: card.returnPct >= 0 ? 'var(--color-success)' : 'var(--color-danger)',
              }}>
                {fmtPct(card.returnPct)} ({period})
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Performance Chart ────────────────────────────────────────────────────────

function PerformanceChart({ data, isLoading }: { data?: HistoryPoint[]; isLoading: boolean }) {
  return (
    <Card padding="lg">
      {isLoading ? (
        <Skeleton height={220} width="100%" />
      ) : (
        <>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data ?? []} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
                tickFormatter={fmtDate}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
                tickFormatter={(v: number) => fmtCurrency(v)}
                width={72}
              />
              <Tooltip
                formatter={(value: number) => [fmtCurrency(value), 'Portfolio Value']}
                labelFormatter={(label: string) => fmtDate(label)}
                contentStyle={{
                  backgroundColor: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.8125rem',
                }}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#E5622A"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
          <div style={{
            textAlign: 'center',
            marginTop: '0.375rem',
            fontSize: '0.6875rem',
            fontWeight: 600,
            letterSpacing: '0.06em',
            color: 'var(--color-text-muted)',
          }}>
            SIMULATED PERFORMANCE
          </div>
        </>
      )}
    </Card>
  );
}

// ─── Ticker Avatar ────────────────────────────────────────────────────────────

function TickerAvatar({ ticker, positive }: { ticker: string; positive: boolean }) {
  return (
    <div style={{
      width: 36,
      height: 36,
      borderRadius: 'var(--radius-full)',
      backgroundColor: positive ? 'var(--color-success-light)' : 'var(--color-danger-light)',
      border: `1.5px solid ${positive ? 'var(--color-success)' : 'var(--color-danger)'}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '0.625rem',
      fontWeight: 800,
      color: positive ? 'var(--color-success)' : 'var(--color-danger)',
      flexShrink: 0,
      letterSpacing: '-0.02em',
    }}>
      {ticker.slice(0, 4)}
    </div>
  );
}

// ─── Pending Lots Card ────────────────────────────────────────────────────────

function PendingLotsCard({ lots }: { lots: PendingLot[] }) {
  const queryClient = useQueryClient();

  const confirmMutation = useMutation({
    mutationFn: (lotId: string) =>
      api.post(`/investments/lots/${lotId}/confirm`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investments-holdings'] });
      queryClient.invalidateQueries({ queryKey: ['investments-pending'] });
      notify.success('Purchase confirmed');
    },
    onError: () => notify.error('Failed to confirm purchase'),
  });

  const skipMutation = useMutation({
    mutationFn: (lotId: string) =>
      api.post(`/investments/lots/${lotId}/skip`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investments-pending'] });
      notify.success('Purchase skipped');
    },
    onError: () => notify.error('Failed to skip purchase'),
  });

  if (lots.length === 0) return null;

  return (
    <div style={{
      backgroundColor: 'var(--color-surface)',
      border: '1px solid var(--color-warning, #f59e0b)',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
    }}>
      <div style={{
        backgroundColor: 'rgba(245,158,11,0.12)',
        padding: '0.625rem 1rem',
        fontWeight: 600,
        fontSize: '0.875rem',
        color: '#b45309',
        borderBottom: '1px solid rgba(245,158,11,0.3)',
      }}>
        {lots.length} pending purchase{lots.length !== 1 ? 's' : ''} to review
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
          <thead>
            <tr>
              {['Ticker', 'Date', 'Shares', 'Price/Share', 'Total', ''].map((h) => (
                <th key={h} style={{
                  textAlign: h === '' ? 'right' : h === 'Ticker' ? 'left' : 'right',
                  padding: '0.5rem 0.75rem',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: 'var(--color-text-secondary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  borderBottom: '1px solid var(--color-border)',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lots.map((lot) => (
              <tr key={lot.id}
                style={{ transition: 'background 0.1s' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = 'var(--color-surface-hover)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = 'transparent'; }}
              >
                <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)' }}>
                  <span style={{ fontFamily: 'monospace' }}>{lot.ticker}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginLeft: '0.375rem' }}>{lot.name}</span>
                </td>
                <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                  {fmtDateFull(lot.date)}
                </td>
                <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontSize: '0.8125rem', color: 'var(--color-text)' }}>
                  {lot.shares.toLocaleString('en-US', { maximumFractionDigits: 5 })}
                </td>
                <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontSize: '0.8125rem', color: 'var(--color-text)' }}>
                  {fmtCurrency(lot.pricePerShare)}
                </td>
                <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text)' }}>
                  {fmtCurrency(lot.shares * lot.pricePerShare)}
                </td>
                <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: '0.375rem', justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => confirmMutation.mutate(lot.id)}
                      disabled={confirmMutation.isPending}
                      style={{
                        padding: '0.25rem 0.625rem',
                        borderRadius: 'var(--radius-sm)',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        backgroundColor: 'var(--color-success)',
                        color: '#fff',
                      }}
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => skipMutation.mutate(lot.id)}
                      disabled={skipMutation.isPending}
                      style={{
                        padding: '0.25rem 0.625rem',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--color-border)',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        backgroundColor: 'transparent',
                        color: 'var(--color-text-secondary)',
                      }}
                    >
                      Skip
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Expanded Holding Row ─────────────────────────────────────────────────────

function ExpandedHolding({
  holding,
  onAddLot,
  onSetRecurring,
}: {
  holding: Holding;
  onAddLot: () => void;
  onSetRecurring: () => void;
}) {
  const queryClient = useQueryClient();

  const deleteLotMutation = useMutation({
    mutationFn: (lotId: string) =>
      api.delete(`/investments/lots/${lotId}`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investments-holdings'] });
      notify.success('Lot deleted');
    },
    onError: () => notify.error('Failed to delete lot'),
  });

  const { data: schedules } = useQuery<RecurringSchedule[]>({
    queryKey: ['investments-recurring', holding.id],
    queryFn: () =>
      api.get(`/investments/holdings/${holding.id}/recurring`).then((r) => r.data),
  });

  const toggleScheduleMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.put(`/investments/recurring/${id}`, { status }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investments-recurring', holding.id] });
      notify.success('Schedule updated');
    },
    onError: () => notify.error('Failed to update schedule'),
  });

  const deleteScheduleMutation = useMutation({
    mutationFn: (id: string) =>
      api.delete(`/investments/recurring/${id}`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investments-recurring', holding.id] });
      notify.success('Schedule deleted');
    },
    onError: () => notify.error('Failed to delete schedule'),
  });

  const confirmedLots = holding.lots.filter((l) => l.status === 'confirmed');

  return (
    <div style={{
      padding: '1rem 1.25rem',
      backgroundColor: 'var(--color-surface-hover)',
      borderTop: '1px solid var(--color-border)',
    }}>
      {/* Lots table */}
      {confirmedLots.length > 0 && (
        <div style={{ marginBottom: '1rem', overflowX: 'auto' }}>
          <div style={{
            fontSize: '0.75rem',
            fontWeight: 600,
            color: 'var(--color-text-secondary)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            marginBottom: '0.5rem',
          }}>
            Purchase Lots
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 420 }}>
            <thead>
              <tr>
                {['Date', 'Shares', 'Price/Share', 'Total Cost', ''].map((h) => (
                  <th key={h} style={{
                    textAlign: h === 'Date' || h === '' ? (h === '' ? 'right' : 'left') : 'right',
                    padding: '0.25rem 0.5rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: 'var(--color-text-secondary)',
                    borderBottom: '1px solid var(--color-border)',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {confirmedLots.map((lot) => (
                <tr key={lot.id}>
                  <td style={{ padding: '0.375rem 0.5rem', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                    {fmtDateFull(lot.date)}
                  </td>
                  <td style={{ padding: '0.375rem 0.5rem', textAlign: 'right', fontSize: '0.8125rem', color: 'var(--color-text)' }}>
                    {lot.shares.toLocaleString('en-US', { maximumFractionDigits: 5 })}
                  </td>
                  <td style={{ padding: '0.375rem 0.5rem', textAlign: 'right', fontSize: '0.8125rem', color: 'var(--color-text)' }}>
                    {fmtCurrency(lot.pricePerShare)}
                  </td>
                  <td style={{ padding: '0.375rem 0.5rem', textAlign: 'right', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text)' }}>
                    {fmtCurrency(lot.shares * lot.pricePerShare)}
                  </td>
                  <td style={{ padding: '0.375rem 0.5rem', textAlign: 'right' }}>
                    <button
                      onClick={() => deleteLotMutation.mutate(lot.id)}
                      disabled={deleteLotMutation.isPending}
                      title="Delete lot"
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--color-text-muted)',
                        padding: '0.125rem',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <Button size="sm" variant="secondary" icon={<Plus size={13} />} onClick={onAddLot}>
          Add Purchase
        </Button>
        <Button size="sm" variant="secondary" icon={<RefreshCw size={13} />} onClick={onSetRecurring}>
          Set Recurring
        </Button>
      </div>

      {/* Recurring schedules */}
      {schedules && schedules.length > 0 && (
        <div style={{ marginTop: '0.75rem' }}>
          <div style={{
            fontSize: '0.75rem',
            fontWeight: 600,
            color: 'var(--color-text-secondary)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            marginBottom: '0.5rem',
          }}>
            Recurring Schedules
          </div>
          {schedules.map((s) => (
            <div
              key={s.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.5rem 0.75rem',
                backgroundColor: 'var(--color-surface)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                marginBottom: '0.375rem',
                flexWrap: 'wrap',
              }}
            >
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text)' }}>
                {fmtCurrency(s.amount)}/{s.frequency}
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                Next: {fmtDateFull(s.nextRunAt)}
              </span>
              <span style={{
                fontSize: '0.6875rem',
                fontWeight: 600,
                padding: '0.125rem 0.375rem',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: s.status === 'active' ? 'var(--color-success-light)' : 'var(--color-surface-hover)',
                color: s.status === 'active' ? 'var(--color-success)' : 'var(--color-text-muted)',
              }}>
                {s.status}
              </span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.375rem' }}>
                <button
                  onClick={() => toggleScheduleMutation.mutate({ id: s.id, status: s.status === 'active' ? 'paused' : 'active' })}
                  style={{
                    padding: '0.2rem 0.5rem',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--color-border)',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    backgroundColor: 'transparent',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  {s.status === 'active' ? 'Pause' : 'Resume'}
                </button>
                <button
                  onClick={() => deleteScheduleMutation.mutate(s.id)}
                  style={{
                    padding: '0.2rem',
                    borderRadius: 'var(--radius-sm)',
                    border: 'none',
                    cursor: 'pointer',
                    backgroundColor: 'transparent',
                    color: 'var(--color-text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Holdings Table ───────────────────────────────────────────────────────────

const TABLE_HEADERS = ['', 'Security', 'Ticker', 'Shares', 'Avg Cost', 'Price', 'Value', 'Day Change', 'Total Return'];

function HoldingsTable({
  data,
  isLoading,
}: {
  data?: HoldingsData;
  isLoading: boolean;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addLotHolding, setAddLotHolding] = useState<Holding | null>(null);
  const [recurringHolding, setRecurringHolding] = useState<Holding | null>(null);

  const sorted = [...(data?.holdings ?? [])].sort((a, b) => b.currentValue - a.currentValue);

  function toggleRow(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  return (
    <>
      <Card padding="lg">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 740 }}>
            <thead>
              <tr>
                {TABLE_HEADERS.map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: h === 'Security' || h === '' ? 'left' : 'right',
                      padding: '0 0.75rem 0.625rem',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: 'var(--color-text-secondary)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      borderBottom: '1px solid var(--color-border)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 4 }, (_, i) => (
                  <tr key={i}>
                    <td colSpan={9} style={{ padding: 0 }}>
                      <SkeletonRow />
                    </td>
                  </tr>
                ))
              ) : sorted.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{
                    padding: '2rem',
                    textAlign: 'center',
                    color: 'var(--color-text-muted)',
                    fontSize: '0.875rem',
                  }}>
                    No holdings yet. Add your first holding above.
                  </td>
                </tr>
              ) : (
                sorted.flatMap((h) => {
                  const isExpanded = expandedId === h.id;
                  const rows = [
                    <tr
                      key={h.id}
                      style={{ transition: 'background 0.1s', cursor: 'pointer' }}
                      onClick={() => toggleRow(h.id)}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = 'var(--color-surface-hover)'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = 'transparent'; }}
                    >
                      <td style={{ padding: '0.625rem 0.5rem 0.625rem 0.75rem', width: 24 }}>
                        {isExpanded
                          ? <ChevronDown size={14} style={{ color: 'var(--color-text-secondary)' }} />
                          : <ChevronRight size={14} style={{ color: 'var(--color-text-secondary)' }} />}
                      </td>
                      <td style={{ padding: '0.625rem 0.75rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                          <TickerAvatar ticker={h.ticker} positive={h.dayChange >= 0} />
                          <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text)', whiteSpace: 'nowrap' }}>
                            {h.name}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '0.625rem 0.75rem', textAlign: 'right' }}>
                        <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-secondary)', fontFamily: 'monospace' }}>
                          {h.ticker}
                        </span>
                      </td>
                      <td style={{ padding: '0.625rem 0.75rem', textAlign: 'right', fontSize: '0.8125rem', color: 'var(--color-text)' }}>
                        {h.shares.toLocaleString('en-US', { maximumFractionDigits: 4 })}
                      </td>
                      <td style={{ padding: '0.625rem 0.75rem', textAlign: 'right', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                        {fmtCurrency(h.avgCostBasis)}
                      </td>
                      <td style={{ padding: '0.625rem 0.75rem', textAlign: 'right', fontSize: '0.8125rem', color: 'var(--color-text)' }}>
                        {fmtCurrency(h.currentPrice)}
                      </td>
                      <td style={{ padding: '0.625rem 0.75rem', textAlign: 'right', fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text)' }}>
                        {fmtCurrency(h.currentValue)}
                      </td>
                      <td style={{ padding: '0.625rem 0.75rem', textAlign: 'right' }}>
                        <GainBadge amount={h.dayChange} pct={h.dayChangePercent} />
                      </td>
                      <td style={{ padding: '0.625rem 0.75rem', textAlign: 'right' }}>
                        <GainBadge amount={h.gain} pct={h.gainPercent} showArrow={false} />
                      </td>
                    </tr>,
                  ];

                  if (isExpanded) {
                    rows.push(
                      <tr key={`${h.id}-expanded`}>
                        <td colSpan={9} style={{ padding: 0 }}>
                          <ExpandedHolding
                            holding={h}
                            onAddLot={() => { setAddLotHolding(h); }}
                            onSetRecurring={() => { setRecurringHolding(h); }}
                          />
                        </td>
                      </tr>,
                    );
                  }

                  return rows;
                })
              )}
            </tbody>
            {!isLoading && data && sorted.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--color-border)' }}>
                  <td colSpan={5} style={{ padding: '0.625rem 0.75rem', fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                    Total
                  </td>
                  <td />
                  <td style={{ padding: '0.625rem 0.75rem', textAlign: 'right', fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text)' }}>
                    {fmtCurrency(data.totalValue)}
                  </td>
                  <td />
                  <td style={{ padding: '0.625rem 0.75rem', textAlign: 'right' }}>
                    <GainBadge amount={data.totalGain} pct={data.totalGainPercent} showArrow={false} />
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>

      {addLotHolding && (
        <AddLotModal
          open
          holding={addLotHolding}
          onClose={() => setAddLotHolding(null)}
        />
      )}
      {recurringHolding && (
        <RecurringModal
          open
          holding={recurringHolding}
          onClose={() => setRecurringHolding(null)}
        />
      )}
    </>
  );
}

// ─── Allocation Donut Chart ───────────────────────────────────────────────────

function AllocationDonut({ data, isLoading }: { data?: AllocationData; isLoading: boolean }) {
  if (isLoading) return <Skeleton height={320} width="100%" />;
  if (!data) return null;

  const segments = data.byAssetClass;

  return (
    <Card padding="lg">
      <div style={{ display: 'flex', gap: '2rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <ResponsiveContainer width={260} height={260}>
            <PieChart>
              <Pie
                data={segments}
                dataKey="value"
                nameKey="assetClass"
                cx="50%"
                cy="50%"
                innerRadius={100}
                outerRadius={125}
                paddingAngle={2}
                strokeWidth={0}
              >
                {segments.map((_, idx) => (
                  <Cell key={idx} fill={ALLOCATION_COLORS[idx % ALLOCATION_COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
            pointerEvents: 'none',
          }}>
            <div style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-text)', lineHeight: 1.2 }}>
              {fmtCurrency(data.totalValue)}
            </div>
            <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', marginTop: '0.125rem' }}>
              Total
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem', flex: 1, minWidth: 180 }}>
          {segments.map((seg, idx) => (
            <div key={seg.assetClass} style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
              <div style={{
                width: 10,
                height: 10,
                borderRadius: 'var(--radius-full)',
                backgroundColor: ALLOCATION_COLORS[idx % ALLOCATION_COLORS.length],
                flexShrink: 0,
              }} />
              <span style={{ fontSize: '0.8125rem', color: 'var(--color-text)', flex: 1, whiteSpace: 'nowrap' }}>
                {seg.assetClass}
              </span>
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text)', whiteSpace: 'nowrap' }}>
                {fmtCurrency(seg.value)}
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', width: 44, textAlign: 'right' }}>
                {seg.percent.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

// ─── Allocation Holdings Breakdown ───────────────────────────────────────────

function AllocationTable({ data, isLoading }: { data?: AllocationData; isLoading: boolean }) {
  return (
    <Card padding="lg">
      <div style={{
        fontSize: '0.75rem',
        fontWeight: 600,
        color: 'var(--color-text-secondary)',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        marginBottom: '0.875rem',
      }}>
        Holdings Breakdown
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Security', 'Type', 'Value', '% of Portfolio'].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: h === 'Security' || h === 'Type' ? 'left' : 'right',
                    padding: '0 0.75rem 0.5rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: 'var(--color-text-secondary)',
                    borderBottom: '1px solid var(--color-border)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }, (_, i) => (
                <tr key={i}>
                  <td colSpan={4} style={{ padding: '0.5rem 0' }}>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                      <Skeleton height={13} width="20%" />
                      <Skeleton height={13} width="25%" />
                      <Skeleton height={13} width="20%" />
                      <Skeleton height={13} width="15%" />
                    </div>
                  </td>
                </tr>
              ))
            ) : (data?.holdings ?? []).map((h) => (
              <tr
                key={h.ticker}
                onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = 'var(--color-surface-hover)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = 'transparent'; }}
                style={{ transition: 'background 0.1s' }}
              >
                <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)' }}>
                  {h.ticker}
                </td>
                <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                  {h.type}
                </td>
                <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text)' }}>
                  {fmtCurrency(h.value)}
                </td>
                <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                  {h.percent.toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ─── Add Holding Modal ────────────────────────────────────────────────────────

interface AddHoldingForm {
  ticker: string;
  name: string;
  shares: string;
  pricePerShare: string;
  accountId: string;
}

const EMPTY_HOLDING_FORM: AddHoldingForm = {
  ticker: '',
  name: '',
  shares: '',
  pricePerShare: '',
  accountId: '',
};

function AddHoldingModal({
  open,
  onClose,
  accounts,
}: {
  open: boolean;
  onClose: () => void;
  accounts: InvestmentAccount[];
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<AddHoldingForm>(EMPTY_HOLDING_FORM);
  const [errors, setErrors] = useState<Partial<AddHoldingForm>>({});
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quotePriceHint, setQuotePriceHint] = useState<string | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-fill name from ticker
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const ticker = form.ticker.trim().toUpperCase();
    if (ticker.length < 1) {
      setQuotePriceHint(null);
      setQuoteError(null);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setQuoteLoading(true);
      setQuoteError(null);
      try {
        const res = await api.get(`/investments/quote/${ticker}`);
        const q = res.data;
        setForm((prev) => ({ ...prev, name: q.shortName || prev.name }));
        setQuotePriceHint(`Live price: ${fmtCurrency(q.price)}`);
      } catch {
        setQuotePriceHint(null);
        setQuoteError('Ticker not found');
      } finally {
        setQuoteLoading(false);
      }
    }, 600);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [form.ticker]);

  const mutation = useMutation({
    mutationFn: (payload: object) =>
      api.post('/investments/holdings', payload).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investments-holdings'] });
      queryClient.invalidateQueries({ queryKey: ['investments-allocation'] });
      notify.success('Holding added');
      setForm(EMPTY_HOLDING_FORM);
      setQuotePriceHint(null);
      setQuoteError(null);
      onClose();
    },
    onError: () => {
      notify.error('Failed to add holding');
    },
  });

  function validate(): boolean {
    const errs: Partial<AddHoldingForm> = {};
    if (!form.ticker.trim()) errs.ticker = 'Required';
    if (!form.name.trim()) errs.name = 'Required';
    if (!form.shares || isNaN(Number(form.shares)) || Number(form.shares) <= 0)
      errs.shares = 'Must be a positive number';
    if (!form.pricePerShare || isNaN(Number(form.pricePerShare)) || Number(form.pricePerShare) < 0)
      errs.pricePerShare = 'Must be a non-negative number';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;
    mutation.mutate({
      ticker: form.ticker.trim().toUpperCase(),
      name: form.name.trim(),
      shares: Number(form.shares),
      pricePerShare: Number(form.pricePerShare),
      accountId: form.accountId || undefined,
    });
  }

  function field(key: keyof AddHoldingForm) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Holding" size="md">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <Input
            label="Ticker Symbol"
            placeholder="e.g. VTI"
            value={form.ticker}
            onChange={field('ticker')}
            error={errors.ticker}
          />
          {quoteLoading && (
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
              Looking up ticker...
            </div>
          )}
          {!quoteLoading && quotePriceHint && (
            <div style={{ fontSize: '0.75rem', color: 'var(--color-success)', marginTop: '0.25rem' }}>
              {quotePriceHint}
            </div>
          )}
          {!quoteLoading && quoteError && (
            <div style={{ fontSize: '0.75rem', color: 'var(--color-danger)', marginTop: '0.25rem' }}>
              {quoteError}
            </div>
          )}
        </div>
        <Input
          label="Security Name"
          placeholder="e.g. Vanguard Total Market ETF"
          value={form.name}
          onChange={field('name')}
          error={errors.name}
        />
        <Input
          label="Shares"
          type="number"
          placeholder="e.g. 45"
          min="0"
          step="any"
          value={form.shares}
          onChange={field('shares')}
          error={errors.shares}
        />
        <Input
          label="Purchase Price per Share"
          type="number"
          placeholder="e.g. 210.00"
          min="0"
          step="any"
          value={form.pricePerShare}
          onChange={field('pricePerShare')}
          error={errors.pricePerShare}
        />
        {accounts.length > 0 && (
          <Select
            label="Account (optional)"
            value={form.accountId}
            onChange={(e) => setForm((prev) => ({ ...prev, accountId: e.target.value }))}
            options={[
              { value: '', label: 'No specific account' },
              ...accounts.map((a) => ({ value: a.id, label: a.name })),
            ]}
          />
        )}
      </div>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} loading={mutation.isPending}>Add Holding</Button>
      </ModalFooter>
    </Modal>
  );
}

// ─── Add Lot Modal ────────────────────────────────────────────────────────────

interface AddLotForm {
  date: string;
  shares: string;
  pricePerShare: string;
  note: string;
}

function AddLotModal({
  open,
  holding,
  onClose,
}: {
  open: boolean;
  holding: Holding;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState<AddLotForm>({ date: today, shares: '', pricePerShare: '', note: '' });
  const [errors, setErrors] = useState<Partial<AddLotForm>>({});

  const mutation = useMutation({
    mutationFn: (payload: object) =>
      api.post(`/investments/holdings/${holding.id}/lots`, payload).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investments-holdings'] });
      notify.success('Purchase added');
      setForm({ date: today, shares: '', pricePerShare: '', note: '' });
      onClose();
    },
    onError: () => notify.error('Failed to add purchase'),
  });

  function validate(): boolean {
    const errs: Partial<AddLotForm> = {};
    if (!form.shares || isNaN(Number(form.shares)) || Number(form.shares) <= 0)
      errs.shares = 'Must be a positive number';
    if (!form.pricePerShare || isNaN(Number(form.pricePerShare)) || Number(form.pricePerShare) < 0)
      errs.pricePerShare = 'Must be a non-negative number';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;
    mutation.mutate({
      date: form.date,
      shares: Number(form.shares),
      pricePerShare: Number(form.pricePerShare),
      note: form.note.trim() || undefined,
    });
  }

  return (
    <Modal open={open} onClose={onClose} title={`Add Purchase — ${holding.ticker}`} size="sm">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <Input
          label="Date"
          type="date"
          value={form.date}
          onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
        />
        <Input
          label="Shares"
          type="number"
          placeholder="e.g. 10"
          min="0"
          step="any"
          value={form.shares}
          onChange={(e) => setForm((p) => ({ ...p, shares: e.target.value }))}
          error={errors.shares}
        />
        <Input
          label="Price per Share"
          type="number"
          placeholder="e.g. 215.00"
          min="0"
          step="any"
          value={form.pricePerShare}
          onChange={(e) => setForm((p) => ({ ...p, pricePerShare: e.target.value }))}
          error={errors.pricePerShare}
        />
        <Input
          label="Note (optional)"
          placeholder="e.g. Dividend reinvestment"
          value={form.note}
          onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
        />
      </div>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} loading={mutation.isPending}>Add Purchase</Button>
      </ModalFooter>
    </Modal>
  );
}

// ─── Recurring Modal ──────────────────────────────────────────────────────────

interface RecurringForm {
  amount: string;
  frequency: string;
  dayOfMonth: string;
}

function RecurringModal({
  open,
  holding,
  onClose,
}: {
  open: boolean;
  holding: Holding;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<RecurringForm>({ amount: '', frequency: 'monthly', dayOfMonth: '1' });
  const [errors, setErrors] = useState<Partial<RecurringForm>>({});

  const { data: schedules, isLoading: schedulesLoading } = useQuery<RecurringSchedule[]>({
    queryKey: ['investments-recurring', holding.id],
    queryFn: () =>
      api.get(`/investments/holdings/${holding.id}/recurring`).then((r) => r.data),
    enabled: open,
  });

  const createMutation = useMutation({
    mutationFn: (payload: object) =>
      api.post(`/investments/holdings/${holding.id}/recurring`, payload).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investments-recurring', holding.id] });
      notify.success('Recurring schedule created');
      setForm({ amount: '', frequency: 'monthly', dayOfMonth: '1' });
    },
    onError: () => notify.error('Failed to create schedule'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      api.delete(`/investments/recurring/${id}`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investments-recurring', holding.id] });
      notify.success('Schedule deleted');
    },
    onError: () => notify.error('Failed to delete schedule'),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.put(`/investments/recurring/${id}`, { status }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investments-recurring', holding.id] });
      notify.success('Schedule updated');
    },
    onError: () => notify.error('Failed to update schedule'),
  });

  function validate(): boolean {
    const errs: Partial<RecurringForm> = {};
    if (!form.amount || isNaN(Number(form.amount)) || Number(form.amount) <= 0)
      errs.amount = 'Must be a positive amount';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleCreate() {
    if (!validate()) return;
    createMutation.mutate({
      amount: Number(form.amount),
      frequency: form.frequency,
      dayOfMonth: ['monthly', 'quarterly'].includes(form.frequency) ? Number(form.dayOfMonth) : undefined,
    });
  }

  const showDayOfMonth = ['monthly', 'quarterly'].includes(form.frequency);

  return (
    <Modal open={open} onClose={onClose} title={`Recurring Buys — ${holding.ticker}`} size="md">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* Existing schedules */}
        {schedulesLoading ? (
          <Skeleton height={48} width="100%" />
        ) : schedules && schedules.length > 0 ? (
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.5rem' }}>
              Active Schedules
            </div>
            {schedules.map((s) => (
              <div key={s.id} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.5rem 0.75rem',
                backgroundColor: 'var(--color-surface-hover)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                marginBottom: '0.375rem',
                flexWrap: 'wrap',
              }}>
                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)' }}>
                  {fmtCurrency(s.amount)} / {s.frequency}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                  Next: {fmtDateFull(s.nextRunAt)}
                </span>
                <span style={{
                  fontSize: '0.6875rem',
                  fontWeight: 600,
                  padding: '0.125rem 0.375rem',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: s.status === 'active' ? 'var(--color-success-light)' : 'var(--color-surface-hover)',
                  color: s.status === 'active' ? 'var(--color-success)' : 'var(--color-text-muted)',
                }}>
                  {s.status}
                </span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.375rem' }}>
                  <button
                    onClick={() => toggleMutation.mutate({ id: s.id, status: s.status === 'active' ? 'paused' : 'active' })}
                    style={{ padding: '0.2rem 0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', cursor: 'pointer', fontSize: '0.75rem', backgroundColor: 'transparent', color: 'var(--color-text-secondary)' }}
                  >
                    {s.status === 'active' ? 'Pause' : 'Resume'}
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate(s.id)}
                    style={{ padding: '0.2rem', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer', backgroundColor: 'transparent', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center' }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {/* Create new schedule */}
        <div style={{ borderTop: schedules && schedules.length > 0 ? '1px solid var(--color-border)' : 'none', paddingTop: schedules && schedules.length > 0 ? '1rem' : 0 }}>
          {schedules && schedules.length > 0 && (
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.75rem' }}>
              Add New Schedule
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <Input
              label="Amount ($)"
              type="number"
              placeholder="e.g. 500"
              min="0"
              step="any"
              value={form.amount}
              onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
              error={errors.amount}
            />
            <Select
              label="Frequency"
              value={form.frequency}
              onChange={(e) => setForm((p) => ({ ...p, frequency: e.target.value }))}
              options={[
                { value: 'weekly', label: 'Weekly' },
                { value: 'biweekly', label: 'Bi-weekly' },
                { value: 'monthly', label: 'Monthly' },
                { value: 'quarterly', label: 'Quarterly' },
              ]}
            />
            {showDayOfMonth && (
              <Input
                label="Day of Month (1-28)"
                type="number"
                min="1"
                max="28"
                value={form.dayOfMonth}
                onChange={(e) => setForm((p) => ({ ...p, dayOfMonth: e.target.value }))}
              />
            )}
          </div>
        </div>
      </div>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>Close</Button>
        <Button onClick={handleCreate} loading={createMutation.isPending}>Create Schedule</Button>
      </ModalFooter>
    </Modal>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function InvestmentsPage() {
  const [tab, setTab] = useState<'holdings' | 'allocation'>('holdings');
  const [period, setPeriod] = useState<Period>('1Y');
  const [accountId, setAccountId] = useState<string | undefined>();
  const [addOpen, setAddOpen] = useState(false);

  const { data: holdingsData, isLoading: holdingsLoading } = useQuery<HoldingsData>({
    queryKey: ['investments-holdings', accountId],
    queryFn: () =>
      api
        .get(`/investments/holdings${accountId ? `?accountId=${accountId}` : ''}`)
        .then((r) => r.data),
  });

  const { data: allocationData, isLoading: allocationLoading } = useQuery<AllocationData>({
    queryKey: ['investments-allocation'],
    queryFn: () => api.get('/investments/allocation').then((r) => r.data),
    enabled: tab === 'allocation',
  });

  const { data: performanceData, isLoading: performanceLoading } = useQuery<PerformanceData>({
    queryKey: ['investments-performance', period],
    queryFn: () =>
      api.get(`/investments/performance?period=${period}`).then((r) => r.data),
  });

  const { data: pendingLots } = useQuery<PendingLot[]>({
    queryKey: ['investments-pending'],
    queryFn: () => api.get('/investments/pending').then((r) => r.data),
    refetchInterval: 60_000,
  });

  const { data: accountsData } = useQuery<AccountsResponse>({
    queryKey: ['investments-accounts'],
    queryFn: () => api.get('/accounts?type=investment').then((r) => r.data),
  });

  const accounts: InvestmentAccount[] = accountsData?.groups?.flatMap((g) => g.accounts) ?? [];

  const accountOptions = [
    { value: '', label: 'All accounts' },
    ...accounts.map((a) => ({ value: a.id, label: a.name })),
  ];

  return (
    <div style={{ padding: '1rem 0', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <h1 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--color-text)', margin: 0, flex: '0 0 auto' }}>
          Investments
        </h1>

        <TabToggle value={tab} onChange={setTab} />

        <div style={{ flex: 1 }} />

        <PeriodToggle value={period} onChange={setPeriod} />

        {accounts.length > 0 && (
          <select
            value={accountId ?? ''}
            onChange={(e) => setAccountId(e.target.value || undefined)}
            style={{
              padding: '0.375rem 2rem 0.375rem 0.625rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-text)',
              fontSize: '0.8125rem',
              cursor: 'pointer',
              appearance: 'none',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236c757d' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 0.5rem center',
            }}
          >
            {accountOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        )}

        <Button
          size="sm"
          icon={<Plus size={14} />}
          onClick={() => setAddOpen(true)}
        >
          Add Holding
        </Button>
      </div>

      {/* Pending lots banner */}
      {pendingLots && pendingLots.length > 0 && (
        <PendingLotsCard lots={pendingLots} />
      )}

      {/* Holdings Tab */}
      {tab === 'holdings' && (
        <>
          <PerformanceCards
            performanceData={performanceData}
            period={period}
            isLoading={performanceLoading}
          />
          <PerformanceChart
            data={performanceData?.history}
            isLoading={performanceLoading}
          />
          <HoldingsTable data={holdingsData} isLoading={holdingsLoading} />
        </>
      )}

      {/* Allocation Tab */}
      {tab === 'allocation' && (
        <>
          <AllocationDonut data={allocationData} isLoading={allocationLoading} />
          <AllocationTable data={allocationData} isLoading={allocationLoading} />
        </>
      )}

      {/* Add Holding Modal */}
      <AddHoldingModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        accounts={accounts}
      />
    </div>
  );
}
