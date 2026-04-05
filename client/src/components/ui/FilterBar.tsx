import { useState, useRef, useEffect, ReactNode } from 'react';
import { X, SlidersHorizontal, ChevronDown } from 'lucide-react';
import { Badge } from './Badge';

export interface ActiveFilter {
  id: string;
  label: string;
  value: string;
}

export interface FilterOption {
  id: string;
  label: string;
  options?: { value: string; label: string }[];
  onSelect?: (value: string) => void;
}

interface FilterBarProps {
  activeFilters?: ActiveFilter[];
  filterOptions?: FilterOption[];
  onRemoveFilter?: (id: string) => void;
  onClearAll?: () => void;
  className?: string;
  children?: ReactNode;
}

export function FilterBar({
  activeFilters = [],
  filterOptions = [],
  onRemoveFilter,
  onClearAll,
  className = '',
  children,
}: FilterBarProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [activeOptionId, setActiveOptionId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
        setActiveOptionId(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const activeCount = activeFilters.length;

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {/* Add filter trigger */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setDropdownOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] transition-colors focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
          aria-expanded={dropdownOpen}
          aria-haspopup="listbox"
        >
          <SlidersHorizontal size={13} />
          Filter
          {activeCount > 0 && (
            <Badge variant="accent" size="sm">{activeCount}</Badge>
          )}
          <ChevronDown size={12} className={`transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
        </button>

        {dropdownOpen && filterOptions.length > 0 && (
          <div
            className="absolute left-0 top-full mt-1 z-20 min-w-44 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-md)] py-1"
            role="listbox"
          >
            {filterOptions.map((opt) => (
              <div key={opt.id}>
                <button
                  className="w-full flex items-center justify-between px-3 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors"
                  onClick={() => {
                    if (opt.options) {
                      setActiveOptionId((id) => id === opt.id ? null : opt.id);
                    } else if (opt.onSelect) {
                      opt.onSelect('');
                      setDropdownOpen(false);
                    }
                  }}
                  role="option"
                  aria-selected={activeOptionId === opt.id}
                >
                  <span>{opt.label}</span>
                  {opt.options && (
                    <ChevronDown size={12} className={`transition-transform ${activeOptionId === opt.id ? 'rotate-180' : ''}`} />
                  )}
                </button>
                {activeOptionId === opt.id && opt.options && (
                  <div className="border-t border-[var(--color-border)] py-1 bg-[var(--color-surface-hover)]">
                    {opt.options.map((sub) => (
                      <button
                        key={sub.value}
                        className="w-full px-6 py-1.5 text-sm text-left text-[var(--color-text)] hover:bg-[var(--color-surface)] transition-colors"
                        onClick={() => {
                          opt.onSelect?.(sub.value);
                          setDropdownOpen(false);
                          setActiveOptionId(null);
                        }}
                      >
                        {sub.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Active filter chips */}
      {activeFilters.map((filter) => (
        <span
          key={filter.id}
          className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 text-xs font-medium rounded-[var(--radius-full)] bg-[var(--color-accent-light)] text-[var(--color-accent)] border border-[var(--color-accent)]/20"
        >
          <span className="text-[var(--color-text-secondary)]">{filter.label}:</span>
          <span>{filter.value}</span>
          {onRemoveFilter && (
            <button
              onClick={() => onRemoveFilter(filter.id)}
              className="ml-0.5 flex items-center justify-center h-4 w-4 rounded-full hover:bg-[var(--color-accent)]/20 transition-colors"
              aria-label={`Remove ${filter.label} filter`}
            >
              <X size={10} />
            </button>
          )}
        </span>
      ))}

      {/* Clear all */}
      {activeCount > 0 && onClearAll && (
        <button
          onClick={onClearAll}
          className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-danger)] transition-colors underline-offset-2 hover:underline"
        >
          Clear all
        </button>
      )}

      {/* Additional content slot */}
      {children}
    </div>
  );
}
