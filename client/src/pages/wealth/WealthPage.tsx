import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Sparkles,
  Pencil,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Settings,
  Newspaper,
  Loader2,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { api } from '@/lib/api';
import { Card, CardHeader, Button, Input, Skeleton, notify } from '@/components/ui';
import type { AxiosError } from 'axios';

// ─── Types ────────────────────────────────────────────────────────────────────

type BucketType = 'needs' | 'wants' | 'savings' | 'uncategorized';

interface CategoryDetail {
  id: string;
  name: string;
  icon: string | null;
  amount: number;
}

interface BucketDetail {
  total: number;
  target: number;
  delta: number;
  pct: number;
  categories: CategoryDetail[];
}

interface IncomeData {
  monthlyNetIncome: number | null;
  autoDetected: boolean;
  updatedAt: string | null;
}

interface WealthAnalysis {
  income: number | null;
  month: string;
  targets: { needs: number; wants: number; savings: number };
  actuals: { needs: number; wants: number; savings: number };
  buckets: {
    needs: BucketDetail;
    wants: BucketDetail;
    savings: BucketDetail;
    uncategorized: BucketDetail;
  };
  alerts: Array<{ bucket: string; message: string; severity: 'danger' | 'warning' | 'info' }>;
  savingsCapacity: number;
  investmentLadder: Array<{
    step: number;
    label: string;
    description: string;
    status: 'complete' | 'inprogress' | 'todo';
    amount?: number;
  }>;
}

// ─── Formatters ───────────────────────────────────────────────────────────────

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

