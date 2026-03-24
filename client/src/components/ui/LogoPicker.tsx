import { useState, useRef, useEffect, useMemo } from 'react';
import { Search, X, ChevronDown } from 'lucide-react';
import { LOGO_CATALOG } from '@/lib/logoCatalog';
import { InstitutionLogo } from './InstitutionLogo';

interface LogoPickerProps {
  value: string | null;           // current slug override (null = auto-detect)
  institutionName: string;        // used for auto-detect preview
  onChange: (slug: string | null) => void;
}

export function LogoPicker({ value, institutionName, onChange }: LogoPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Focus search when opened
  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 50);
    else setSearch('');
  }, [open]);

  const filtered = useMemo(() => {
    if (!search.trim()) return LOGO_CATALOG;
    const q = search.toLowerCase();
    return LOGO_CATALOG.filter(e => e.slug.includes(q) || e.label.toLowerCase().includes(q));
  }, [search]);

  const selectedEntry = value ? LOGO_CATALOG.find(e => e.slug === value) : null;

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {/* Trigger button */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '7px 10px',
          border: '1px solid var(--color-border)',
          borderRadius: 8,
          cursor: 'pointer',
          background: 'var(--color-surface)',
          userSelect: 'none',
        }}
      >
        <InstitutionLogo
          name={institutionName || 'Bank'}
          logoSlug={value ?? undefined}
          size={28}
        />
        <span style={{ flex: 1, fontSize: '0.875rem', color: 'var(--color-text)' }}>
          {value ? (selectedEntry?.label ?? value) : 'Auto-detect'}
        </span>
        {value && (
          <span
            onClick={(e) => { e.stopPropagation(); onChange(null); }}
            style={{ color: 'var(--color-text-secondary)', cursor: 'pointer', display: 'flex' }}
          >
            <X size={14} />
          </span>
        )}
        <ChevronDown size={14} style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }} />
      </div>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: 0,
          right: 0,
          minWidth: 320,
          maxWidth: 420,
          zIndex: 50,
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
          overflow: 'hidden',
        }}>
          {/* Search */}
          <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Search size={14} style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }} />
            <input
              ref={searchRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search logos…"
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                fontSize: '0.875rem',
                color: 'var(--color-text)',
              }}
            />
            {search && (
              <X size={13} style={{ cursor: 'pointer', color: 'var(--color-text-secondary)' }} onClick={() => setSearch('')} />
            )}
          </div>

          {/* Auto-detect option */}
          <div
            onClick={() => { onChange(null); setOpen(false); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 10px',
              cursor: 'pointer',
              borderBottom: '1px solid var(--color-border)',
              background: value === null ? 'var(--color-accent-subtle, rgba(99,102,241,0.08))' : 'transparent',
              fontSize: '0.8125rem',
              color: 'var(--color-text-secondary)',
            }}
          >
            <InstitutionLogo name={institutionName || 'Bank'} size={24} />
            <span>Auto-detect from name</span>
            {value === null && <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--color-accent)' }}>✓ active</span>}
          </div>

          {/* Logo grid */}
          <div style={{
            maxHeight: 280,
            overflowY: 'auto',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))',
            gap: 2,
            padding: 6,
          }}>
            {filtered.length === 0 ? (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '20px', color: 'var(--color-text-secondary)', fontSize: '0.8125rem' }}>
                No logos found
              </div>
            ) : (
              filtered.map(entry => (
                <div
                  key={entry.slug}
                  onClick={() => { onChange(entry.slug); setOpen(false); }}
                  title={entry.label}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 4,
                    padding: '6px 4px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    background: value === entry.slug ? 'var(--color-accent-subtle, rgba(99,102,241,0.1))' : 'transparent',
                    outline: value === entry.slug ? '2px solid var(--color-accent)' : 'none',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => {
                    if (value !== entry.slug) (e.currentTarget as HTMLDivElement).style.background = 'var(--color-border)';
                  }}
                  onMouseLeave={e => {
                    if (value !== entry.slug) (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                  }}
                >
                  <InstitutionLogo name={entry.label} logoSlug={entry.slug} size={32} />
                  <span style={{
                    fontSize: '0.625rem',
                    color: 'var(--color-text-secondary)',
                    textAlign: 'center',
                    lineHeight: 1.2,
                    maxWidth: 64,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {entry.label}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
