import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Receipt, Settings } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { Card, Skeleton } from '@/components/ui';
import { ExportButtons } from './ExportButtons';

interface TaxCategory {
  id: string;
  name: string;
  icon: string | null;
  amount: number;
  transactionCount: number;
}

interface TaxSummaryResponse {
  year: number;
  totalDeductible: number;
  categories: TaxCategory[];
}

const fmtCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = [currentYear, currentYear - 1, currentYear - 2, currentYear - 3];

export function TaxSummaryTab() {
  const [year, setYear] = useState(currentYear);

  const { data, isLoading } = useQuery<TaxSummaryResponse>({
    queryKey: ['reports', 'tax-summary', year],
    queryFn: () => api.get(`/reports/tax-summary?year=${year}`).then((r) => r.data),
  });

  const hasData = data && data.categories.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header with year selector and export */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Receipt size={18} style={{ color: 'var(--color-accent)' }} />
          <span style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--color-text)' }}>
            Tax-Deductible Expenses
          </span>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            style={{
              fontSize: '0.875rem',
              padding: '0.25rem 0.5rem',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface)',
              color: 'var(--color-text)',
              cursor: 'pointer',
            }}
          >
            {YEAR_OPTIONS.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <ExportButtons type="tax" year={year} />
      </div>

      {/* Total KPI */}
      <Card style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', marginBottom: '0.25rem' }}>
              Total Deductible ({year})
            </div>
            {isLoading ? (
              <Skeleton style={{ width: 140, height: 32 }} />
            ) : (
              <div style={{ fontSize: '1.875rem', fontWeight: 700, color: 'var(--color-text)' }}>
                {fmtCurrency(data?.totalDeductible ?? 0)}
              </div>
            )}
          </div>
          <Receipt size={36} style={{ color: 'var(--color-accent)', opacity: 0.2 }} />
        </div>
      </Card>

      {/* Category table */}
      <Card style={{ overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} style={{ width: '100%', height: 44 }} />
            ))}
          </div>
        ) : !hasData ? (
          <div style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
            <Receipt size={40} style={{ color: 'var(--color-text-secondary)', opacity: 0.4, margin: '0 auto 1rem' }} />
            <div style={{ fontWeight: 600, color: 'var(--color-text)', marginBottom: '0.5rem' }}>
              No tax-deductible categories configured
            </div>
            <div style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
              Mark categories as tax-deductible in Settings to track them here.
            </div>
            <Link
              to="/settings?section=categories"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.375rem',
                fontSize: '0.875rem',
                fontWeight: 500,
                color: 'var(--color-accent)',
                textDecoration: 'none',
              }}
            >
              <Settings size={14} />
              Go to Settings &rsaquo; Categories
            </Link>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface-raised)' }}>
                <th style={{ padding: '0.625rem 1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                  Category
                </th>
                <th style={{ padding: '0.625rem 1rem', textAlign: 'right', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                  Transactions
                </th>
                <th style={{ padding: '0.625rem 1rem', textAlign: 'right', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {data.categories.map((cat, idx) => (
                <tr
                  key={cat.id}
                  style={{ borderBottom: idx < data.categories.length - 1 ? '1px solid var(--color-border)' : 'none' }}
                >
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                      {cat.icon ? (
                        <span style={{ fontSize: '1.25rem', lineHeight: 1 }}>{cat.icon}</span>
                      ) : (
                        <Receipt size={16} style={{ color: 'var(--color-text-secondary)' }} />
                      )}
                      <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text)' }}>
                        {cat.name}
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                    {cat.transactionCount}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)' }}>
                    {fmtCurrency(cat.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--color-border)', background: 'var(--color-surface-raised)' }}>
                <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text)' }}>
                  Total
                </td>
                <td style={{ padding: '0.75rem 1rem' }} />
                <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-accent)' }}>
                  {fmtCurrency(data.totalDeductible)}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </Card>
    </div>
  );
}