function getMonthLabel(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function addMonths(ym: string, delta: number) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${mm}`;
}

function todayYM() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────

function ProgressBar({ pct, color }: { pct: number; color: 'green' | 'yellow' | 'red' }) {
  const fill = Math.min(pct, 100);
  const colorClass =
    color === 'green'
      ? 'bg-[var(--color-success,#22c55e)]'
      : color === 'yellow'
      ? 'bg-[var(--color-warning,#f59e0b)]'
      : 'bg-[var(--color-danger,#ef4444)]';
  return (
    <div className="h-2 w-full rounded-full bg-[var(--color-border)]">
      <div
        className={`h-2 rounded-full transition-all ${colorClass}`}
        style={{ width: `${fill}%` }}
      />
    </div>
  );
}

// ─── Bucket status helpers ─────────────────────────────────────────────────────

function bucketColor(type: 'needs' | 'wants' | 'savings', pct: number): 'green' | 'yellow' | 'red' {
  if (type === 'savings') {
    if (pct >= 100) return 'green';
    if (pct >= 90) return 'yellow';
    return 'red';
  }
  // needs / wants: lower is better
  if (pct <= 100) return 'green';
  if (pct <= 110) return 'yellow';
  return 'red';
}

function bucketTextColor(color: 'green' | 'yellow' | 'red') {
  if (color === 'green') return 'text-[var(--color-success,#22c55e)]';
  if (color === 'yellow') return 'text-[var(--color-warning,#f59e0b)]';
  return 'text-[var(--color-danger,#ef4444)]';
}

// ─── Bucket Card ──────────────────────────────────────────────────────────────

const BUCKET_META: Record<
  'needs' | 'wants' | 'savings',
  { icon: string; label: string; targetPct: number }
> = {
  needs: { icon: '🏠', label: 'Needs', targetPct: 50 },
  wants: { icon: '🎉', label: 'Wants', targetPct: 30 },
  savings: { icon: '💰', label: 'Savings', targetPct: 20 },
};

function BucketCard({
  type,
  bucket,
  income,
}: {
  type: 'needs' | 'wants' | 'savings';
  bucket: BucketDetail;
  income: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const meta = BUCKET_META[type];
  const color = bucketColor(type, bucket.pct);
  const textColor = bucketTextColor(color);
  const isOver = type !== 'savings' ? bucket.total > bucket.target : bucket.total < bucket.target;
  const deltaLabel =
    type === 'savings'
      ? bucket.delta >= 0
        ? `▲ ${fmtCurrency(bucket.delta)} over target`
        : `▼ ${fmtCurrency(Math.abs(bucket.delta))} under target`
      : bucket.delta >= 0
      ? `▲ ${fmtCurrency(bucket.delta)} under budget`
      : `▼ ${fmtCurrency(Math.abs(bucket.delta))} over budget`;
  const deltaPositive =
    type === 'savings' ? bucket.delta >= 0 : bucket.delta >= 0;

  const topCats = bucket.categories.slice(0, expanded ? undefined : 5);
  const maxAmt = bucket.categories[0]?.amount ?? 1;

  return (
    <Card className="flex flex-col gap-3 p-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">{meta.icon}</span>
          <span className="font-semibold text-[var(--color-text)]">{meta.label}</span>
        </div>
        <span style={{ background: 'var(--color-accent-light, rgba(229,98,42,0.12))', color: 'var(--color-accent)', padding: '2px 8px', borderRadius: 'var(--radius-full)', fontSize: 12, fontWeight: 500 }}>
          {meta.targetPct}% target
        </span>
      </div>

      {/* Amounts */}
      <div>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', color: 'var(--color-text)' }}>{fmtCurrency(bucket.total)}</span>
        <span className="text-sm text-[var(--color-text-muted)]" style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}> / {fmtCurrency(bucket.target)}</span>
      </div>

      {/* Progress */}
      <ProgressBar pct={bucket.pct} color={color} />

      {/* Pct of income */}
      <div className="flex items-center justify-between text-sm">
        <span className={`font-medium ${textColor}`}>
          {bucket.pct.toFixed(1)}% of income
        </span>
        <span className={`text-xs ${deltaPositive ? 'text-[var(--color-success,#22c55e)]' : 'text-[var(--color-danger,#ef4444)]'}`}>
          {deltaLabel}
        </span>
      </div>

      {/* Category list */}
      {bucket.categories.length > 0 && (
        <div className="flex flex-col gap-1.5 pt-1 border-t border-[var(--color-border)]">
          {topCats.map((cat) => (
            <div key={cat.id} className="flex items-center gap-2 text-sm">
              <span className="w-5 text-center flex-shrink-0">{cat.icon ?? '📦'}</span>
              <span className="flex-1 truncate text-[var(--color-text-secondary)]">{cat.name}</span>
              <div className="w-20 h-1.5 rounded-full bg-[var(--color-border)] flex-shrink-0">
                <div
                  className="h-1.5 rounded-full bg-[var(--color-accent)]"
                  style={{ width: `${Math.min((cat.amount / maxAmt) * 100, 100)}%` }}
                />
              </div>
              <span className="text-xs text-[var(--color-text-muted)] w-16 text-right flex-shrink-0" style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>
                {fmtCurrency(cat.amount)}
              </span>
            </div>
          ))}
          {bucket.categories.length > 5 && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="flex items-center gap-1 text-xs text-[var(--color-accent)] hover:underline mt-1"
            >
              {expanded ? (
                <>
                  <ChevronUp size={12} /> Show less
                </>
              ) : (
                <>
                  <ChevronDown size={12} /> Show {bucket.categories.length - 5} more
                </>
              )}
            </button>
          )}
        </div>
      )}
    </Card>
  );
}

// ─── Income Row ───────────────────────────────────────────────────────────────

function IncomeSetup({
  incomeData,
  onSaved,
}: {
  incomeData: IncomeData | undefined;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (amount: number) => api.put('/wealth/income', { monthlyNetIncome: amount }),
    onSuccess: () => {
      notify.success('Income saved');
      queryClient.invalidateQueries({ queryKey: ['wealth'] });
      setEditing(false);
      onSaved();
    },
    onError: () => notify.error('Failed to save income'),
  });

  const handleSave = () => {
    const n = parseFloat(value.replace(/,/g, ''));
    if (isNaN(n) || n <= 0) {
      notify.error('Please enter a valid amount');
      return;
    }
    mutation.mutate(n);
  };

  const income = incomeData?.monthlyNetIncome ?? null;
  const autoDetected = incomeData?.autoDetected ?? false;

  if (editing) {
    return (
      <div className="flex items-center gap-3 px-5 py-3 bg-[var(--color-surface-hover)] rounded-[var(--radius-md)]">
        <span className="text-sm text-[var(--color-text-muted)]">Monthly take-home: $</span>
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. 5000"
          className="w-40"
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          autoFocus
        />
        <Button size="sm" onClick={handleSave} loading={mutation.isPending}>
          <Check size={14} />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
          <X size={14} />
        </Button>
      </div>
    );
  }

  if (income !== null) {
    return (
      <div className="flex items-center gap-3 px-5 py-3 bg-[var(--color-surface-hover)] rounded-[var(--radius-md)] text-sm">
        <span className="text-[var(--color-text-muted)]">Monthly take-home:</span>
        <span className="font-semibold text-[var(--color-text)]">{fmtCurrency(income)}/mo</span>
        {autoDetected && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
            Auto-detected from last month
          </span>
        )}
        <button
          onClick={() => {
            setValue(String(income));
            setEditing(true);
          }}
          className="ml-auto flex items-center gap-1 text-xs text-[var(--color-accent)] hover:underline"
        >
          <Pencil size={12} /> Override
        </button>
      </div>
    );
  }

  // Cannot detect — no previous month income transactions
  return (
    <Card className="p-5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <p className="font-semibold text-[var(--color-text)]">Set your monthly take-home income</p>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
            No income transactions found from last month. Enter your monthly take-home pay to unlock your strategy.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-sm text-[var(--color-text-muted)]">$</span>
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="e.g. 5000"
            className="w-40"
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          />
          <Button onClick={handleSave} loading={mutation.isPending}>
            Save
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ─── Alerts Section ───────────────────────────────────────────────────────────

function AlertsSection({ alerts }: { alerts: WealthAnalysis['alerts'] }) {
  if (!alerts.length) return null;
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
        Alerts
      </h2>
      {alerts.map((alert, i) => (
        <div
          key={i}
          className={`flex items-start gap-3 px-4 py-3 rounded-[var(--radius-md)] border ${
            alert.severity === 'danger'
              ? 'border-[var(--color-danger,#ef4444)] bg-red-50 dark:bg-red-950/20'
              : alert.severity === 'warning'
              ? 'border-[var(--color-warning,#f59e0b)] bg-amber-50 dark:bg-amber-950/20'
              : 'border-[var(--color-border)] bg-[var(--color-surface-hover)]'
          }`}
        >
          <span className="text-lg flex-shrink-0">
            {alert.severity === 'danger' ? '🔴' : '⚠️'}
          </span>
          <p className="text-sm text-[var(--color-text)]">{alert.message}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Where to Cut ─────────────────────────────────────────────────────────────

function WhereToCut({ analysis }: { analysis: WealthAnalysis }) {
  // Collect over-budget categories from needs + wants buckets
  const { needs, wants } = analysis.buckets;
  const allCats = [
    ...needs.categories.map((c) => ({ ...c, bucket: 'Needs' })),
    ...wants.categories.map((c) => ({ ...c, bucket: 'Wants' })),
  ];

  // Only show if their bucket is over budget
  const needsOver = needs.total > needs.target;
  const wantsOver = wants.total > wants.target;

  const candidates = allCats.filter(
    (c) => (c.bucket === 'Needs' && needsOver) || (c.bucket === 'Wants' && wantsOver)
  );

  if (!candidates.length || (!needsOver && !wantsOver)) return null;

  // Rough overage per category: proportional share of bucket delta
  const withOverage = candidates
    .map((c) => {
      const bucket = c.bucket === 'Needs' ? needs : wants;
      const share = bucket.total > 0 ? c.amount / bucket.total : 0;
      const bucketOver = Math.max(0, bucket.total - bucket.target);
      const overage = share * bucketOver;
      return { ...c, overage };
    })
    .filter((c) => c.overage > 0)
    .sort((a, b) => b.overage - a.overage)
    .slice(0, 5);

  if (!withOverage.length) return null;

  return (
    <Card className="p-5">
      <CardHeader title="Where to Cut" description="Top categories contributing to overspend" />
      <div className="mt-3">
      <div className="flex flex-col divide-y divide-[var(--color-border)]">
        {withOverage.map((c, i) => (
          <div key={c.id} className="flex items-center gap-3 py-2.5 text-sm">
            <span className="text-[var(--color-text-muted)] w-5 text-center font-mono text-xs flex-shrink-0">{i + 1}</span>
            <span className="w-6 text-center flex-shrink-0">{c.icon ?? '📦'}</span>
            <span className="flex-1 font-medium text-[var(--color-text)] truncate">{c.name}</span>
            <span className="text-xs text-[var(--color-text-muted)] flex-shrink-0">{c.bucket}</span>
            <span className="text-red-500 font-semibold flex-shrink-0">over by {fmtCurrency(c.overage)}</span>
          </div>
        ))}
      </div>
      </div>
    </Card>
  );
}

// ─── Investment Ladder ────────────────────────────────────────────────────────

function InvestmentLadder({ analysis }: { analysis: WealthAnalysis }) {
  const { investmentLadder, savingsCapacity } = analysis;

  // Find the first inprogress step
  const inprogressIdx = investmentLadder.findIndex((s) => s.status === 'inprogress');
  const inprogressStep = inprogressIdx >= 0 ? investmentLadder[inprogressIdx] : null;

  // Months to fund: only if we have an amount and capacity > 0
  let monthsToFund: number | null = null;
  if (inprogressStep?.amount && savingsCapacity > 0) {
    monthsToFund = Math.ceil(inprogressStep.amount / savingsCapacity);
  }

  const stepIcon: Record<string, string> = {
    complete: '✅',
    inprogress: '🔄',
    todo: '⬜',
  };

  return (
    <Card className="p-5">
      <CardHeader title="Wealth Building Ladder" description="Your path to financial independence" />
      <div className="flex flex-col gap-3 mt-4">
        {investmentLadder.map((step) => (
          <div
            key={step.step}
            className={`flex items-start gap-3 p-3 rounded-[var(--radius-md)] ${
              step.status === 'complete'
                ? 'bg-green-50 dark:bg-green-950/20'
                : step.status === 'inprogress'
                ? 'bg-[var(--color-accent-light)]'
                : 'bg-[var(--color-surface-hover)]'
            }`}
          >
            <span className="text-lg flex-shrink-0 mt-0.5">{stepIcon[step.status]}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`font-semibold text-sm ${
                    step.status === 'complete'
                      ? 'text-[var(--color-success,#22c55e)]'
                      : step.status === 'inprogress'
                      ? 'text-[var(--color-accent)]'
                      : 'text-[var(--color-text-muted)]'
                  }`}
                >
                  Step {step.step}: {step.label}
                </span>
                {step.status === 'inprogress' && step.amount !== undefined && (
                  <span className="text-xs bg-[var(--color-accent)] text-white px-2 py-0.5 rounded-full">
                    {fmtCurrency(step.amount)} needed
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{step.description}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Savings capacity summary */}
      <div className="mt-4 pt-4 border-t border-[var(--color-border)] text-sm text-[var(--color-text-muted)]">
        <span>
          Based on your current savings capacity of{' '}
          <span className="font-semibold text-[var(--color-text)]">{fmtCurrency(savingsCapacity)}/mo</span>
          {inprogressStep && monthsToFund !== null ? (
            <>
              , you could fully fund{' '}
              <span className="font-semibold text-[var(--color-accent)]">Step {inprogressStep.step}</span> in{' '}
              <span className="font-semibold text-[var(--color-text)]">~{monthsToFund} month{monthsToFund !== 1 ? 's' : ''}</span>.
            </>
          ) : (
            '.'
          )}
        </span>
      </div>
    </Card>
  );
}

// ─── AI Analysis Panel ────────────────────────────────────────────────────────

interface AiAnalysisResult {
  configured: boolean;
  message?: string;
  analysis?: string;
  generatedAt?: string;
  cached?: boolean;
}

function AiAnalysisPanel({ onDismiss }: { onDismiss: () => void }) {
  const [result, setResult] = useState<AiAnalysisResult | null>(null);
  const [triggered, setTriggered] = useState(false);

  const mutation = useMutation<AiAnalysisResult, AxiosError, boolean>({
    mutationFn: (refresh: boolean) =>
      api.post('/wealth/ai-analysis', { refresh }).then((r) => r.data as AiAnalysisResult),
    onSuccess: (data) => setResult(data),
    onError: () => notify.error('Failed to get AI analysis'),
  });

  if (!triggered) {
    setTriggered(true);
    mutation.mutate(false);
  }

  const formattedDate = result?.generatedAt
    ? new Date(result.generatedAt).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <Card className="p-5 bg-[var(--color-surface-hover)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Sparkles size={16} className="text-[var(--color-accent)] flex-shrink-0" />
          <span className="font-semibold text-sm text-[var(--color-text)]">AI Wealth Coach</span>
          {result?.configured && formattedDate && (
            <span className="text-xs text-[var(--color-text-muted)]">
              · {result.cached ? 'Cached' : 'Generated'} {formattedDate}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {result?.configured && (
            <Button
              variant="ghost"
              size="sm"
              icon={<RefreshCw size={13} />}
              onClick={() => mutation.mutate(true)}
              loading={mutation.isPending}
            >
              Refresh
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onDismiss}>
            <X size={14} />
          </Button>
        </div>
      </div>

      {/* Loading */}
      {mutation.isPending && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-4/6" />
          <p className="text-xs text-[var(--color-text-muted)] mt-1">Analyzing your wealth strategy...</p>
        </div>
      )}

      {/* Not configured */}
      {!mutation.isPending && result && !result.configured && (
        <div className="flex items-start gap-3">
          <Settings size={18} className="text-[var(--color-text-muted)] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-[var(--color-text)]">
              {result.message ?? 'Configure an AI provider in Settings to get personalized wealth coaching.'}
            </p>
            <a
              href="/settings?section=integrations"
              className="text-xs text-[var(--color-accent)] underline mt-1 inline-block"
            >
              Go to Settings → Integrations
            </a>
          </div>
        </div>
      )}

      {/* Analysis text */}
      {!mutation.isPending && result?.configured && result.analysis && (
        <p className="text-sm leading-relaxed text-[var(--color-text)] whitespace-pre-wrap">
          {result.analysis}
        </p>
      )}
    </Card>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCompact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${n}`;
}

