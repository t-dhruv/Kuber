import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Calendar, TrendingDown, DollarSign, Percent, AlertTriangle, Info } from 'lucide-react';
import { api } from '@/lib/api';
import { getColorToken } from '@/lib/colors';
import { Button, Input, Skeleton, notify } from '@/components/ui';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AmortizationResponse {
  region:               'US' | 'CA';
  rateType:             'fixed' | 'variable';
  effectiveAnnualRate:  number;
  effectiveMonthlyRate: number;
  calculatedPayment:    number;
  schedule: {
    nextPaymentAmount:      number;
    principalPortion:       number;
    interestPortion:        number;
    remainingPayments:      number;
    payoffDate:             string;
    totalInterestRemaining: number;
  };
  term: {
    termEndDate:      string | null;
    daysUntilRenewal: number | null;
  };
  triggerRate: number | null;
  periods: Array<{ period: number; payment: number; principal: number; interest: number; balance: number }>;
}

interface PayoffResult {
  newPayoffMonths:   number;
  monthsSaved:       number;
  interestSaved:     number;
  totalInterestBase: number;
  totalInterestNew:  number;
}

interface Liability {
  id:               string;
  name:             string;
  type:             string;
  currentBalance:   number;
  originalAmount:   number;
  interestRate:     number | null;
  monthlyPayment:   number | null;
  currency:         string;
  region:           string | null;
  rateType:         string | null;
  primeRate:        number | null;
  primeDiscount:    number | null;
  termEndDate:      string | null;
  amortizationYears: number | null;
}

// ── Formatters ────────────────────────────────────────────────────────────────

