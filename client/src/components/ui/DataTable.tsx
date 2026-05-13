import { useState, ReactNode } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { Skeleton } from './Skeleton';
import { EmptyState } from './EmptyState';
import { Checkbox } from './Checkbox';

type SortDir = 'asc' | 'desc' | null;

export interface Column<T> {
  key: keyof T | string;
  header: string;
  render?: (row: T) => ReactNode;
  sortable?: boolean;
  width?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (row: T) => string;
  loading?: boolean;
  loadingRows?: number;
  selectable?: boolean;
  selectedKeys?: Set<string>;
  onSelectionChange?: (keys: Set<string>) => void;
  stickyHeader?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  className?: string;
}

function SortIcon({ dir }: { dir: SortDir }) {
  if (dir === 'asc') return <ChevronUp size={12} className="flex-shrink-0" />;
  if (dir === 'desc') return <ChevronDown size={12} className="flex-shrink-0" />;
  return <ChevronsUpDown size={12} className="flex-shrink-0 opacity-40" />;
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  loading,
  loadingRows = 5,
  selectable,
  selectedKeys,
  onSelectionChange,
  stickyHeader,
  emptyTitle = 'No results',
  emptyDescription,
  emptyAction,
  className = '',
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);

  const handleSort = (key: string) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir('asc');
    } else if (sortDir === 'asc') {
      setSortDir('desc');
    } else if (sortDir === 'desc') {
      setSortKey(null);
      setSortDir(null);
    } else {
      setSortDir('asc');
    }
  };

  const sortedData = [...data].sort((a, b) => {
    if (!sortKey || !sortDir) return 0;
    const aVal = (a as Record<string, unknown>)[sortKey];
    const bVal = (b as Record<string, unknown>)[sortKey];
    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;
    const cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true });
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const allKeys = data.map(keyExtractor);
  const allSelected = allKeys.length > 0 && allKeys.every((k) => selectedKeys?.has(k));
  const someSelected = !allSelected && allKeys.some((k) => selectedKeys?.has(k));

  const toggleAll = () => {
    if (!onSelectionChange) return;
    if (allSelected) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(allKeys));
    }
  };

  const toggleRow = (key: string) => {
    if (!onSelectionChange || !selectedKeys) return;
    const next = new Set(selectedKeys);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    onSelectionChange(next);
  };

  return (
    <div className={`w-full overflow-auto ${className}`}>
      <table className="w-full border-collapse text-sm">
        <thead className={stickyHeader ? 'sticky top-0 z-10' : ''}>
          <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
            {selectable && (
              <th className="w-10 px-3 py-3 text-left">
                <Checkbox
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={toggleAll}
                  aria-label="Select all rows"
                />
              </th>
            )}
            {columns.map((col) => (
              <th
                key={String(col.key)}
                className="px-4 py-3 text-left font-medium text-[var(--color-text-secondary)] whitespace-nowrap"
                style={col.width ? { width: col.width } : undefined}
                aria-sort={col.sortable && sortKey === String(col.key) ? (sortDir === 'asc' ? 'ascending' : sortDir === 'desc' ? 'descending' : 'none') : undefined}
              >
                {col.sortable ? (
                  <button
                    type="button"
                    onClick={() => handleSort(String(col.key))}
                    className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] hover:text-[var(--color-text)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
                    aria-label={`Sort by ${col.header}`}
                  >
                    {col.header}
                    <SortIcon dir={sortKey === String(col.key) ? sortDir : null} />
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1">{col.header}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: loadingRows }).map((_, i) => (
              <tr key={i} className="border-b border-[var(--color-border)]">
                {selectable && <td className="px-3 py-3"><Skeleton width={16} height={16} /></td>}
                {columns.map((col) => (
                  <td key={String(col.key)} className="px-4 py-3">
                    <Skeleton height={14} width="80%" />
                  </td>
                ))}
              </tr>
            ))
          ) : sortedData.length === 0 ? (
            <tr>
              <td colSpan={columns.length + (selectable ? 1 : 0)}>
                <EmptyState
                  title={emptyTitle}
                  description={emptyDescription}
                  action={emptyAction}
                />
              </td>
            </tr>
          ) : (
            sortedData.map((row) => {
              const key = keyExtractor(row);
              const isSelected = selectedKeys?.has(key) ?? false;
              return (
                <tr
                  key={key}
                  className={`border-b border-[var(--color-border)] transition-colors hover:bg-[var(--color-surface-hover)] ${isSelected ? 'bg-[var(--color-accent-light)]' : ''}`}
                >
                  {selectable && (
                    <td className="px-3 py-3">
                      <Checkbox
                        checked={isSelected}
                        onChange={() => toggleRow(key)}
                        aria-label={`Select row ${key}`}
                      />
                    </td>
                  )}
                  {columns.map((col) => (
                    <td key={String(col.key)} className="px-4 py-3 text-[var(--color-text)]">
                      {col.render
                        ? col.render(row)
                        : String((row as Record<string, unknown>)[String(col.key)] ?? '')}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