// ─── Types: Investment Intel ───────────────────────────────────────────────────

interface ProjectionHorizon {
  years: number;
  p10: number;
  p50: number;
  p90: number;
}

interface ProjectionsData {
  totalValue: number;
  monthlyContrib: number;
  simulations: number;
  horizons: ProjectionHorizon[];
}

interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  description: string;
}

// ─── Types: Net Worth Breakdown ───────────────────────────────────────────────

interface BreakdownAccount {
  id: string;
  name: string;
  type: string;
  balance?: number;
  value?: number;
  institution?: string | null;
}

interface BreakdownSection {
  total: number;
  accounts: BreakdownAccount[];
  manualAssets?: { id: string; name: string; type: string; value: number }[];
  manualLiabilities?: { id: string; name: string; type: string; balance: number }[];
}

interface BreakdownHistory {
  date: string;
  netWorth: number;
  cashValue: number;
  investmentValue: number;
  otherAssetsValue: number;
  liabilities: number;
}

interface BreakdownData {
  netWorth: number;
  totalAssets: number;
  liquid: BreakdownSection;
  investments: BreakdownSection;
  otherAssets: BreakdownSection;
  liabilities: BreakdownSection;
  history: BreakdownHistory[];
}

// ─── Portfolio Projections ────────────────────────────────────────────────────