const fmt = (v: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(v);

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const fmtPct = (v: number) => `${v.toFixed(4)}%`;

function monthsToPayoffDate(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatTile({
  label, value, sub, danger, warn,
}: {
  label: string; value: string; sub?: string; danger?: boolean; warn?: boolean;
}) {
  const color = danger ? 'var(--color-danger)' : warn ? 'var(--color-warning)' : 'var(--color-text)';
  return (
    <div className="bg-[var(--color-surface-hover)] rounded-[var(--radius-md)] px-3 py-2.5">
      <div className="text-[0.625rem] text-[var(--color-text-muted)] uppercase tracking-[0.05em] mb-0.5">{label}</div>
      <div className="text-[0.9375rem] font-semibold" style={{ color }}>{value}</div>
      {sub && <div className="text-[0.625rem] text-[var(--color-text-muted)] mt-0.5">{sub}</div>}
    </div>
  );
}

function PaymentSplitBar({ principal, interest }: { principal: number; interest: number }) {
  const total = principal + interest;
  if (total <= 0) return null;
  const pPct = (principal / total) * 100;
  const iPct = 100 - pPct;

  return (
    <div>
      <div className="flex justify-between text-[0.6875rem] mb-1.5">
        <span className="text-[var(--color-text-muted)]">
          Principal <span className="font-semibold" style={{ color: 'var(--color-success)' }}>{pPct.toFixed(1)}%</span>
        </span>
        <span className="text-[var(--color-text-muted)]">
          Interest <span className="font-semibold text-[var(--color-danger)]">{iPct.toFixed(1)}%</span>
        </span>
      </div>
      <div className="h-2.5 rounded-full overflow-hidden bg-[var(--color-danger)] flex">
        <div
          className="rounded-full transition-[width] duration-500"
          style={{ width: `${pPct}%`, backgroundColor: 'var(--color-success)' }}
        />
      </div>
      <div className="flex justify-between text-[0.6875rem] mt-1">
        <span style={{ color: 'var(--color-success)' }}>{fmt(principal)}</span>
        <span style={{ color: 'var(--color-danger)' }}>{fmt(interest)}</span>
      </div>
    </div>
  );
}

function PayoffSimulator({
  liabilityId,
  currency,
  remainingPayments,
}: {
  liabilityId: string;
  currency: string;
  remainingPayments: number;
}) {
  const [extra, setExtra] = useState('');
  const [result, setResult] = useState<PayoffResult | null>(null);

  const simulate = useMutation({
    mutationFn: (extraMonthly: number) =>
      api.post(`/liabilities/${liabilityId}/payoff-simulator`, { extraMonthly }).then((r) => r.data),
    onSuccess: setResult,
    onError:   () => notify.error('Simulation failed — ensure interest rate and amortization years are set'),
  });

  const extraNum = parseFloat(extra) || 0;

  return (
    <div>
      <div className="flex gap-2 items-end mb-3">
        <div className="flex-1">
          <Input
            label="Extra monthly payment"
            type="number"
            min="0"
            step="50"
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            placeholder="e.g. 500"
          />
        </div>
        <Button
          size="sm"
          onClick={() => simulate.mutate(extraNum)}
          loading={simulate.isPending}
          disabled={extraNum < 0}
        >
          Run
        </Button>
      </div>

      {result && (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <StatTile
              label="Months saved"
              value={`${result.monthsSaved} mo`}
              sub={result.monthsSaved > 0 ? `Payoff ${monthsToPayoffDate(result.newPayoffMonths)}` : undefined}
            />
            <StatTile
              label="Interest saved"
              value={fmt(result.interestSaved, currency)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <StatTile label="Base total interest"  value={fmt(result.totalInterestBase, currency)} danger />
            <StatTile label="New total interest"   value={fmt(result.totalInterestNew, currency)} />
          </div>
          <div className="text-[0.6875rem] text-[var(--color-text-muted)] bg-[var(--color-surface-hover)] rounded-[var(--radius-md)] px-3 py-2 flex items-start gap-1.5">
            <Info size={12} className="shrink-0 mt-0.5" />
            Base schedule: {remainingPayments} payments ({(remainingPayments / 12).toFixed(1)} yrs) ·
            Accelerated: {result.newPayoffMonths} payments ({(result.newPayoffMonths / 12).toFixed(1)} yrs)
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function LiabilityDetailPanel({ liability, currency }: { liability: Liability; currency: string }) {
  const canCalculate = !!(
    (liability.interestRate || (liability.primeRate && liability.primeDiscount != null)) &&
    liability.amortizationYears
  );

  const { data, isLoading, error } = useQuery<AmortizationResponse>({
    queryKey:  ['liabilities', liability.id, 'amortization'],
    queryFn:   () => api.get(`/liabilities/${liability.id}/amortization`).then((r) => r.data),
    enabled:   canCalculate,
    retry:     false,
  });

  const sched = data?.schedule;
  const term  = data?.term;

  return (
    <div className="flex flex-col gap-5 pt-1">

      {/* Balance summary */}
      <div>
        <div className="text-[0.6875rem] text-[var(--color-text-muted)] uppercase tracking-[0.05em] mb-1">Outstanding Balance</div>
        <div className="text-[2rem] font-bold" style={{ color: 'var(--color-danger)' }}>
          {fmt(liability.currentBalance, currency)}
        </div>
        {liability.originalAmount > 0 && (
          <div className="mt-1">
            <div className="text-[0.6875rem] text-[var(--color-text-muted)] mb-1">
              Paid off: {(((liability.originalAmount - liability.currentBalance) / liability.originalAmount) * 100).toFixed(1)}%
            </div>
            <div className="h-1.5 rounded-full bg-[var(--color-surface-hover)] overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, ((liability.originalAmount - liability.currentBalance) / liability.originalAmount) * 100)}%`,
                  backgroundColor: 'var(--color-success)',
                }}
              />
            </div>
          </div>
        )}
      </div>

      {!canCalculate && (
        <div className="flex items-start gap-2 bg-[var(--color-surface-hover)] rounded-[var(--radius-md)] px-3 py-3 text-[0.8125rem] text-[var(--color-text-muted)]">
          <Info size={14} className="shrink-0 mt-0.5" />
          Set <strong>Interest Rate</strong> and <strong>Amortization Years</strong> to enable mortgage calculations.
        </div>
      )}

      {/* Rate information */}
      {canCalculate && (
        <>
          {isLoading ? (
            <div className="flex flex-col gap-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} height={56} width="100%" />)}
            </div>
          ) : error || !data ? (
            <div className="flex items-start gap-2 bg-[var(--color-surface-hover)] rounded-[var(--radius-md)] px-3 py-3 text-[0.8125rem]" style={{ color: 'var(--color-danger)' }}>
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              Could not calculate amortization. Check that interest rate and amortization years are set.
            </div>
          ) : (
            <>
              {/* Rate section */}
              <div>
                <div className="text-[0.6875rem] font-semibold text-[var(--color-text-secondary)] uppercase tracking-[0.04em] mb-2 flex items-center gap-1.5">
                  <Percent size={11} /> Rate
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <StatTile
                    label={`${data.region} — ${data.rateType}`}
                    value={`${data.effectiveAnnualRate.toFixed(2)}% annual`}
                    sub={`Monthly: ${fmtPct(data.effectiveMonthlyRate * 100)}`}
                  />
                  <StatTile
                    label="Calculated payment"
                    value={fmt(data.calculatedPayment, currency)}
                    sub={liability.monthlyPayment ? `Stored: ${fmt(liability.monthlyPayment, currency)}` : 'From amortization formula'}
                  />
                  {data.rateType === 'variable' && liability.primeRate != null && (
                    <StatTile
                      label="Prime rate"
                      value={`${liability.primeRate.toFixed(2)}%`}
                      sub={`Discount: −${liability.primeDiscount ?? 0}% = ${data.effectiveAnnualRate.toFixed(2)}% effective`}
                    />
                  )}
                  {term?.termEndDate && (
                    <StatTile
                      label="Term renewal"
                      value={fmtDate(term.termEndDate)}
                      sub={term.daysUntilRenewal != null ? `${term.daysUntilRenewal} days` : undefined}
                      warn={(term.daysUntilRenewal ?? 999) < 180}
                      danger={(term.daysUntilRenewal ?? 999) < 60}
                    />
                  )}
                </div>
              </div>

              {/* Next payment breakdown */}
              <div>
                <div className="text-[0.6875rem] font-semibold text-[var(--color-text-secondary)] uppercase tracking-[0.04em] mb-2 flex items-center gap-1.5">
                  <DollarSign size={11} /> Next Payment Breakdown
                </div>
                <PaymentSplitBar
                  principal={sched!.principalPortion}
                  interest={sched!.interestPortion}
                />
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <StatTile
                    label="Payments remaining"
                    value={`${sched!.remainingPayments}`}
                    sub={`${(sched!.remainingPayments / 12).toFixed(1)} years`}
                  />
                  <StatTile
                    label="Payoff date"
                    value={fmtDate(sched!.payoffDate)}
                  />
                </div>
                <div className="mt-2 text-[0.75rem] text-[var(--color-text-muted)] px-1">
                  Total interest remaining:{' '}
                  <span className="font-semibold" style={{ color: 'var(--color-danger)' }}>
                    {fmt(sched!.totalInterestRemaining, currency)}
                  </span>
                </div>
              </div>

              {/* Trigger rate warning (CA variable) */}
              {data.triggerRate != null && (
                <div className="flex items-start gap-2 rounded-[var(--radius-md)] px-3 py-3 text-[0.8125rem]"
                  style={{ backgroundColor: 'var(--color-warning-light)', border: `1px solid var(--color-warning)` }}>
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" style={{ color: getColorToken('warning') }} />
                  <div>
                    <div className="font-semibold" style={{ color: getColorToken('warning') }}>
                      Trigger Rate: {data.triggerRate.toFixed(2)}%
                    </div>
                    <div className="text-[var(--color-text-muted)] mt-0.5">
                      If prime rises above this rate, your fixed payment will no longer cover monthly interest and your balance will begin to grow.
                    </div>
                  </div>
                </div>
              )}

              {/* Payoff simulator */}
              <div>
                <div className="text-[0.6875rem] font-semibold text-[var(--color-text-secondary)] uppercase tracking-[0.04em] mb-2 flex items-center gap-1.5">
                  <TrendingDown size={11} /> Payoff Simulator
                </div>
                <PayoffSimulator
                  liabilityId={liability.id}
                  currency={currency}
                  remainingPayments={sched!.remainingPayments}
                />
              </div>

              {/* Amortization schedule preview */}
              <div>
                <div className="text-[0.6875rem] font-semibold text-[var(--color-text-secondary)] uppercase tracking-[0.04em] mb-2 flex items-center gap-1.5">
                  <Calendar size={11} /> Schedule Preview (first 12 months)
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[0.75rem] border-collapse">
                    <thead>
                      <tr className="border-b border-[var(--color-border)]">
                        {['#', 'Payment', 'Principal', 'Interest', 'Balance'].map((h) => (
                          <th key={h} className="text-left py-1.5 px-2 font-semibold text-[var(--color-text-secondary)]">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.periods.slice(0, 12).map((p) => (
                        <tr key={p.period} className="border-b border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]">
                          <td className="py-1.5 px-2 text-[var(--color-text-muted)]">{p.period}</td>
                          <td className="py-1.5 px-2">{fmt(p.payment, currency)}</td>
                          <td className="py-1.5 px-2" style={{ color: 'var(--color-success)' }}>{fmt(p.principal, currency)}</td>
                          <td className="py-1.5 px-2" style={{ color: 'var(--color-danger)' }}>{fmt(p.interest, currency)}</td>
                          <td className="py-1.5 px-2 font-medium">{fmt(p.balance, currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
