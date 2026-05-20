import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TransactionResult {
  id: string;
  merchant: string;
  amount: number;
  date: string;
  category: string;
}

interface AccountResult {
  id: string;
  name: string;
  type: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'kuber_recent_searches';
const MAX_RECENT = 5;

function getRecentSearches(): string[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function addRecentSearch(term: string) {
  const prev = getRecentSearches().filter((t) => t !== term);
  const updated = [term, ...prev].slice(0, MAX_RECENT);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

const fmtCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

const fmtDate = (date: string) =>
  new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

// ─── Component ────────────────────────────────────────────────────────────────

interface SearchModalProps {
  open: boolean;
  onClose: () => void;
}

export function SearchModal({ open, onClose }: SearchModalProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [recentSearches, setRecentSearches] = useState<string[]>(getRecentSearches);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Debounce query 300ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery('');
      setDebouncedQuery('');
      setActiveIndex(-1);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Search transactions
  const { data: txnResults } = useQuery<TransactionResult[]>({
    queryKey: ['search', 'transactions', debouncedQuery],
    queryFn: () =>
      api
        .get(`/transactions?search=${encodeURIComponent(debouncedQuery)}&limit=5`)
        .then((r) => r.data.transactions ?? []),
    enabled: debouncedQuery.length > 1,
    staleTime: 30_000,
  });

  // Cached accounts for local filtering
  const queryClient = useQueryClient();
  const cachedAccountsData = queryClient.getQueryData<{ groups?: { accounts: AccountResult[] }[] }>(['accounts']);
  const allAccounts = cachedAccountsData?.groups?.flatMap((g) => g.accounts) ?? [];
  const cachedAccounts = debouncedQuery.length > 1
    ? allAccounts.filter((a) => a.name.toLowerCase().includes(debouncedQuery.toLowerCase()))
    : [];

  // Build flat results list for keyboard nav
  const txns = txnResults ?? [];
  const accounts = cachedAccounts;
  const hasResults = txns.length > 0 || accounts.length > 0;

  // Flat navigable items
  type NavItem =
    | { kind: 'transaction'; item: TransactionResult }
    | { kind: 'account'; item: AccountResult }
    | { kind: 'recent'; term: string };

  const navItems: NavItem[] = debouncedQuery.length > 1
    ? [
        ...txns.map((item): NavItem => ({ kind: 'transaction', item })),
        ...accounts.map((item): NavItem => ({ kind: 'account', item })),
      ]
    : recentSearches.map((term): NavItem => ({ kind: 'recent', term }));

  function selectItem(item: NavItem) {
    if (item.kind === 'recent') {
      setQuery(item.term);
      setDebouncedQuery(item.term);
      return;
    }
    if (item.kind === 'transaction') {
      addRecentSearch(query);
      setRecentSearches(getRecentSearches());
      navigate('/transactions');
      onClose();
      return;
    }
    if (item.kind === 'account') {
      addRecentSearch(query);
      setRecentSearches(getRecentSearches());
      navigate('/accounts');
      onClose();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, navItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      selectItem(navItems[activeIndex]);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (activeIndex >= 0) {
      selectItem(navItems[activeIndex]);
    } else if (query.trim()) {
      addRecentSearch(query.trim());
      setRecentSearches(getRecentSearches());
    }
  }

  if (!open) return null;

  return (
    <>
      {/* Overlay */}
      <div
        ref={overlayRef}
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.4)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          paddingTop: '8vh',
        }}
      >
        {/* Modal */}
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full sm:w-[600px] mx-4 sm:mx-0"
          style={{
            backgroundColor: 'var(--color-surface)',
            borderRadius: 'var(--radius-xl)',
            boxShadow: 'var(--shadow-lg)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Search input row */}
          <form onSubmit={handleSubmit}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '0.875rem 1rem',
                gap: '0.625rem',
                borderBottom: '1px solid var(--color-border)',
              }}
            >
              <span style={{ fontSize: '1.125rem', flexShrink: 0 }}>🔍</span>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActiveIndex(-1);
                }}
                onKeyDown={handleKeyDown}
                placeholder="Search transactions, accounts, categories..."
                style={{
                  flex: 1,
                  border: 'none',
                  outline: 'none',
                  backgroundColor: 'transparent',
                  color: 'var(--color-text)',
                  fontSize: '1rem',
                }}
              />
              <kbd
                style={{
                  fontSize: '0.6875rem',
                  color: 'var(--color-text-muted)',
                  backgroundColor: 'var(--color-bg)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.125rem 0.375rem',
                  flexShrink: 0,
                }}
              >
                Esc
              </kbd>
            </div>
          </form>