function PortfolioProjections() {
  const { data, isLoading, isError } = useQuery<ProjectionsData>({
    queryKey: ['investment-projections'],
    queryFn: () => api.get('/investment-intel/projections').then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });

  return (
    <Card className="p-5">
      <CardHeader
        title="Portfolio Projections"
        description="Monte Carlo simulation (1,000 runs, 7% avg return, 15% std dev)"
      />

      {isLoading && (
        <div className="flex items-center gap-2 mt-4 text-sm text-[var(--color-text-muted)]">
          <Loader2 size={14} className="animate-spin" />
          Running simulations…
        </div>
      )}

      {isError && (
        <p className="mt-4 text-sm text-[var(--color-danger,#ef4444)]">Could not load projections.</p>
      )}

      {data && data.totalValue === 0 && (
        <p className="mt-4 text-sm text-[var(--color-text-muted)]">
          No investment holdings found. Add holdings to see projections.
        </p>
      )}

      {data && data.totalValue > 0 && (
        <>
          <div className="flex flex-wrap gap-4 mt-4 text-sm">
            <span className="text-[var(--color-text-muted)]">
              Current portfolio:{' '}
              <span className="font-semibold text-[var(--color-text)]">{fmtCompact(data.totalValue)}</span>
            </span>
            {data.monthlyContrib > 0 && (
              <span className="text-[var(--color-text-muted)]">
                Monthly contributions:{' '}
                <span className="font-semibold text-[var(--color-text)]">{fmtCompact(data.monthlyContrib)}/mo</span>
              </span>
            )}
          </div>

          {/* Mobile: stacked cards per horizon */}
          <div className="flex flex-col divide-y divide-[var(--color-border)] mt-4 sm:hidden">
            {data.horizons.map((h) => (
              <div key={h.years} className="py-3 grid grid-cols-2 gap-y-1 gap-x-4 text-sm">
                <div className="col-span-2 font-semibold text-[var(--color-text)] mb-1">{h.years}-year horizon</div>
                <div className="text-xs text-[var(--color-text-muted)]">Conservative</div>
                <div className="text-xs text-right text-[var(--color-text-secondary)]">{fmtCompact(h.p10)}</div>
                <div className="text-xs text-[var(--color-accent)] font-medium">Expected</div>
                <div className="text-xs text-right font-semibold text-[var(--color-text)]">{fmtCompact(h.p50)}</div>
                <div className="text-xs text-[var(--color-text-muted)]">Optimistic</div>
                <div className="text-xs text-right" style={{ color: 'var(--color-success,#22c55e)' }}>{fmtCompact(h.p90)}</div>
              </div>
            ))}
          </div>

          {/* Desktop: full table */}
          <div className="hidden sm:block mt-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className="text-left py-2 pr-4 text-[var(--color-text-muted)] font-medium">Years</th>
                  <th className="text-right py-2 px-3 text-[var(--color-text-muted)] font-medium">Conservative (P10)</th>
                  <th className="text-right py-2 px-3 text-[var(--color-accent)] font-medium">Expected (P50)</th>
                  <th className="text-right py-2 pl-3 text-[var(--color-text-muted)] font-medium">Optimistic (P90)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {data.horizons.map((h) => (
                  <tr key={h.years} className="hover:bg-[var(--color-surface-hover)] transition-colors">
                    <td className="py-2.5 pr-4 font-medium text-[var(--color-text)]">{h.years}yr</td>
                    <td className="py-2.5 px-3 text-right text-[var(--color-text-secondary)]">{fmtCompact(h.p10)}</td>
                    <td className="py-2.5 px-3 text-right font-semibold text-[var(--color-text)]">{fmtCompact(h.p50)}</td>
                    <td className="py-2.5 pl-3 text-right text-[var(--color-success,#22c55e)]">{fmtCompact(h.p90)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}

// ─── Holding News Widget ───────────────────────────────────────────────────────

function HoldingNewsPanel({ ticker }: { ticker: string }) {
  const { data, isLoading, isError } = useQuery<{ ticker: string; items: NewsItem[] }>({
    queryKey: ['holding-news', ticker],
    queryFn: () => api.get(`/investment-intel/news?ticker=${encodeURIComponent(ticker)}`).then((r) => r.data),
    staleTime: 10 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-3 px-4 text-sm text-[var(--color-text-muted)]">
        <Loader2 size={13} className="animate-spin flex-shrink-0" />
        Loading news for {ticker}…
      </div>
    );
  }

  if (isError) {
    return (
      <p className="py-2 px-4 text-sm text-[var(--color-danger,#ef4444)]">Could not load news.</p>
    );
  }

  const items = data?.items?.slice(0, 5) ?? [];

  if (!items.length) {
    return <p className="py-2 px-4 text-sm text-[var(--color-text-muted)]">No news found for {ticker}.</p>;
  }

  return (
    <div className="flex flex-col divide-y divide-[var(--color-border)] px-4 pb-2">
      {items.map((item, i) => (
        <div key={i} className="py-2.5">
          <a
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-[var(--color-accent)] hover:underline leading-snug"
          >
            {item.title}
          </a>
          {item.pubDate && (
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              {new Date(item.pubDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Skeleton loader ──────────────────────────────────────────────────────────

function WealthSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <Card key={i} className="p-5 flex flex-col gap-3">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-2 w-full" />
            <Skeleton className="h-4 w-20" />
          </Card>
        ))}
      </div>
      <Card className="p-5">
        <Skeleton className="h-5 w-40 mb-3" />
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12 w-full mb-2" />
        ))}
      </Card>
    </div>
  );
}

// ─── Net Worth Breakdown ──────────────────────────────────────────────────────

const CHART_COLORS = {
  cash: 'var(--color-success, #22c55e)',
  investments: 'var(--color-accent, #e5622a)',
  other: '#a78bfa',
  liabilities: 'var(--color-danger, #ef4444)',
};

function fmtDate(iso: string) {
  const [y, m] = iso.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function StatCard({ label, value, sub, positive }: { label: string; value: string; sub?: string; positive?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 px-5 py-4 rounded-[var(--radius-md)] bg-[var(--color-surface-hover)]">
      <span className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">{label}</span>
      <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', color: positive === false ? 'var(--color-danger, #ef4444)' : 'var(--color-text)' }}>
        {value}
      </span>
      {sub && <span className="text-xs text-[var(--color-text-muted)]">{sub}</span>}
    </div>
  );
}

function AccountRow({ name, institution, amount, type }: { name: string; institution?: string | null; amount: number; type?: string }) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-[var(--color-border)] last:border-0 text-sm">
      <div className="flex-1 min-w-0">
        <p className="font-medium text-[var(--color-text)] truncate">{name}</p>
        {institution && <p className="text-xs text-[var(--color-text-muted)] truncate">{institution}</p>}
        {!institution && type && <p className="text-xs text-[var(--color-text-muted)] capitalize">{type.replace(/_/g, ' ')}</p>}
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)' }}>
        {fmtCurrency(amount)}
      </span>
    </div>
  );
}

function SectionCard({
  title,
  emoji,
  total,
  colorVar,
  children,
}: {
  title: string;
  emoji: string;
  total: number;
  colorVar: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="p-0 overflow-hidden">
      <button
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-[var(--color-surface-hover)] transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="text-xl flex-shrink-0">{emoji}</span>
        <span className="flex-1 font-semibold text-[var(--color-text)]">{title}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', fontSize: '1.125rem', fontWeight: 700, color: colorVar }}>
          {fmtCurrency(total)}
        </span>
        {open ? <ChevronUp size={16} className="text-[var(--color-text-muted)] flex-shrink-0" /> : <ChevronDown size={16} className="text-[var(--color-text-muted)] flex-shrink-0" />}
      </button>
      {open && <div className="px-5 pb-4">{children}</div>}
    </Card>
  );
}

function NetWorthBreakdown() {
  const { data, isLoading, isError } = useQuery<BreakdownData>({
    queryKey: ['wealth', 'breakdown'],
    queryFn: () => api.get('/wealth/breakdown').then((r) => r.data),
    staleTime: 2 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-[var(--radius-md)]" />)}
        </div>
        <Skeleton className="h-52 rounded-[var(--radius-md)]" />
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-[var(--radius-md)]" />)}
      </div>
    );
  }

  if (isError || !data) {
    return <p className="text-sm text-[var(--color-danger,#ef4444)]">Failed to load net worth breakdown.</p>;
  }

  const chartData = data.history.map((h) => ({
    date: fmtDate(h.date),
    Cash: h.cashValue,
    Investments: h.investmentValue,
    Other: h.otherAssetsValue,
    Liabilities: h.liabilities,
  }));

  return (
    <div className="flex flex-col gap-5">
      {/* Hero stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Net Worth" value={fmtCurrency(data.netWorth)} />
        <StatCard label="Liquid" value={fmtCurrency(data.liquid.total)} sub="Cash & savings" />
        <StatCard label="Investments" value={fmtCurrency(data.investments.total)} sub="Portfolio value" />
        <StatCard label="Liabilities" value={fmtCurrency(data.liabilities.total)} sub="Debt total" positive={false} />
      </div>

      {/* Stacked area chart */}
      {chartData.length > 0 && (
        <Card className="p-5">
          <CardHeader title="Net Worth History" description="12-month breakdown by asset type" />
          <div className="mt-4 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="gradCash" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHART_COLORS.cash} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={CHART_COLORS.cash} stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="gradInv" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHART_COLORS.investments} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={CHART_COLORS.investments} stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="gradOther" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHART_COLORS.other} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={CHART_COLORS.other} stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => `$${Math.round(v / 1000)}k`} tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} axisLine={false} tickLine={false} width={48} />
                <Tooltip
                  formatter={(val: number, name: string) => [fmtCurrency(val), name]}
                  contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: 'var(--color-text-muted)', fontWeight: 500 }}
                />
                <Area type="monotone" dataKey="Cash" stackId="a" stroke={CHART_COLORS.cash} fill="url(#gradCash)" strokeWidth={2} />
                <Area type="monotone" dataKey="Investments" stackId="a" stroke={CHART_COLORS.investments} fill="url(#gradInv)" strokeWidth={2} />
                <Area type="monotone" dataKey="Other" stackId="a" stroke={CHART_COLORS.other} fill="url(#gradOther)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          {/* Legend */}
          <div className="flex flex-wrap gap-4 mt-3">
            {([['Cash', CHART_COLORS.cash], ['Investments', CHART_COLORS.investments], ['Other', CHART_COLORS.other]] as [string, string][]).map(([label, color]) => (
              <div key={label} className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                {label}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Sections */}
      <SectionCard title="Liquid Assets" emoji="💧" total={data.liquid.total} colorVar="var(--color-success, #22c55e)">
        {data.liquid.accounts.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)] py-2">No liquid accounts.</p>
        ) : (
          data.liquid.accounts.map((a) => (
            <AccountRow key={a.id} name={a.name} institution={a.institution} amount={a.balance ?? 0} type={a.type} />
          ))
        )}
      </SectionCard>

      <SectionCard title="Investments" emoji="📈" total={data.investments.total} colorVar="var(--color-accent, #e5622a)">
        {data.investments.accounts.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)] py-2">No investment accounts.</p>
        ) : (
          data.investments.accounts.map((a) => (
            <AccountRow key={a.id} name={a.name} institution={a.institution} amount={a.value ?? 0} type={a.type} />
          ))
        )}
      </SectionCard>

      <SectionCard title="Other Assets" emoji="🏠" total={data.otherAssets.total} colorVar="#a78bfa">
        {data.otherAssets.accounts.length === 0 && (data.otherAssets.manualAssets?.length ?? 0) === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)] py-2">No other assets.</p>
        ) : (
          <>
            {data.otherAssets.accounts.map((a) => (
              <AccountRow key={a.id} name={a.name} amount={a.balance ?? 0} type={a.type} />
            ))}
            {data.otherAssets.manualAssets?.map((a) => (
              <AccountRow key={a.id} name={a.name} amount={a.value} type={a.type} />
            ))}
          </>
        )}
      </SectionCard>

      <SectionCard title="Liabilities" emoji="📉" total={data.liabilities.total} colorVar="var(--color-danger, #ef4444)">
        {data.liabilities.accounts.length === 0 && (data.liabilities.manualLiabilities?.length ?? 0) === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)] py-2">No liabilities.</p>
        ) : (
          <>
            {data.liabilities.accounts.map((a) => (
              <AccountRow key={a.id} name={a.name} amount={a.balance ?? 0} type={a.type} />
            ))}
            {data.liabilities.manualLiabilities?.map((l) => (
              <AccountRow key={l.id} name={l.name} amount={l.balance} type={l.type} />
            ))}
          </>
        )}
      </SectionCard>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type WealthTab = 'networth' | 'strategy';

