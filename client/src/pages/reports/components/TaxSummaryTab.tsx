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
    <div className="flex flex-col gap-5">
      {/* Header with year selector and export */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Receipt size={18} className="text-[var(--color-accent)]" />
          <span className="font-semibold text-base text-[var(--color-text)]">
            Tax-Deductible Expenses
          </span>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="text-sm px-2 py-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] cursor-pointer"
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
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[0.8125rem] text-[var(--color-text-secondary)] mb-1">
              Total Deductible ({year})
            </div>
            {isLoading ? (
              <Skeleton style={{ width: 140, height: 32 }} />
            ) : (
              <div className="text-[1.875rem] font-bold text-[var(--color-text)]">
                {fmtCurrency(data?.totalDeductible ?? 0)}
              </div>
            )}
          </div>
          <Receipt size={36} className="text-[var(--color-accent)] opacity-20" />
        </div>
      </Card>

      {/* Category table */}
      <Card style={{ overflow: 'hidden' }}>
        {isLoading ? (
          <div className="p-4 flex flex-col gap-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} style={{ width: '100%', height: 44 }} />
            ))}
          </div>
        ) : !hasData ? (
          <div className="py-12 px-6 text-center">
            <Receipt size={40} className="text-[var(--color-text-secondary)] opacity-40 mx-auto mb-4" />
            <div className="font-semibold text-[var(--color-text)] mb-2">
              No tax-deductible categories configured
            </div>
            <div className="text-sm text-[var(--color-text-secondary)] mb-4">
              Mark categories as tax-deductible in Settings to track them here.
            </div>
            <Link
              to="/settings?section=categories"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-accent)] no-underline"
            >
              <Settings size={14} />
              Go to Settings &rsaquo; Categories
            </Link>
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-raised)]">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--color-text-secondary)]">
                  Category
                </th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-[var(--color-text-secondary)]">
                  Transactions
                </th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-[var(--color-text-secondary)]">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {data.categories.map((cat, idx) => (
                <tr
                  key={cat.id}
                  className={idx < data.categories.length - 1 ? 'border-b border-[var(--color-border)]' : ''}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-[0.625rem]">
                      {cat.icon ? (
                        <span className="text-xl leading-none">{cat.icon}</span>
                      ) : (
                        <Receipt size={16} className="text-[var(--color-text-secondary)]" />
                      )}
                      <span className="text-sm font-medium text-[var(--color-text)]">
                        {cat.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-[var(--color-text-secondary)]">
                    {cat.transactionCount}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-[var(--color-text)]">
                    {fmtCurrency(cat.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[var(--color-border)] bg-[var(--color-surface-raised)]">
                <td className="px-4 py-3 text-sm font-bold text-[var(--color-text)]">
                  Total
                </td>
                <td className="px-4 py-3" />
                <td className="px-4 py-3 text-right text-sm font-bold text-[var(--color-accent)]">
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
