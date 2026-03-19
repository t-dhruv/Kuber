import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { Plus } from 'lucide-react';
import { api } from '@/lib/api';
import {
  Card, CardDivider, Skeleton, Button, Modal, ModalFooter, Input, Select, notify,
} from '@/components/ui';

// ─── Formatters ───────────────────────────────────────────────────────────────

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

// ─── Types ────────────────────────────────────────────────────────────────────

interface Holding {
  id: string;
  name: string;
  ticker: string;
  shares: number;
  price: number;
  value: number;
  dayChange: number;
  dayChangePct: number;
  totalReturn: number;
  totalReturnPct: number;
  accountId?: string;
}

interface HoldingsData {
  holdings: Holding[];
  totalValue: number;
  totalGain: number;
  totalReturnPct: number;
}

interface AllocationSegment {
  assetClass: string;
  value: number;
  percent: number;
}

interface AllocationData {
  segments: AllocationSegment[];
  totalValue: number;
  holdings: Array<{
    ticker: string;
    assetClass: string;
    value: number;
    percent: number;
  }>;
}

interface PerformancePoint {
  date: string;
  portfolio: number;
  sp500: number;
}

interface Benchmark {
  name: string;
  returnPct: number;
  todayPct: number;
}

interface PerformanceData {
  points: PerformancePoint[];
  benchmarks: Benchmark[];
}