export default function WealthPage() {
  const [tab, setTab] = useState<WealthTab>('networth');
  const [month, setMonth] = useState(todayYM);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const queryClient = useQueryClient();

  const { data: incomeData } = useQuery<IncomeData>({
    queryKey: ['wealth', 'income'],
    queryFn: () => api.get('/wealth/income').then((r) => r.data),
  });

  const { data: analysis, isLoading } = useQuery<WealthAnalysis>({
    queryKey: ['wealth', 'analysis', month],
    queryFn: () => api.get(`/wealth/analysis?month=${month}`).then((r) => r.data),
    enabled: tab === 'strategy',
  });

  const handlePrev = () => setMonth((m) => addMonths(m, -1));
  const handleNext = () => setMonth((m) => addMonths(m, 1));

  const TAB_ITEMS: { id: WealthTab; label: string }[] = [
    { id: 'networth', label: 'Net Worth' },
    { id: 'strategy', label: 'Strategy' },
  ];

  return (
    <div className="py-4 flex flex-col gap-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <TrendingUp size={20} className="text-[var(--color-accent)]" />
            <h1 className="text-xl font-bold text-[var(--color-text)]">Wealth</h1>
          </div>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
            {tab === 'networth' ? 'Asset & liability breakdown' : '50 / 30 / 20 Rule'}
          </p>
        </div>

        {/* Tab switcher */}
        <div style={{ display: 'flex', background: 'var(--color-surface-alt, var(--color-surface-hover))', borderRadius: 'var(--radius-md)', padding: 3, gap: 2 }}>
          {TAB_ITEMS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: '0.25rem 0.875rem',
                borderRadius: 'calc(var(--radius-md) - 2px)',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: tab === t.id ? 600 : 400,
                background: tab === t.id ? 'var(--color-surface)' : 'transparent',
                color: tab === t.id ? 'var(--color-text)' : 'var(--color-text-muted)',
                boxShadow: tab === t.id ? 'var(--shadow-sm)' : 'none',
                transition: 'all 0.15s',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'strategy' && (
          <>
            {/* Month selector — pill-segment style */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              background: 'var(--color-surface-alt, var(--color-surface-hover))',
              borderRadius: 'var(--radius-md)',
              padding: '3px',
              gap: '2px',
            }}>
              <button
                onClick={handlePrev}
                style={{
                  padding: '0.25rem 0.5rem',
                  borderRadius: 'calc(var(--radius-md) - 2px)',
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--color-text-muted)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-surface)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                aria-label="Previous month"
              >
                <ChevronLeft size={16} />
              </button>
              <span style={{
                background: 'var(--color-surface)',
                boxShadow: 'var(--shadow-sm)',
                borderRadius: 'calc(var(--radius-md) - 2px)',
                padding: '0.25rem 0.75rem',
                fontSize: '0.875rem',
                fontWeight: 500,
                color: 'var(--color-text)',
                width: '9rem',
                textAlign: 'center',
                whiteSpace: 'nowrap',
              }}>
                {getMonthLabel(month)}
              </span>
              <button
                onClick={handleNext}
                style={{
                  padding: '0.25rem 0.5rem',
                  borderRadius: 'calc(var(--radius-md) - 2px)',
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--color-text-muted)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-surface)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                aria-label="Next month"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            {/* AI Analysis button */}
            <Button
              variant={showAiPanel ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setShowAiPanel((v) => !v)}
              className="flex items-center gap-1.5"
            >
              <Sparkles size={14} />
              {showAiPanel ? 'Hide AI Coach' : 'Get AI Analysis'}
            </Button>
          </>
        )}
      </div>

      {/* ── Net Worth tab ── */}
      {tab === 'networth' && <NetWorthBreakdown />}

      {/* ── Strategy tab ── */}
      {tab === 'strategy' && (
        <>
          {/* ── Income setup ── */}
          {isLoading ? (
            <Skeleton className="h-16 w-full rounded-[var(--radius-md)]" />
          ) : (
            <IncomeSetup
              incomeData={incomeData}
              onSaved={() => queryClient.invalidateQueries({ queryKey: ['wealth'] })}
            />
          )}

          {/* ── Main content (requires income) ── */}
          {isLoading ? (
            <WealthSkeleton />
          ) : analysis && analysis.income !== null ? (
            <>
              {/* ── Monthly total hero ── */}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '1rem', flexWrap: 'wrap' }}>
                <span style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '2.5rem',
                  fontWeight: 700,
                  letterSpacing: '-0.02em',
                  fontVariantNumeric: 'tabular-nums',
                  color: 'var(--color-text)',
                  lineHeight: 1.1,
                }}>
                  {fmtCurrency(analysis.income)}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>/mo take-home</span>
                <span style={{
                  background: 'var(--color-accent-light, rgba(229,98,42,0.12))',
                  color: 'var(--color-accent)',
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-full)',
                  fontSize: 12,
                  fontWeight: 500,
                }}>
                  50 / 30 / 20
                </span>
              </div>

              {/* ── Three bucket cards ── */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <BucketCard type="needs" bucket={analysis.buckets.needs} income={analysis.income} />
                <BucketCard type="wants" bucket={analysis.buckets.wants} income={analysis.income} />
                <BucketCard type="savings" bucket={analysis.buckets.savings} income={analysis.income} />
              </div>

              {/* ── Alerts ── */}
              <AlertsSection alerts={analysis.alerts} />

              {/* ── Where to cut ── */}
              <WhereToCut analysis={analysis} />

              {/* ── Investment ladder ── */}
              {analysis.investmentLadder.length > 0 && (
                <InvestmentLadder analysis={analysis} />
              )}

              {/* ── AI Wealth Coach Panel ── */}
              {showAiPanel && (
                <AiAnalysisPanel onDismiss={() => setShowAiPanel(false)} />
              )}

              {/* ── Portfolio Projections ── */}
              <PortfolioProjections />
            </>
          ) : analysis && analysis.income === null ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-[var(--color-text-muted)]">
              <TrendingUp size={48} className="mb-4 opacity-30" />
              <p className="text-lg font-medium">Set your income above to unlock your wealth strategy</p>
              <p className="text-sm mt-1">We'll show your 50/30/20 breakdown once your take-home income is set.</p>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
