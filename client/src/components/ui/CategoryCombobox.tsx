import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, Check } from 'lucide-react';

export interface CategoryOption {
  id: string;
  name: string;
  icon?: string | null;
  groupName?: string | null;
}

interface CategoryComboboxProps {
  categories: CategoryOption[];
  value: string;           // selected category id, '' = none
  onChange: (id: string) => void;
  placeholder?: string;
  label?: string;
  className?: string;
  disabled?: boolean;
}

export function CategoryCombobox({
  categories,
  value,
  onChange,
  placeholder = 'Select category…',
  label,
  className = '',
  disabled = false,
}: CategoryComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = categories.find((c) => c.id === value) ?? null;

  const filtered = search
    ? categories.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
    : categories;

  const groups = Array.from(new Set(filtered.map((c) => c.groupName ?? 'Other')));

  useEffect(() => {
    if (open) {
      setSearch('');
      setTimeout(() => searchRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const handleSelect = (id: string) => {
    onChange(id);
    setOpen(false);
  };

  return (
    <div className={`flex flex-col gap-1.5 ${className}`} ref={containerRef}>
      {label && (
        <label className="text-sm font-medium text-[var(--color-text)]">{label}</label>
      )}
      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-[var(--radius-md)] border text-sm bg-[var(--color-surface)] text-left transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent ${
            open ? 'border-[var(--color-accent)]' : 'border-[var(--color-border)]'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-[var(--color-accent)]'}`}
        >
          {selected ? (
            <>
              {selected.icon ? (
                <span className="text-base shrink-0 leading-none">{selected.icon}</span>
              ) : (
                <span className="w-5 h-5 rounded-full bg-[var(--color-accent)] flex items-center justify-center text-[0.625rem] shrink-0 text-white">
                  {selected.name[0]}
                </span>
              )}
              <span className="flex-1 truncate text-[var(--color-text)]">{selected.name}</span>
            </>
          ) : (
            <span className="flex-1 truncate text-[var(--color-text-muted)]">{placeholder}</span>
          )}
          <ChevronDown
            size={14}
            className={`shrink-0 text-[var(--color-text-muted)] transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          />
        </button>

        {open && (
          <div className="absolute z-50 mt-1 w-full min-w-[200px] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-lg)] overflow-hidden">
            {/* Search */}
            <div className="p-2 border-b border-[var(--color-border)]">
              <div className="relative flex items-center">
                <Search size={13} className="absolute left-2.5 text-[var(--color-text-muted)] pointer-events-none" />
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search…"
                  className="w-full pl-8 pr-3 py-1.5 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                />
              </div>
            </div>

            {/* Options */}
            <div className="max-h-[220px] overflow-y-auto py-1">
              {groups.map((group) => (
                <div key={group}>
                  <div className="px-3 py-1 text-[0.6875rem] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                    {group}
                  </div>
                  {filtered
                    .filter((c) => (c.groupName ?? 'Other') === group)
                    .map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => handleSelect(cat.id)}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left transition-colors ${
                          cat.id === value
                            ? 'bg-[var(--color-accent-light)] text-[var(--color-accent)]'
                            : 'text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]'
                        }`}
                      >
                        {cat.icon ? (
                          <span className="text-base shrink-0 leading-none">{cat.icon}</span>
                        ) : (
                          <span className="w-5 h-5 rounded-full bg-[var(--color-accent)] flex items-center justify-center text-[0.625rem] shrink-0 text-white">
                            {cat.name[0]}
                          </span>
                        )}
                        <span className={`flex-1 truncate ${cat.id === value ? 'font-semibold' : ''}`}>
                          {cat.name}
                        </span>
                        {cat.id === value && <Check size={13} className="shrink-0" />}
                      </button>
                    ))}
                </div>
              ))}
              {filtered.length === 0 && (
                <div className="px-3 py-4 text-center text-sm text-[var(--color-text-muted)]">
                  No categories found
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