          {/* Results / Recents */}
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {debouncedQuery.length <= 1 ? (
              /* Recent searches */
              recentSearches.length > 0 ? (
                <div>
                  <div
                    style={{
                      padding: '0.5rem 1rem 0.25rem',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: 'var(--color-text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    Recent searches
                  </div>
                  {recentSearches.map((term, idx) => (
                    <ResultRow
                      key={term}
                      active={idx === activeIndex}
                      icon="🕐"
                      label={term}
                      onClick={() => {
                        setQuery(term);
                        setDebouncedQuery(term);
                        setActiveIndex(-1);
                      }}
                    />
                  ))}
                </div>
              ) : (
                <div
                  style={{
                    padding: '1.5rem 1rem',
                    color: 'var(--color-text-muted)',
                    fontSize: '0.875rem',
                    textAlign: 'center',
                  }}
                >
                  Start typing to search
                </div>
              )
            ) : hasResults ? (
              <>
                {txns.length > 0 && (
                  <section>
                    <div
                      style={{
                        padding: '0.5rem 1rem 0.25rem',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: 'var(--color-text-muted)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
                      Transactions
                    </div>
                    {txns.map((txn, idx) => (
                      <ResultRow
                        key={txn.id}
                        active={idx === activeIndex}
                        icon="💳"
                        label={`${txn.merchant} — ${fmtCurrency(Math.abs(txn.amount))}`}
                        meta={fmtDate(txn.date)}
                        tag="transaction"
                        onClick={() => selectItem({ kind: 'transaction', item: txn })}
                      />
                    ))}
                  </section>
                )}
                {accounts.length > 0 && (
                  <section>
                    <div
                      style={{
                        padding: '0.5rem 1rem 0.25rem',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: 'var(--color-text-muted)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
                      Accounts
                    </div>
                    {accounts.map((acc, idx) => (
                      <ResultRow
                        key={acc.id}
                        active={txns.length + idx === activeIndex}
                        icon="🏦"
                        label={acc.name}
                        meta={acc.type}
                        tag="account"
                        onClick={() => selectItem({ kind: 'account', item: acc })}
                      />
                    ))}
                  </section>
                )}
              </>
            ) : (
              <div
                style={{
                  padding: '1.5rem 1rem',
                  color: 'var(--color-text-muted)',
                  fontSize: '0.875rem',
                  textAlign: 'center',
                }}
              >
                No results for "{debouncedQuery}"
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── ResultRow ────────────────────────────────────────────────────────────────

function ResultRow({
  icon,
  label,
  meta,
  tag,
  active,
  onClick,
}: {
  icon: string;
  label: string;
  meta?: string;
  tag?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.625rem',
        padding: '0.625rem 1rem',
        cursor: 'pointer',
        backgroundColor: active ? 'var(--color-accent-light)' : 'transparent',
        transition: 'background 0.1s',
        outline: 'none',
      }}
      onFocus={(e) => {
        e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)';
      }}
      onBlur={(e) => {
        if (!active) e.currentTarget.style.backgroundColor = 'transparent';
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)';
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.backgroundColor = 'transparent';
      }}
    >
      <span style={{ fontSize: '1rem', flexShrink: 0 }}>{icon}</span>
      <span
        style={{
          flex: 1,
          fontSize: '0.875rem',
          color: 'var(--color-text)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {label}
      </span>
      {meta && (
        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', flexShrink: 0 }}>
          {meta}
        </span>
      )}
      {tag && (
        <span
          style={{
            fontSize: '0.6875rem',
            color: 'var(--color-text-muted)',
            backgroundColor: 'var(--color-bg)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            padding: '0.1rem 0.375rem',
            flexShrink: 0,
          }}
        >
          {tag}
        </span>
      )}
    </div>
  );
}
