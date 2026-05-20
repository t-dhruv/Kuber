import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Upload } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui';
import {
  AccountsResponse,
  AddHoldingModal,
  AllocationData,
  AllocationDonut,
  AllocationTable,
  BulkImportModal,
  GainBadge,
  HoldingsData,
  HoldingsTable,
  InvestmentAccount,
  PendingLot,
  PendingLotsCard,
  PerformanceCards,
  PerformanceChart,
  PerformanceData,
  Period,
  PeriodToggle,
  TabToggle,
  fmtCurrency,
} from './tabs/InvestmentsSections';

export default function InvestmentsPage() {
  const [tab, setTab] = useState<'holdings' | 'allocation'>('holdings');
  const [period, setPeriod] = useState<Period>('1Y');
  const [accountId, setAccountId] = useState<string | undefined>();
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

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
          variant="secondary"
          icon={<Upload size={14} />}
          onClick={() => setImportOpen(true)}
        >
          Import CSV
        </Button>
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
          {/* Portfolio total hero */}
          {holdingsData && (
            <div style={{
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-xl, var(--radius-lg))',
              padding: '1.25rem 1.5rem',
              display: 'flex',
              alignItems: 'center',
              gap: '2.5rem',
              flexWrap: 'wrap',
              boxShadow: 'var(--shadow-sm)',
            }}>
              <div>
                <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-muted)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                  Portfolio Value
                </div>
                <div style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '2.25rem',
                  fontWeight: 700,
                  letterSpacing: '-0.02em',
                  fontVariantNumeric: 'tabular-nums',
                  color: 'var(--color-text)',
                  lineHeight: 1.1,
                }}>
                  {fmtCurrency(holdingsData.totalValue)}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-muted)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                    Total Return
                  </div>
                  <GainBadge amount={holdingsData.totalReturn} pct={holdingsData.totalReturnPercent} showArrow={false} />
                </div>
                <div>
                  <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-muted)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                    Unrealized
                  </div>
                  <span style={{
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    fontFamily: 'var(--font-mono)',
                    fontVariantNumeric: 'tabular-nums',
                    color: holdingsData.totalUnrealizedGain >= 0 ? 'var(--color-success)' : 'var(--color-danger)',
                  }}>
                    {holdingsData.totalUnrealizedGain >= 0 ? '+' : ''}{fmtCurrency(holdingsData.totalUnrealizedGain)}
                  </span>
                </div>
                {holdingsData.totalRealizedGain !== 0 && (
                  <div>
                    <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-muted)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                      Realized
                    </div>
                    <span style={{
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      fontFamily: 'var(--font-mono)',
                      fontVariantNumeric: 'tabular-nums',
                      color: holdingsData.totalRealizedGain >= 0 ? 'var(--color-success)' : 'var(--color-danger)',
                    }}>
                      {holdingsData.totalRealizedGain >= 0 ? '+' : ''}{fmtCurrency(holdingsData.totalRealizedGain)}
                    </span>
                  </div>
                )}
                <div>
                  <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-muted)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                    Cost Basis
                  </div>
                  <span style={{ fontSize: '0.875rem', fontWeight: 600, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', color: 'var(--color-text-secondary)' }}>
                    {fmtCurrency(holdingsData.totalCostBasis)}
                  </span>
                </div>
                {holdingsData.totalRecordedDividends > 0 && (
                  <div>
                    <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-muted)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                      Dividends Received
                    </div>
                    <span style={{ fontSize: '0.875rem', fontWeight: 600, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', color: 'var(--color-accent)' }}>
                      {fmtCurrency(holdingsData.totalRecordedDividends)}
                    </span>
                  </div>
                )}
                {holdingsData.totalAnnualDividend > 0 && (
                  <div>
                    <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-muted)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                      Est. Annual Income
                    </div>
                    <span style={{ fontSize: '0.875rem', fontWeight: 600, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', color: 'var(--color-accent)' }}>
                      {fmtCurrency(holdingsData.totalAnnualDividend)}/yr
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
          <PerformanceCards
            performanceData={performanceData}
            period={period}
            isLoading={performanceLoading}
          />
          <PerformanceChart
            data={performanceData?.history}
            isLoading={performanceLoading}
            hasHoldings={(holdingsData?.holdings ?? []).length > 0}
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

      {/* Bulk Import Modal */}
      <BulkImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        accounts={accounts}
      />
    </div>
  );
}
