/**
 * ImportPreview.tsx
 * Shows parsed rows with NEW / DUPLICATE / INVALID status.
 * User can deselect rows, assign/override categories, then confirm.
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, XCircle, AlertTriangle, Loader2, ChevronDown, ChevronUp, Tag } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui';
import { notify } from '@/components/ui';
import type { ParseResult, ParsedRow } from '../ImportPage';

interface Category {
  id: string;
  name: string;
  emoji?: string | null;
}

interface Props {
  result: ParseResult;
  filename: string;
  accountId: string;
  onDone: () => void;
  onCancel: () => void;
}

const BANK_NAMES: Record<string, string> = {
  'td-canada': 'TD Canada Trust',
  'rbc-canada': 'RBC Royal Bank',
  'cibc-canada': 'CIBC',
  'bmo-canada': 'BMO',
  'scotiabank-canada': 'Scotiabank',
  'chase-us': 'Chase',
  'bofa-us': 'Bank of America',
  'wellsfargo-us': 'Wells Fargo',
  'capitalone-us': 'Capital One',
  'amex-us': 'American Express',
  'questrade-ca': 'Questrade',
  'wealthsimple-ca': 'Wealthsimple',
  ibkr: 'Interactive Brokers',
  'td-direct-ca': 'TD Direct Investing',
  generic: 'Generic CSV',
  'pdf-extracted': 'PDF Statement',
};

export default function ImportPreview({ result, filename, accountId, onDone, onCancel }: Props) {
  const queryClient = useQueryClient();

  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(result.rows.filter((r) => r.status === 'new').map((r) => r.hash))
  );
  const [showDuplicates, setShowDuplicates] = useState(false);

  // Category overrides: hash → categoryId (null = unassigned)
  const [categoryMap, setCategoryMap] = useState<Map<string, string | null>>(
    () => new Map(result.rows.map((r) => [r.hash, r.suggestedCategoryId ?? null]))
  );

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: () => api.get('/categories').then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const now = new Date();
      const batchId = `import-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const rows = result.rows
        .filter((r) => selected.has(r.hash))
        .map((r) => ({
          date: r.date,
          description: r.description,
          amount: r.amount,
          hash: r.hash,
          ...(categoryMap.get(r.hash) ? { categoryId: categoryMap.get(r.hash) } : {}),
          ...(r.investmentType ? { investmentType: r.investmentType, ticker: r.ticker } : {}),
        }));
      const res = await api.post('/import/confirm', {
        accountId,
        rows,
        filename,
        bankSource: result.bankSource,
        batchId,
      });
      return res.data as { imported: number; skipped: number };
    },
    onSuccess: (data) => {
      notify.success(`Imported ${data.imported} transaction${data.imported !== 1 ? 's' : ''}`);
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['import-history'] });
      onDone();
    },
    onError: () => notify.error('Import failed. Please try again.'),
  });

  function toggleRow(hash: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(hash) ? next.delete(hash) : next.add(hash);
      return next;
    });
  }

  function toggleAll(rows: ParsedRow[], checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      rows.forEach((r) => (checked ? next.add(r.hash) : next.delete(r.hash)));
      return next;
    });
  }

  function setCategory(hash: string, categoryId: string | null) {
    setCategoryMap((prev) => new Map(prev).set(hash, categoryId));
  }

  const newRows = result.rows.filter((r) => r.status === 'new');
  const dupRows = result.rows.filter((r) => r.status === 'duplicate');
  const invalidRows = result.rows.filter((r) => r.status === 'invalid');
  const selectedCount = [...selected].filter((h) => result.rows.some((r) => r.hash === h)).length;
  const suggestedCount = newRows.filter((r) => r.suggestedCategoryId).length;
  const bankLabel = BANK_NAMES[result.bankSource] ?? result.bankSource;

  return (
    <div className="space-y-5">
      {/* Summary bar */}
      <div className="bg-[color:var(--color-surface-hover)] rounded-xl p-4 flex flex-wrap gap-4 items-center justify-between">
        <div className="flex flex-wrap gap-4">
          <Stat label="Detected bank" value={bankLabel} />
          <Stat label="Confidence" value={`${result.confidence}%`} />
          <Stat label="Total rows" value={String(result.totalRows)} />
          <Stat label="New" value={String(result.newCount)} color="green" />
          <Stat label="Duplicate" value={String(result.dupCount)} color="gray" />
          {invalidRows.length > 0 && (
            <Stat label="Invalid" value={String(invalidRows.length)} color="red" />
          )}
          {suggestedCount > 0 && (
            <Stat label="Auto-categorized" value={String(suggestedCount)} color="blue" />
          )}
        </div>
        <p className="text-sm text-[color:var(--color-text-secondary)]">{filename}</p>
      </div>

      {/* Category suggestion notice */}
      {suggestedCount > 0 && (
        <div className="flex items-start gap-2.5 bg-[color:var(--color-surface-hover)] border border-[color:var(--color-border)] rounded-lg px-4 py-3 text-sm text-[color:var(--color-text-secondary)]">
          <Tag size={15} className="shrink-0 mt-0.5" style={{ color: 'var(--color-accent)' }} />
          <span>
            <strong style={{ color: 'var(--color-text)' }}>{suggestedCount}</strong> transaction{suggestedCount !== 1 ? 's' : ''} auto-categorized using your rules.
            Review and adjust categories below before importing.
          </span>
        </div>
      )}

      {/* New rows table */}
      {newRows.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium flex items-center gap-2">
              <CheckCircle2 size={16} className="text-green-500" />
              New transactions ({newRows.length})
            </h3>
            <div className="flex gap-2 text-xs">
              <button
                className="text-[color:var(--color-primary)] hover:underline"
                onClick={() => toggleAll(newRows, true)}
              >
                Select all
              </button>
              <span className="text-[color:var(--color-text-secondary)]">/</span>
              <button
                className="text-[color:var(--color-text-secondary)] hover:underline"
                onClick={() => toggleAll(newRows, false)}
              >
                Deselect all
              </button>
            </div>
          </div>
          <RowTable
            rows={newRows}
            selected={selected}
            categoryMap={categoryMap}
            categories={categories}
            onToggle={toggleRow}
            onCategoryChange={setCategory}
          />
        </div>
      )}

      {/* Duplicate rows (collapsible) */}
      {dupRows.length > 0 && (
        <div>
          <button
            className="flex items-center gap-2 text-sm font-medium text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text)] mb-2"
            onClick={() => setShowDuplicates((v) => !v)}
          >
            {showDuplicates ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            <XCircle size={15} className="text-gray-400" />
            Duplicates ({dupRows.length}) — already in Kuber
          </button>
          {showDuplicates && (
            <RowTable
              rows={dupRows}
              selected={selected}
              categoryMap={categoryMap}
              categories={categories}
              onToggle={toggleRow}
              onCategoryChange={setCategory}
              dimmed
            />
          )}
        </div>
      )}

      {/* Invalid rows */}
      {invalidRows.length > 0 && (
        <div>
          <h3 className="font-medium flex items-center gap-2 text-red-600 mb-2">
            <AlertTriangle size={16} />
            Invalid rows ({invalidRows.length}) — will be skipped
          </h3>
          <div className="rounded-lg border border-red-200 dark:border-red-900 overflow-hidden">
            {invalidRows.map((r) => (
              <div key={r.hash} className="flex items-center gap-3 px-4 py-2 text-sm text-red-700 dark:text-red-400 border-b last:border-0 border-red-100 dark:border-red-900">
                <span className="font-mono text-xs">{r.date}</span>
                <span className="flex-1">{r.description}</span>
                <span className="text-xs opacity-75">{r.error}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-2 border-t border-[color:var(--color-border)]">
        <p className="text-sm text-[color:var(--color-text-secondary)]">
          {selectedCount} row{selectedCount !== 1 ? 's' : ''} selected for import
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={selectedCount === 0 || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? (
              <><Loader2 size={15} className="mr-1.5 animate-spin" />Importing…</>
            ) : (
              `Import ${selectedCount} transaction${selectedCount !== 1 ? 's' : ''}`
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: 'green' | 'gray' | 'red' | 'blue' }) {
  const colorClass =
    color === 'green' ? 'text-green-600 dark:text-green-400' :
    color === 'red'   ? 'text-red-600 dark:text-red-400' :
    color === 'blue'  ? 'text-blue-600 dark:text-blue-400' :
    'text-[color:var(--color-text)]';
  return (
    <div>
      <p className="text-xs text-[color:var(--color-text-secondary)]">{label}</p>
      <p className={`font-semibold text-sm ${colorClass}`}>{value}</p>
    </div>
  );
}

interface RowTableProps {
  rows: ParsedRow[];
  selected: Set<string>;
  categoryMap: Map<string, string | null>;
  categories: Category[];
  onToggle: (hash: string) => void;
  onCategoryChange: (hash: string, categoryId: string | null) => void;
  dimmed?: boolean;
}

const INV_TYPE_COLORS: Record<string, string> = {
  buy:      'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  sell:     'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  dividend: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  transfer: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  fee:      'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  other:    'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

function RowTable({ rows, selected, categoryMap, categories, onToggle, onCategoryChange, dimmed }: RowTableProps) {
  const hasInvestmentData = rows.some((r) => r.investmentType);

  return (
    <div className={`rounded-lg border border-[color:var(--color-border)] overflow-hidden ${dimmed ? 'opacity-60' : ''}`}>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[color:var(--color-surface-hover)] text-[color:var(--color-text-secondary)] text-xs uppercase tracking-wide">
            <th className="px-3 py-2 w-8" />
            <th className="px-3 py-2 text-left">Date</th>
            <th className="px-3 py-2 text-left">Description</th>
            {hasInvestmentData && <th className="px-3 py-2 text-left">Type</th>}
            <th className="px-3 py-2 text-left">Category</th>
            <th className="px-3 py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isSelected = selected.has(row.hash);
            const selectedCategoryId = categoryMap.get(row.hash) ?? null;
            const isSuggested = !!row.suggestedCategoryId && selectedCategoryId === row.suggestedCategoryId;

            return (
              <tr
                key={row.hash}
                className="border-t border-[color:var(--color-border)] hover:bg-[color:var(--color-surface-hover)] cursor-pointer"
                onClick={() => onToggle(row.hash)}
              >
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggle(row.hash)}
                    onClick={(e) => e.stopPropagation()}
                    className="rounded"
                  />
                </td>
                <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{row.date}</td>
                <td className="px-3 py-2 max-w-[180px] truncate">
                  {row.ticker && <span className="font-mono font-bold mr-1.5">{row.ticker}</span>}
                  {row.description}
                </td>
                {hasInvestmentData && (
                  <td className="px-3 py-2">
                    {row.investmentType && (
                      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${INV_TYPE_COLORS[row.investmentType] ?? INV_TYPE_COLORS.other}`}>
                        {row.investmentType.toUpperCase()}
                      </span>
                    )}
                  </td>
                )}
                <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-1">
                    <select
                      value={selectedCategoryId ?? ''}
                      onChange={(e) => onCategoryChange(row.hash, e.target.value || null)}
                      className="text-xs border border-[color:var(--color-border)] rounded px-1.5 py-1 bg-[color:var(--color-surface)] text-[color:var(--color-text)] max-w-[140px]"
                      style={{ minWidth: 100 }}
                    >
                      <option value="">— none —</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>{c.emoji ? `${c.emoji} ` : ''}{c.name}</option>
                      ))}
                    </select>
                    {isSuggested && (
                      <span className="text-[10px] font-semibold px-1 py-0.5 rounded" style={{ backgroundColor: 'var(--color-accent)', color: '#fff', opacity: 0.85 }}>
                        auto
                      </span>
                    )}
                  </div>
                </td>
                <td className={`px-3 py-2 text-right font-medium whitespace-nowrap ${row.amount < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                  {row.amount < 0 ? '-' : '+'}${Math.abs(row.amount).toFixed(2)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