interface InvestmentAccount {
  id: string;
  name: string;
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

function PerformanceCards({ benchmarks, period, isLoading }: {
  benchmarks?: Benchmark[];
  period: Period;
  isLoading: boolean;
}) {
  const cards = isLoading
    ? Array.from({ length: 4 }, (_, i) => ({ name: '', returnPct: 0, todayPct: 0, key: i }))
    : (benchmarks ?? []).map((b, i) => ({ ...b, key: i }));

  return (
    <div style={{
      display: 'flex',
      gap: '0.75rem',
      overflowX: 'auto',
      paddingBottom: '0.25rem',
    }}>
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
              <div style={{
                fontSize: '0.75rem',
                marginTop: '0.125rem',
                color: card.todayPct >= 0 ? 'var(--color-success)' : 'var(--color-danger)',
              }}>
                {card.todayPct >= 0 ? '+' : ''}{card.todayPct.toFixed(2)}% today
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Performance Chart ────────────────────────────────────────────────────────

function PerformanceChart({ data, isLoading }: { data?: PerformancePoint[]; isLoading: boolean }) {
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
                tickFormatter={(v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(0)}%`}
                width={44}
              />
              <Tooltip
                formatter={(value: number, name: string) => [
                  `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`,
                  name === 'portfolio' ? 'Your Portfolio' : 'S&P 500',
                ]}
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
                dataKey="portfolio"
                stroke="#E5622A"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="sp500"
                stroke="#0c8599"
                strokeWidth={2}
                dot={false}
                strokeDasharray="4 2"
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

// ─── Holdings Table ───────────────────────────────────────────────────────────

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

const TABLE_HEADERS = ['Security', 'Ticker', 'Shares', 'Price', 'Value', 'Day Change', 'Total Return'];

function HoldingsTable({ data, isLoading }: { data?: HoldingsData; isLoading: boolean }) {
  const sorted = [...(data?.holdings ?? [])].sort((a, b) => b.value - a.value);

  return (
    <Card padding="lg">
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
          <thead>
            <tr>
              {TABLE_HEADERS.map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: h === 'Security' ? 'left' : 'right',
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
                  <td colSpan={7} style={{ padding: 0 }}>
                    <SkeletonRow />
                  </td>
                </tr>
              ))
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={7} style={{
                  padding: '2rem',
                  textAlign: 'center',
                  color: 'var(--color-text-muted)',
                  fontSize: '0.875rem',
                }}>
                  No holdings yet. Add your first holding above.
                </td>
              </tr>
            ) : (
              sorted.map((h) => (
                <tr
                  key={h.id}
                  style={{ transition: 'background 0.1s' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = 'var(--color-surface-hover)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = 'transparent'; }}
                >
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
                  <td style={{ padding: '0.625rem 0.75rem', textAlign: 'right', fontSize: '0.8125rem', color: 'var(--color-text)' }}>
                    {fmtCurrency(h.price)}
                  </td>
                  <td style={{ padding: '0.625rem 0.75rem', textAlign: 'right', fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text)' }}>
                    {fmtCurrency(h.value)}
                  </td>
                  <td style={{ padding: '0.625rem 0.75rem', textAlign: 'right' }}>
                    <GainBadge amount={h.dayChange} pct={h.dayChangePct} />
                  </td>
                  <td style={{ padding: '0.625rem 0.75rem', textAlign: 'right' }}>
                    <GainBadge amount={h.totalReturn} pct={h.totalReturnPct} showArrow={false} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {!isLoading && data && sorted.length > 0 && (
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--color-border)' }}>
                <td colSpan={4} style={{ padding: '0.625rem 0.75rem', fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                  Total
                </td>
                <td style={{ padding: '0.625rem 0.75rem', textAlign: 'right', fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text)' }}>
                  {fmtCurrency(data.totalValue)}
                </td>
                <td />
                <td style={{ padding: '0.625rem 0.75rem', textAlign: 'right' }}>
                  <GainBadge amount={data.totalGain} pct={data.totalReturnPct} showArrow={false} />
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </Card>
  );
}

// ─── Allocation Donut Chart ───────────────────────────────────────────────────

function AllocationDonut({ data, isLoading }: { data?: AllocationData; isLoading: boolean }) {
  if (isLoading) return <Skeleton height={320} width="100%" />;
  if (!data) return null;

  return (
    <Card padding="lg">
      <div style={{ display: 'flex', gap: '2rem', alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Donut */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <ResponsiveContainer width={260} height={260}>
            <PieChart>
              <Pie
                data={data.segments}
                dataKey="value"
                nameKey="assetClass"
                cx="50%"
                cy="50%"
                innerRadius={100}
                outerRadius={125}
                paddingAngle={2}
                strokeWidth={0}
              >
                {data.segments.map((_, idx) => (
                  <Cell key={idx} fill={ALLOCATION_COLORS[idx % ALLOCATION_COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          {/* Center text */}
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

        {/* Legend */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem', flex: 1, minWidth: 180 }}>
          {data.segments.map((seg, idx) => (
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
                  {h.assetClass}
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
  costBasisPerShare: string;
  accountId: string;
}

const EMPTY_FORM: AddHoldingForm = {
  ticker: '',
  name: '',
  shares: '',
  costBasisPerShare: '',
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
  const [form, setForm] = useState<AddHoldingForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<AddHoldingForm>>({});

  const mutation = useMutation({
    mutationFn: (payload: object) =>
      api.post('/investments/holdings', payload).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investments-holdings'] });
      queryClient.invalidateQueries({ queryKey: ['investments-allocation'] });
      notify.success('Holding added');
      setForm(EMPTY_FORM);
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
    if (!form.costBasisPerShare || isNaN(Number(form.costBasisPerShare)) || Number(form.costBasisPerShare) < 0)
      errs.costBasisPerShare = 'Must be a non-negative number';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;
    mutation.mutate({
      ticker: form.ticker.trim().toUpperCase(),
      name: form.name.trim(),
      shares: Number(form.shares),
      costBasisPerShare: Number(form.costBasisPerShare),
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
        <Input
          label="Ticker Symbol"
          placeholder="e.g. VTI"
          value={form.ticker}
          onChange={field('ticker')}
          error={errors.ticker}
        />
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
          label="Cost Basis per Share"
          type="number"
          placeholder="e.g. 210.00"
          min="0"
          step="any"
          value={form.costBasisPerShare}
          onChange={field('costBasisPerShare')}
          error={errors.costBasisPerShare}
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
        .then((r) => r.data.data),
  });

  const { data: allocationData, isLoading: allocationLoading } = useQuery<AllocationData>({
    queryKey: ['investments-allocation'],
    queryFn: () => api.get('/investments/allocation').then((r) => r.data.data),
    enabled: tab === 'allocation',
  });

  const { data: performanceData, isLoading: performanceLoading } = useQuery<PerformanceData>({
    queryKey: ['investments-performance', period],
    queryFn: () =>
      api.get(`/investments/performance?period=${period}`).then((r) => r.data.data),
  });

  const { data: accountsData } = useQuery<{ accounts: InvestmentAccount[] }>({
    queryKey: ['investments-accounts'],
    queryFn: () => api.get('/accounts?type=investment').then((r) => r.data.data),
  });

  const accounts = accountsData?.accounts ?? [];

  const accountOptions = [
    { value: '', label: 'All accounts' },
    ...accounts.map((a) => ({ value: a.id, label: a.name })),
  ];

  return (
    <div style={{ padding: '1rem 0', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '0.75rem',
      }}>
        <h1 style={{
          fontSize: '1.375rem',
          fontWeight: 700,
          color: 'var(--color-text)',
          margin: 0,
          flex: '0 0 auto',
        }}>
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

      {/* Holdings Tab */}
      {tab === 'holdings' && (
        <>
          <PerformanceCards
            benchmarks={performanceData?.benchmarks}
            period={period}
            isLoading={performanceLoading}
          />
          <PerformanceChart
            data={performanceData?.points}
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
