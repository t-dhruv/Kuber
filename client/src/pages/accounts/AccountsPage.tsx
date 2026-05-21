import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line,
} from 'recharts';
import { ChevronDown, ChevronRight, RefreshCw, Plus, MoreHorizontal, Pencil, EyeOff, MinusCircle, Trash2, X, Upload } from 'lucide-react';
import { api } from '@/lib/api';
import { getColorToken } from '@/lib/colors';
import {
  Card, Button, Input, Select, Modal, ModalFooter, Skeleton, InstitutionLogo, ConfirmDialog,
} from '@/components/ui';
import { notify } from '@/components/ui';
import { LiabilityDetailPanel } from './components/LiabilityDetailPanel';
import { usePrefetchLogos } from '@/hooks/usePrefetchLogos';

// ─── Types ────────────────────────────────────────────────────────────────────

type AccountType = 'checking' | 'savings' | 'credit_card' | 'investment' | 'loan' | 'other' | 'tfsa' | 'rrsp' | 'fhsa' | 'resp' | '401k' | 'ira' | 'roth_ira';

interface Account {
  id: string;
  name: string;
  type: AccountType;
  institution?: string | null;
  institutionLogo?: string | null;
  lastFour?: string | null;
  balance: number;
  currency: string;
  creditLimit?: number | null;
  availableCredit?: number | null;
  excludeFromNetWorth?: boolean;
  isHidden?: boolean;
  lastSyncedAt?: string | null;
  createdAt?: string;
}

interface AccountGroup {
  type: string;
  totalBalance: number;
  accounts: Account[];
}

interface NetWorth {
  assets: number;
  liabilities: number;
  total: number;
}

interface AccountsData {
  groups: AccountGroup[];
  netWorth: NetWorth;
}

type NetWorthRange = '1M' | '3M' | '6M' | '1Y' | 'ALL';
type BalanceHistoryRange = '1M' | '3M' | '6M' | '1Y';

interface NetWorthHistoryPoint {
  date: string;
  assets: number;
  liabilities: number;
  netWorth: number;
}

interface NetWorthHistoryData {
  current: { assets: number; liabilities: number; netWorth: number };
  history: NetWorthHistoryPoint[];
  change: { amount: number; percent: number; since: string | null };
}

interface Transaction {
  id: string;
  merchantName: string;
  categoryName: string | null;
  categoryIcon?: string | null;
  amount: number;
  date: string;
}

interface AccountDetail {
  account: Account;
  balanceHistory: { date: string; balance: number }[];
  recentTransactions: Transaction[];
}

interface AccountFormValues {
  name: string;
  type: AccountType;
  institution: string;
  institutionLogo: string | null;
  lastFour: string;
  balance: string;
  currency: string;
  creditLimit: string;
}

const EMPTY_FORM: AccountFormValues = {
  name: '',
  type: 'checking',
  institution: '',
  institutionLogo: null,
  lastFour: '',
  balance: '',
  currency: 'USD',
  creditLimit: '',
};

// ─── Constants ───────────────────────────────────────────────────────────────

const CURRENCY_OPTIONS = [
  { value: 'USD', label: 'USD — US Dollar' },
  { value: 'EUR', label: 'EUR — Euro' },
  { value: 'GBP', label: 'GBP — British Pound' },
  { value: 'CAD', label: 'CAD — Canadian Dollar' },
  { value: 'AUD', label: 'AUD — Australian Dollar' },
  { value: 'CHF', label: 'CHF — Swiss Franc' },
  { value: 'JPY', label: 'JPY — Japanese Yen' },
  { value: 'MXN', label: 'MXN — Mexican Peso' },
  { value: 'NZD', label: 'NZD — New Zealand Dollar' },
  { value: 'INR', label: 'INR — Indian Rupee' },
];

const TYPE_OPTIONS = [
  { value: 'checking', label: 'Checking' },
  { value: 'savings', label: 'Savings' },
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'investment', label: 'Investment' },
  { value: 'loan', label: 'Loan' },
  { value: 'other', label: 'Other' },
  // Canadian registered accounts
  { value: 'tfsa', label: 'TFSA (Tax-Free Savings)' },
  { value: 'rrsp', label: 'RRSP (Retirement Savings)' },
  { value: 'fhsa', label: 'FHSA (First Home Savings)' },
  { value: 'resp', label: 'RESP (Education Savings)' },
  // US retirement accounts
  { value: '401k', label: '401(k)' },
  { value: 'ira', label: 'IRA' },
  { value: 'roth_ira', label: 'Roth IRA' },
];

// Display order: liquid first, then investment, then liabilities, then other
const GROUP_ORDER: AccountType[] = [
  'checking',
  'savings',
  'investment',
  'tfsa',
  'rrsp',
  'fhsa',
  'resp',
  '401k',
  'ira',
  'roth_ira',
  'credit_card',
  'loan',
  'other',
];

const GROUP_LABELS: Record<AccountType, string> = {
  checking: 'Checking',
  savings: 'Savings',
  credit_card: 'Credit Cards',
  investment: 'Investment',
  loan: 'Loans',
  other: 'Other',
  tfsa: 'TFSA',
  rrsp: 'RRSP',
  fhsa: 'FHSA',
  resp: 'RESP',
  '401k': '401(k)',
  ira: 'IRA',
  roth_ira: 'Roth IRA',
};

// ─── Formatters ──────────────────────────────────────────────────────────────

const fmtCurrency = (amount: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);

const fmtDate = (date: string) =>
  new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const fmtChange = (change: number) => {
  const sign = change >= 0 ? '+' : '';
  return `${sign}${fmtCurrency(change)}`;
};

const fmtPercent = (pct: number) => {
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────


function isLiability(type: AccountType): boolean {
  return type === 'credit_card' || type === 'loan';
}

const INVESTMENT_TYPES: AccountType[] = ['investment', 'tfsa', 'rrsp', 'fhsa', 'resp', '401k', 'ira', 'roth_ira'];

function balanceColor(balance: number, type: AccountType): string {
  if (balance < 0) return 'var(--color-danger)';
  if (INVESTMENT_TYPES.includes(type) && balance > 0) return 'var(--color-success)';
  return 'var(--color-text)';
}

// Build a Map<AccountType, Account[]> from the server's groups array.
// Server returns type in uppercase (e.g. 'CHECKING'); normalise to lowercase.
function buildGroupMap(groups: AccountGroup[]): Map<AccountType, Account[]> {
  const map = new Map<AccountType, Account[]>();
  for (const type of GROUP_ORDER) map.set(type, []);
  for (const group of groups) {
    const key = group.type.toLowerCase() as AccountType;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(...group.accounts);
  }
  return map;
}

function groupTotal(accounts: Account[]): number {
  return accounts.reduce((sum, a) => sum + a.balance, 0);
}

// Server no longer provides oneMonthChange; return 0 so the UI still renders.
function groupMonthChange(_accounts: Account[]): number {
  return 0;
}

// ─── Overflow Menu ────────────────────────────────────────────────────────────

function OverflowMenu({
  onEdit,
  onHide,
  onExclude,
  onDelete,
}: {
  onEdit: () => void;
  onHide: () => void;
  onExclude: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKeyUp(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKeyUp);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyUp);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
            e.preventDefault();
            e.stopPropagation();
            setOpen(true);
          }
        }}
        className="bg-transparent border-0 cursor-pointer p-1.5 rounded-[var(--radius-sm)] text-[var(--color-text-secondary)] flex items-center hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-1 transition-colors"
        aria-label="Account options"
        aria-haspopup="true"
        aria-expanded={open}
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-[var(--shadow-md)] min-w-[180px] overflow-hidden">
          {[
            { icon: <Pencil size={14} />, label: 'Edit', action: onEdit, danger: false },
            { icon: <EyeOff size={14} />, label: 'Hide account', action: onHide, danger: false },
            { icon: <MinusCircle size={14} />, label: 'Exclude from net worth', action: onExclude, danger: false },
          ].map(({ icon, label, action, danger }) => (
            <button
              key={label}
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); action(); setOpen(false); }}
              className="flex items-center gap-2 w-full px-3.5 py-2 bg-transparent border-0 cursor-pointer text-[0.8125rem] text-left focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-1"
              style={{ color: danger ? 'var(--color-danger)' : 'var(--color-text)' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <span style={{ color: danger ? 'var(--color-danger)' : 'var(--color-text-secondary)' }}>{icon}</span>
              {label}
            </button>
          ))}
          <div className="h-px bg-[var(--color-border)] my-1" />
          <button
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onDelete(); setOpen(false); }}
            className="flex items-center gap-2 w-full px-3.5 py-2 bg-transparent border-0 cursor-pointer text-[0.8125rem] text-[var(--color-danger)] text-left focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-1"
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <Trash2 size={14} />
            Delete account
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Account Row ─────────────────────────────────────────────────────────────

function AccountRow({
  account,
  onClick,
  onEdit,
  onDelete,
  monthChange,
}: {
  account: Account;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
  monthChange?: number;
}) {
  const TYPE_LABELS: Record<string, string> = {
    checking: 'Checking', savings: 'Savings', credit_card: 'Credit Card',
    investment: 'Investment', loan: 'Loan', tfsa: 'TFSA', rrsp: 'RRSP',
    fhsa: 'FHSA', resp: 'RESP', '401k': '401(k)', ira: 'IRA', roth_ira: 'Roth IRA', other: 'Other',
  };
  const displayName = account.institution
    ? account.lastFour
      ? `${account.institution} ••${account.lastFour}`
      : account.institution
    : (TYPE_LABELS[account.type] ?? account.type);

  return (
    <div
      className="flex items-center gap-3 h-12 cursor-pointer rounded-[var(--radius-md)] px-2"
      onClick={onClick}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)')}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
    >
      {/* Bank logo */}
      <InstitutionLogo name={account.institution ?? account.name} logoUrl={account.institutionLogo ?? undefined} size={40} />

      {/* Name + last four */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-[var(--color-text)] truncate">
          {account.name}
        </div>
        <div className="text-xs text-[var(--color-text-muted)]">
          {displayName}
        </div>
      </div>

      {/* Balance + optional 1M change */}
      <div className="flex flex-col items-end shrink-0 mr-1">
        <div className="text-sm font-semibold" style={{ color: balanceColor(account.balance, account.type), fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>
          {account.type === 'credit_card'
            ? fmtCurrency(Math.abs(account.balance), account.currency)
            : fmtCurrency(account.balance, account.currency)}
        </div>
        {monthChange !== undefined && (
          <div className="text-[0.6875rem]" style={{ color: monthChange >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
            {fmtChange(monthChange)}
          </div>
        )}
      </div>

      {/* Overflow menu */}
      <OverflowMenu
        onEdit={onEdit}
        onHide={() => notify.info(`${account.name} hidden`)}
        onExclude={() => notify.info(`${account.name} excluded from net worth`)}
        onDelete={onDelete}
      />
    </div>
  );
}

// ─── Account Group ────────────────────────────────────────────────────────────

function AccountGroup({
  type,
  accounts,
  onAccountClick,
  onEditAccount,
  onDeleteAccount,
}: {
  type: AccountType;
  accounts: Account[];
  onAccountClick: (account: Account) => void;
  onEditAccount: (account: Account) => void;
  onDeleteAccount: (account: Account) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  if (accounts.length === 0) return null;

  const total = groupTotal(accounts);
  const change = groupMonthChange(accounts);

  return (
    <Card padding="none" style={{ overflow: 'visible' }}>
      {/* Group header */}
      <div
        onClick={() => setCollapsed((v) => !v)}
        className="flex items-center gap-2 py-3 px-4 bg-[var(--color-surface-hover)] cursor-pointer select-none"
      >
        <span className="text-[var(--color-text-muted)] shrink-0">
          {collapsed
            ? <ChevronRight size={16} />
            : <ChevronDown size={16} />
          }
        </span>
        <span className="flex-1 text-[0.8125rem] font-semibold text-[var(--color-text-secondary)] uppercase tracking-[0.04em]">
          {GROUP_LABELS[type]}
        </span>
        <span className="text-sm font-semibold text-[var(--color-text)] mr-3">
          {fmtCurrency(total)}
        </span>
        <span className="text-xs min-w-[60px] text-right" style={{ color: change >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
          {fmtChange(change)}
        </span>
      </div>

      {/* Account rows */}
      {!collapsed && (
        <div className="pt-1 px-2 pb-2">
          {accounts.map((account, idx) => (
            <div key={account.id}>
              <AccountRow
                account={account}
                onClick={() => onAccountClick(account)}
                onEdit={() => onEditAccount(account)}
                onDelete={() => onDeleteAccount(account)}
              />
              {idx < accounts.length - 1 && (
                <div className="h-px bg-[var(--color-border)] mx-2" />
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ─── Net Worth Chart ──────────────────────────────────────────────────────────

const NW_RANGES: NetWorthRange[] = ['1M', '3M', '6M', '1Y', 'ALL'];

function NetWorthChart() {
  const [range, setRange] = useState<NetWorthRange>('1Y');

  const { data, isLoading } = useQuery<NetWorthHistoryData>({
    queryKey: ['networth', 'history', range],
    queryFn: () => api.get(`/networth/history?range=${range}`).then((r) => r.data),
  });

  const current = data?.current;
  const history = data?.history ?? [];
  const change = data?.change;

  const changePositive = (change?.amount ?? 0) >= 0;

  return (
    <Card padding="lg">
      {/* Header: current net worth + range tabs */}
      <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
        <div>
          <div className="text-xs text-[var(--color-text-muted)] mb-1">Net Worth</div>
          {isLoading ? (
            <Skeleton height={36} width={160} />
          ) : (
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '2.5rem', fontWeight: 700, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', color: (current?.netWorth ?? 0) >= 0 ? 'var(--color-text)' : 'var(--color-danger)' }}>
              {fmtCurrency(current?.netWorth ?? 0)}
            </div>
          )}
          {!isLoading && change && change.since && (
            <div className="mt-1">
              <span style={{
                display: 'inline-flex', alignItems: 'center',
                background: changePositive ? 'var(--color-success-light)' : 'var(--color-danger-light)',
                color: changePositive ? 'var(--color-success)' : 'var(--color-danger)',
                padding: '2px 8px', borderRadius: 'var(--radius-full)', fontSize: 13, fontWeight: 500,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: changePositive ? 'var(--color-success)' : 'var(--color-danger)', display: 'inline-block', marginRight: 4 }} />
                {fmtChange(change.amount)} ({fmtPercent(change.percent)}) since {fmtDate(change.since)}
              </span>
            </div>
          )}
        </div>
        {/* Range tabs */}
        <div style={{ background: 'var(--color-surface-alt)', borderRadius: 'var(--radius-md)', padding: 3, display: 'inline-flex', gap: 2 }}>
          {NW_RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className="py-1 px-2.5 text-xs font-semibold border-0 cursor-pointer rounded-[var(--radius-sm)] transition-[background] duration-150"
              style={{
                background: range === r ? 'var(--color-surface)' : 'transparent',
                boxShadow: range === r ? 'var(--shadow-sm)' : 'none',
                color: range === r ? 'var(--color-text)' : 'var(--color-text-muted)',
              }}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      {isLoading ? (
        <Skeleton height={160} width="100%" />
      ) : history.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-[var(--color-text-muted)] text-sm">
          No history yet — data will appear after the first snapshot.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={history} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }}
              tickFormatter={(d: string) => {
                const date = new Date(d);
                return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              }}
              interval="preserveStartEnd"
            />
            <YAxis
              hide
              domain={['auto', 'auto']}
            />
            <Tooltip
              formatter={(value: number) => [fmtCurrency(value), 'Net Worth']}
              labelFormatter={(label: string) => new Date(label).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              contentStyle={{
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.8125rem',
              }}
            />
            <Line
              type="monotone"
              dataKey="netWorth"
              stroke={getColorToken('accent')}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: getColorToken('accent') }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}

      {/* Assets vs Liabilities breakdown */}
      {!isLoading && current && (
        <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-[var(--color-border)]">
          <div>
            <div className="text-[0.6875rem] text-[var(--color-text-muted)] uppercase tracking-[0.04em] mb-1">Assets</div>
            <div className="text-base font-bold text-[var(--color-success)] truncate" style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>{fmtCurrency(current.assets)}</div>
          </div>
          <div>
            <div className="text-[0.6875rem] text-[var(--color-text-muted)] uppercase tracking-[0.04em] mb-1">Liabilities</div>
            <div className="text-base font-bold text-[var(--color-danger)] truncate" style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>{fmtCurrency(current.liabilities)}</div>
          </div>
          <div>
            <div className="text-[0.6875rem] text-[var(--color-text-muted)] uppercase tracking-[0.04em] mb-1">Net Worth</div>
            <div className="text-base font-bold truncate" style={{ color: current.netWorth >= 0 ? 'var(--color-text)' : 'var(--color-danger)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>{fmtCurrency(current.netWorth)}</div>
          </div>
        </div>
      )}
    </Card>
  );
}

// ─── Net Worth Bar ────────────────────────────────────────────────────────────

function NetWorthSummary({
  totalAssets,
  totalLiabilities,
  netWorth,
}: {
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
}) {
  const total = totalAssets + Math.abs(totalLiabilities);
  const assetPct = total > 0 ? (totalAssets / total) * 100 : 100;

  return (
    <Card padding="lg">
      {/* Stat row */}
      <div className="flex gap-8 mb-4 flex-wrap">
        <div>
          <div className="text-xs text-[var(--color-text-muted)] mb-1">Assets</div>
          <div className="text-xl font-bold text-[var(--color-success)]" style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>
            {fmtCurrency(totalAssets)}
          </div>
        </div>
        <div>
          <div className="text-xs text-[var(--color-text-muted)] mb-1">Liabilities</div>
          <div className="text-xl font-bold text-[var(--color-danger)]" style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>
            {fmtCurrency(Math.abs(totalLiabilities))}
          </div>
        </div>
        <div className="ml-auto">
          <div className="text-xs text-[var(--color-text-muted)] mb-1 text-right">Net Worth</div>
          <div className="text-2xl font-bold text-right" style={{ color: netWorth >= 0 ? 'var(--color-text)' : 'var(--color-danger)', fontFamily: 'var(--font-display)', fontSize: '2.5rem', fontWeight: 700, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
            {fmtCurrency(netWorth)}
          </div>
        </div>
      </div>

      {/* Stacked bar */}
      <div className="h-2.5 rounded-[var(--radius-full)] overflow-hidden bg-[var(--color-danger)] flex">
        <div
          className="bg-[var(--color-success)] rounded-[var(--radius-full)] transition-[width] duration-[400ms] ease-[ease]"
          style={{ width: `${assetPct}%` }}
        />
      </div>
    </Card>
  );
}

// ─── Institution Autocomplete ──────────────────────────────────────────────────

const KNOWN_INSTITUTIONS = [
  'Ally', 'American Express', 'ANZ', 'Axis Bank', 'Bank of America', 'Barclays',
  'BMO', 'BNY Mellon', 'Capital One', 'Charles Schwab', 'Chase', 'Chime',
  'CIBC', 'Citibank', 'Citizens Bank', 'Commonwealth Bank', 'Discover',
  'eTrade', 'Fidelity', 'Fifth Third', 'Goldman Sachs', 'HDFC Bank',
  'HSBC', 'Huntington', 'ICICI Bank', 'JPMorgan', 'KeyBank', 'Klarna',
  'Lloyds', 'Marcus', 'Merrill', 'Monzo', 'Morgan Stanley', 'N26', 'NAB',
  'PNC', 'PayPal', 'RBC', 'Regions', 'Revolut', 'Robinhood', 'Santander',
  'SBI', 'Schwab', 'Scotiabank', 'SoFi', 'Starling Bank', 'Stripe',
  'TD Bank', 'Truist', 'US Bank', 'USAA', 'Venmo', 'Wells Fargo', 'Westpac', 'Wise',
];

function InstitutionCombobox({
  value,
  onChange,
}: {
  value: string;
  onChange: (val: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const suggestions = value.trim().length === 0
    ? []
    : KNOWN_INSTITUTIONS.filter((n) =>
        n.toLowerCase().includes(value.toLowerCase())
      ).slice(0, 7);

  return (
    <div ref={ref} className="relative">
      <Input
        label="Institution"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="e.g. Chase Bank"
        autoComplete="off"
      />
      {open && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-[var(--shadow-md)] overflow-hidden">
          {suggestions.map((name) => (
            <button
              key={name}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange(name); setOpen(false); }}
              className="flex items-center gap-2 w-full px-3 py-2 text-left bg-transparent border-0 cursor-pointer hover:bg-[var(--color-surface-hover)] text-[0.8125rem] text-[var(--color-text)]"
            >
              <InstitutionLogo name={name} type="bank" size={20} />
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Account Form ─────────────────────────────────────────────────────────────

function AccountForm({
  values,
  onChange,
  errors,
  balanceLabel = 'Starting Balance',
}: {
  values: AccountFormValues;
  onChange: (field: keyof AccountFormValues, value: string | null) => void;
  errors: Partial<Record<keyof AccountFormValues, string>>;
  balanceLabel?: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Input
        label="Account Name"
        value={values.name}
        onChange={(e) => onChange('name', e.target.value)}
        error={errors.name}
        placeholder="e.g. Chase Checking"
        required
      />
      <Select
        label="Account Type"
        value={values.type}
        onChange={(e) => onChange('type', e.target.value)}
        options={TYPE_OPTIONS}
        error={errors.type}
      />
      <InstitutionCombobox
        value={values.institution}
        onChange={(val) => {
          onChange('institution', val);
          onChange('institutionLogo', null);
        }}
      />
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Last Four Digits"
          value={values.lastFour}
          onChange={(e) => onChange('lastFour', e.target.value.replace(/\D/g, '').slice(0, 4))}
          placeholder="4321"
          maxLength={4}
          inputMode="numeric"
        />
        <Select
          label="Currency"
          value={values.currency}
          onChange={(e) => onChange('currency', e.target.value)}
          options={CURRENCY_OPTIONS}
        />
      </div>
      {values.type === 'credit_card' && (
        <Input
          label="Credit Limit"
          value={values.creditLimit}
          onChange={(e) => onChange('creditLimit', e.target.value)}
          placeholder="5000.00"
          type="number"
          step="0.01"
          min="0"
        />
      )}
      <Input
          label={balanceLabel}
          value={values.balance}
          onChange={(e) => onChange('balance', e.target.value)}
          error={errors.balance}
          placeholder="0.00"
          type="number"
          step="0.01"
          required
        />
    </div>
  );
}

function validateForm(values: AccountFormValues): Partial<Record<keyof AccountFormValues, string>> {
  const errors: Partial<Record<keyof AccountFormValues, string>> = {};
  if (!values.name.trim()) errors.name = 'Name is required';
  if (values.balance === '' || isNaN(Number(values.balance))) errors.balance = 'Valid balance is required';
  return errors;
}

// ─── Add Account Modal ────────────────────────────────────────────────────────

function AddAccountModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: householdData } = useQuery<{ currency: string }>({
    queryKey: ['settings', 'household'],
    queryFn: () => api.get('/settings/household').then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });
  const defaultCurrency = householdData?.currency ?? 'USD';
  const [values, setValues] = useState<AccountFormValues>({ ...EMPTY_FORM, currency: defaultCurrency });
  const [errors, setErrors] = useState<Partial<Record<keyof AccountFormValues, string>>>({});

  function handleChange(field: keyof AccountFormValues, value: string | null) {
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  }

  const mutation = useMutation({
    mutationFn: (body: object) => api.post('/accounts', body).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['networth'] });
      notify.success('Account added');
      onClose();
      setValues({ ...EMPTY_FORM, currency: defaultCurrency });
    },
    onError: () => notify.error('Failed to add account'),
  });

  function handleSubmit() {
    const errs = validateForm(values);
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    mutation.mutate({
      name: values.name.trim(),
      type: values.type,
      institution: values.institution.trim() || undefined,
      institutionLogo: values.institutionLogo ?? undefined,
      lastFour: values.lastFour || undefined,
      balance: Number(values.balance),
      currency: values.currency || 'USD',
      creditLimit: values.type === 'credit_card' && values.creditLimit ? Number(values.creditLimit) : undefined,
    });
  }

  function handleClose() {
    onClose();
    setValues({ ...EMPTY_FORM, currency: defaultCurrency });
    setErrors({});
  }

  return (
    <Modal open={open} onClose={handleClose} title="Add Account" size="md">
      <AccountForm values={values} onChange={handleChange} errors={errors} />
      <ModalFooter>
        <Button variant="ghost" onClick={handleClose} disabled={mutation.isPending}>Cancel</Button>
        <Button onClick={handleSubmit} loading={mutation.isPending}>Add Account</Button>
      </ModalFooter>
    </Modal>
  );
}

// ─── Edit Account Modal ───────────────────────────────────────────────────────

function EditAccountModal({
  account,
  onClose,
}: {
  account: Account | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<AccountFormValues>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof AccountFormValues, string>>>({});

  useEffect(() => {
    if (account) {
      setValues({
        name: account.name,
        type: account.type,
        institution: account.institution ?? '',
        institutionLogo: account.institutionLogo ?? null,
        lastFour: account.lastFour ?? '',
        balance: String(account.balance),
        currency: account.currency ?? 'USD',
        creditLimit: account.creditLimit != null ? String(account.creditLimit) : '',
      });
      setErrors({});
    }
  }, [account]);

  function handleChange(field: keyof AccountFormValues, value: string | null) {
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  }

  const mutation = useMutation({
    mutationFn: (body: object) => api.put(`/accounts/${account!.id}`, body).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['networth'] });
      notify.success('Account updated');
      onClose();
    },
    onError: () => notify.error('Failed to update account'),
  });

  function handleSubmit() {
    const errs = validateForm(values);
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    mutation.mutate({
      name: values.name.trim(),
      type: values.type,
      institution: values.institution.trim() || undefined,
      institutionLogo: values.institutionLogo,
      lastFour: values.lastFour || undefined,
      balance: Number(values.balance),
      currency: values.currency || 'USD',
      creditLimit: values.type === 'credit_card' && values.creditLimit ? Number(values.creditLimit) : null,
    });
  }

  return (
    <Modal open={!!account} onClose={onClose} title="Edit Account" size="md">
      <AccountForm values={values} onChange={handleChange} errors={errors} balanceLabel="Current Balance" />
      <ModalFooter>
        <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
        <Button onClick={handleSubmit} loading={mutation.isPending}>Save Changes</Button>
      </ModalFooter>
    </Modal>
  );
}

// ─── Reconcile Modal ──────────────────────────────────────────────────────────

function ReconcileModal({
  account,
  onClose,
}: {
  account: Account | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [actualBalance, setActualBalance] = useState('');

  useEffect(() => {
    if (account) setActualBalance(String(account.balance));
  }, [account]);

  const mutation = useMutation({
    mutationFn: (body: object) => api.post(`/accounts/${account!.id}/reconcile`, body).then((r) => r.data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['networth'] });
      if (data.adjustment === 0) {
        notify.info('Account already balanced');
      } else {
        notify.success(`Reconciled — adjustment: ${fmtCurrency(data.adjustment, account?.currency)}`);
      }
      onClose();
    },
    onError: () => notify.error('Reconcile failed'),
  });

  const diff = account ? Number(actualBalance) - account.balance : 0;
  const diffValid = !isNaN(diff);

  return (
    <Modal open={!!account} onClose={onClose} title="Reconcile Account" size="sm">
      {account && (
        <div className="flex flex-col gap-4">
          <div className="bg-[var(--color-surface-hover)] rounded-[var(--radius-md)] px-3 py-2.5 text-sm">
            <div className="text-[var(--color-text-muted)] text-xs mb-0.5">Current balance in Kuber</div>
            <div className="font-semibold">{fmtCurrency(account.balance, account.currency)}</div>
          </div>
          <Input
            label="Actual balance (from your bank)"
            value={actualBalance}
            onChange={(e) => setActualBalance(e.target.value)}
            type="number"
            step="0.01"
            placeholder="0.00"
          />
          {actualBalance !== '' && diffValid && Math.abs(diff) >= 0.01 && (
            <div className="text-[0.8125rem] rounded-[var(--radius-md)] px-3 py-2" style={{ backgroundColor: 'var(--color-surface-hover)', color: diff >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
              Adjustment: {diff >= 0 ? '+' : ''}{fmtCurrency(diff, account.currency)} — a "Balance Adjustment" transaction will be created.
            </div>
          )}
          {actualBalance !== '' && diffValid && Math.abs(diff) < 0.01 && (
            <div className="text-[0.8125rem] text-[var(--color-success)] bg-[var(--color-surface-hover)] rounded-[var(--radius-md)] px-3 py-2">
              Already balanced — no adjustment needed.
            </div>
          )}
        </div>
      )}
      <ModalFooter>
        <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
        <Button onClick={() => mutation.mutate({ actualBalance: Number(actualBalance) })} loading={mutation.isPending} disabled={!actualBalance || isNaN(Number(actualBalance))}>
          Reconcile
        </Button>
      </ModalFooter>
    </Modal>
  );
}

// ─── Account Detail Drawer ────────────────────────────────────────────────────

const BALANCE_HISTORY_RANGES: BalanceHistoryRange[] = ['1M', '3M', '6M', '1Y'];

function AccountDetailDrawer({
  account,
  onClose,
  onEdit,
  onDelete,
  onReconcile,
}: {
  account: Account | null;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReconcile: () => void;
}) {
  const [historyRange, setHistoryRange] = useState<BalanceHistoryRange>('3M');

  const { data, isLoading } = useQuery<AccountDetail>({
    queryKey: ['accounts', account?.id],
    queryFn: () => api.get(`/accounts/${account!.id}`).then((r) => r.data),
    enabled: !!account,
  });

  const { data: historyData, isLoading: historyLoading } = useQuery<{ date: string; balance: number }[]>({
    queryKey: ['accounts', account?.id, 'history', historyRange],
    queryFn: () => api.get(`/accounts/${account!.id}/history?range=${historyRange}`).then((r) => r.data),
    enabled: !!account,
  });

  // Close on backdrop click
  useEffect(() => {
    if (!account) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [account, onClose]);

  const detail = data?.account ?? account;
  const history = historyData ?? [];
  const txns = data?.recentTransactions ?? [];

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/40 transition-opacity duration-200"
        style={{ opacity: account ? 1 : 0, pointerEvents: account ? 'auto' : 'none' }}
      />
      {/* Drawer panel */}
      <div
        className="fixed top-0 right-0 bottom-0 z-50 w-[420px] max-w-full bg-[var(--color-surface)] border-l border-[var(--color-border)] shadow-[-4px_0_24px_rgba(0,0,0,0.12)] flex flex-col transition-transform duration-[250ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
        style={{ transform: account ? 'translateX(0)' : 'translateX(100%)' }}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)] shrink-0">
          <div className="flex items-center gap-3">
            {account && <InstitutionLogo name={account.institution ?? account.name} logoUrl={account.institutionLogo ?? undefined} size={40} />}
            <div>
              <div className="text-base font-semibold text-[var(--color-text)]">{account?.name}</div>
              {account?.institution && (
                <div className="text-xs text-[var(--color-text-muted)]">
                  {account.institution}{account.lastFour ? ` ••${account.lastFour}` : ''}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="bg-transparent border-0 cursor-pointer p-1 text-[var(--color-text-muted)] flex rounded-[var(--radius-sm)]"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-5">
          {isLoading ? (
            <div className="flex flex-col gap-3">
              <Skeleton height={48} width={160} />
              <Skeleton height={180} width="100%" />
              {[1, 2, 3].map((i) => <Skeleton key={i} height={44} width="100%" />)}
            </div>
          ) : (
            <>
              {/* Balance hero */}
              <div className="mb-6">
                {detail?.type?.toUpperCase() === 'CREDIT_CARD' ? (
                  <>
                    <div className="text-[0.6875rem] text-[var(--color-text-muted)] uppercase tracking-[0.05em] mb-1">
                      Amount Owed
                    </div>
                    <div className="text-[2rem] font-bold" style={{ color: detail.balance < 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
                      {fmtCurrency(Math.abs(detail.balance), detail.currency)}
                    </div>
                    <div className="text-xs text-[var(--color-text-muted)] mt-1">
                      Credit Card{detail.currency !== 'USD' ? ` · ${detail.currency}` : ''}
                    </div>
                    {detail.creditLimit != null && (
                      <div className="mt-3 grid grid-cols-2 gap-3">
                        <div className="bg-[var(--color-surface-hover)] rounded-[var(--radius-md)] px-3 py-2">
                          <div className="text-[0.6875rem] text-[var(--color-text-muted)] uppercase tracking-[0.05em]">Credit Limit</div>
                          <div className="text-[0.9375rem] font-semibold text-[var(--color-text)]">{fmtCurrency(detail.creditLimit, detail.currency)}</div>
                        </div>
                        <div className="bg-[var(--color-surface-hover)] rounded-[var(--radius-md)] px-3 py-2">
                          <div className="text-[0.6875rem] text-[var(--color-text-muted)] uppercase tracking-[0.05em]">Available</div>
                          <div className="text-[0.9375rem] font-semibold" style={{ color: (detail.availableCredit ?? 0) >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                            {fmtCurrency(Math.max(0, detail.availableCredit ?? 0), detail.currency)}
                          </div>
                        </div>
                      </div>
                    )}
                    {detail.creditLimit != null && detail.creditLimit > 0 && (
                      <div className="mt-3">
                        <div className="flex justify-between text-[0.6875rem] text-[var(--color-text-muted)] mb-1">
                          <span>Utilization</span>
                          <span>{((Math.abs(detail.balance) / detail.creditLimit) * 100).toFixed(1)}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-[var(--color-surface-hover)] overflow-hidden">
                          <div
                            className="h-full rounded-full transition-[width] duration-300"
                            style={{
                              width: `${Math.min(100, (Math.abs(detail.balance) / detail.creditLimit) * 100)}%`,
                              backgroundColor:
                                Math.abs(detail.balance) / detail.creditLimit > 0.9
                                  ? 'var(--color-danger)'
                                  : Math.abs(detail.balance) / detail.creditLimit > 0.7
                                  ? 'var(--color-warning)'
                                  : 'var(--color-success)',
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="text-[0.6875rem] text-[var(--color-text-muted)] uppercase tracking-[0.05em] mb-1">
                      Current Balance
                    </div>
                    <div className="text-[2rem] font-bold" style={{ color: detail && detail.balance < 0 ? 'var(--color-danger)' : 'var(--color-text)' }}>
                      {detail ? fmtCurrency(detail.balance, detail.currency) : '—'}
                    </div>
                    <div className="text-xs text-[var(--color-text-muted)] mt-1">
                      {detail?.type?.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                      {detail?.currency !== 'USD' ? ` · ${detail?.currency}` : ''}
                    </div>
                  </>
                )}
              </div>

              {/* Balance history chart */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2.5">
                  <div className="text-[0.6875rem] font-semibold text-[var(--color-text-secondary)] uppercase tracking-[0.04em]">
                    Balance History
                  </div>
                  <div className="flex gap-[0.2rem] bg-[var(--color-surface-hover)] rounded-[var(--radius-md)] p-[0.2rem]">
                    {BALANCE_HISTORY_RANGES.map((r) => (
                      <button
                        key={r}
                        onClick={() => setHistoryRange(r)}
                        className="text-[0.6875rem] font-semibold border-0 cursor-pointer rounded-[var(--radius-sm)] transition-[background] duration-150"
                        style={{
                          padding: '0.15rem 0.45rem',
                          backgroundColor: historyRange === r ? 'var(--color-surface-elevated)' : 'transparent',
                          color: historyRange === r ? 'var(--color-text)' : 'var(--color-text-muted)',
                        }}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
                {historyLoading ? (
                  <Skeleton height={140} width="100%" />
                ) : history.length === 0 ? (
                  <div className="h-[140px] flex items-center justify-center text-[var(--color-text-muted)] text-[0.8125rem] bg-[var(--color-surface-hover)] rounded-[var(--radius-md)]">
                    No history yet — snapshots are taken daily.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={140}>
                    <AreaChart data={history} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id="acctGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={getColorToken('accent')} stopOpacity={0.2} />
                          <stop offset="95%" stopColor={getColorToken('accent')} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }}
                        tickFormatter={(d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        interval="preserveStartEnd" />
                      <YAxis hide domain={['auto', 'auto']} />
                      <Tooltip
                        formatter={(value: number) => [fmtCurrency(value), 'Balance']}
                        labelFormatter={(label: string) => fmtDate(label)}
                        contentStyle={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: '0.8125rem' }}
                      />
                      <Area type="monotone" dataKey="balance" stroke={getColorToken('accent')} strokeWidth={2} fill="url(#acctGrad)" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Recent transactions */}
              <div>
                <div className="text-[0.6875rem] font-semibold text-[var(--color-text-secondary)] uppercase tracking-[0.04em] mb-2.5">
                  Recent Transactions
                </div>
                {txns.length === 0 ? (
                  <div className="text-[var(--color-text-muted)] text-sm py-4 text-center">
                    No transactions yet.
                  </div>
                ) : (
                  <div className="flex flex-col border border-[var(--color-border)] rounded-[var(--radius-md)] overflow-hidden">
                    {txns.map((txn, idx) => (
                      <div key={txn.id}>
                        <div className="flex items-center gap-3 py-2.5 px-3.5">
                          <div className="w-[30px] h-[30px] rounded-[var(--radius-full)] bg-[var(--color-accent)] flex items-center justify-center text-white text-[0.6875rem] font-bold shrink-0">
                            {(txn.merchantName ?? '?')[0].toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[0.8125rem] font-medium text-[var(--color-text)] truncate">
                              {txn.merchantName}
                            </div>
                            <div className="text-[0.6875rem] text-[var(--color-text-muted)]">
                              {txn.categoryName ?? '—'} · {fmtDate(txn.date)}
                            </div>
                          </div>
                          <span className="text-[0.8125rem] font-semibold shrink-0" style={{ color: txn.amount < 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
                            {txn.amount < 0 ? '-' : '+'}{fmtCurrency(Math.abs(txn.amount))}
                          </span>
                        </div>
                        {idx < txns.length - 1 && <div className="h-px bg-[var(--color-border)]" />}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Drawer footer actions */}
        <div className="px-5 py-4 border-t border-[var(--color-border)] flex gap-2 shrink-0">
          <Button variant="outline" icon={<Pencil size={14} />} onClick={onEdit} style={{ flex: 1 }}>
            Edit
          </Button>
          <Button variant="outline" icon={<RefreshCw size={14} />} onClick={onReconcile} style={{ flex: 1 }}>
            Reconcile
          </Button>
          <Button
            variant="ghost"
            icon={<Trash2 size={14} />}
            onClick={onDelete}
            style={{ color: 'var(--color-danger)' }}
          >
            Delete
          </Button>
        </div>
      </div>
    </>
  );
}

// ─── Skeleton Loaders ─────────────────────────────────────────────────────────

function AccountsSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Card padding="lg">
        <div className="flex gap-8 mb-4">
          <Skeleton height={40} width={120} />
          <Skeleton height={40} width={120} />
          <div className="ml-auto">
            <Skeleton height={48} width={140} />
          </div>
        </div>
        <Skeleton height={10} width="100%" />
      </Card>
      {[1, 2, 3].map((i) => (
        <Card key={i} padding="none" style={{ overflow: 'hidden' }}>
          <div className="py-3 px-4 bg-[var(--color-surface-hover)]">
            <Skeleton height={16} width={120} />
          </div>
          <div className="py-2 px-4">
            {[1, 2].map((j) => (
              <div key={j} className="flex items-center gap-3 h-12">
                <Skeleton width={32} height={32} rounded />
                <div className="flex-1">
                  <Skeleton height={13} width="50%" style={{ marginBottom: '0.25rem' }} />
                  <Skeleton height={11} width="35%" />
                </div>
                <Skeleton height={13} width={80} />
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

// ─── Assets & Liabilities Tab ─────────────────────────────────────────────────

interface ManualAsset {
  id: string;
  name: string;
  type: string;
  currentValue: number;
  purchaseValue?: number | null;
  notes?: string | null;
  currency: string;
}

interface ManualLiability {
  id:               string;
  name:             string;
  type:             string;
  currentBalance:   number;
  originalAmount:   number;
  interestRate?:    number | null;
  monthlyPayment?:  number | null;
  notes?:           string | null;
  currency:         string;
  // amortization fields
  region?:           string | null;
  rateType?:         string | null;
  primeRate?:        number | null;
  primeDiscount?:    number | null;
  termStartDate?:    string | null;
  termEndDate?:      string | null;
  amortizationYears?: number | null;
  paymentFrequency?: string | null;
}

const ASSET_TYPES = ['real_estate', 'vehicle', 'crypto', 'collectible', 'other'];
const LIABILITY_TYPES = ['mortgage', 'auto_loan', 'student_loan', 'credit_card', 'other'];

function labelType(t: string) {
  return t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const EMPTY_LIAB_FORM = {
  name: '', type: 'other', currentBalance: '', originalAmount: '',
  interestRate: '', monthlyPayment: '', notes: '',
  // amortization
  region: 'US', rateType: 'fixed', primeRate: '', primeDiscount: '',
  termStartDate: '', termEndDate: '', amortizationYears: '', paymentFrequency: 'monthly',
};

function AssetsLiabilitiesTab() {
  const qc = useQueryClient();
  const [showAssetForm, setShowAssetForm] = useState(false);
  const [showLiabForm, setShowLiabForm] = useState(false);
  const [editAsset, setEditAsset] = useState<ManualAsset | null>(null);
  const [editLiab, setEditLiab] = useState<ManualLiability | null>(null);
  const [selectedLiab, setSelectedLiab] = useState<ManualLiability | null>(null);
  const [assetDeleteTarget, setAssetDeleteTarget] = useState<ManualAsset | null>(null);
  const [liabDeleteTarget, setLiabDeleteTarget] = useState<ManualLiability | null>(null);
  const [showAmortFields, setShowAmortFields] = useState(false);

  const [assetForm, setAssetForm] = useState({ name: '', type: 'other', currentValue: '', purchaseValue: '', notes: '' });
  const [liabForm, setLiabForm] = useState(EMPTY_LIAB_FORM);

  const { data: assets = [], isLoading: assetsLoading } = useQuery<ManualAsset[]>({
    queryKey: ['manual-assets'],
    queryFn: () => api.get('/assets').then((r) => r.data),
  });

  const { data: liabilities = [], isLoading: liabsLoading } = useQuery<ManualLiability[]>({
    queryKey: ['manual-liabilities'],
    queryFn: () => api.get('/liabilities').then((r) => r.data),
  });

  const createAsset = useMutation({
    mutationFn: (d: object) => api.post('/assets', d).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['manual-assets'] }); qc.invalidateQueries({ queryKey: ['networth'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); notify.success('Asset added'); resetAssetForm(); },
    onError: () => notify.error('Failed to add asset'),
  });

  const updateAsset = useMutation({
    mutationFn: ({ id, ...d }: { id: string } & object) => api.put(`/assets/${id}`, d).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['manual-assets'] }); qc.invalidateQueries({ queryKey: ['networth'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); notify.success('Asset updated'); resetAssetForm(); },
    onError: () => notify.error('Failed to update asset'),
  });

  const deleteAsset = useMutation({
    mutationFn: (id: string) => api.delete(`/assets/${id}`).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['manual-assets'] }); qc.invalidateQueries({ queryKey: ['networth'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); setAssetDeleteTarget(null); notify.success('Asset deleted'); },
    onError: () => notify.error('Failed to delete asset'),
  });

  const createLiab = useMutation({
    mutationFn: (d: object) => api.post('/liabilities', d).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['manual-liabilities'] }); qc.invalidateQueries({ queryKey: ['networth'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); notify.success('Liability added'); resetLiabForm(); },
    onError: () => notify.error('Failed to add liability'),
  });

  const updateLiab = useMutation({
    mutationFn: ({ id, ...d }: { id: string } & object) => api.put(`/liabilities/${id}`, d).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['manual-liabilities'] }); qc.invalidateQueries({ queryKey: ['networth'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); notify.success('Liability updated'); resetLiabForm(); },
    onError: () => notify.error('Failed to update liability'),
  });

  const deleteLiab = useMutation({
    mutationFn: (id: string) => api.delete(`/liabilities/${id}`).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['manual-liabilities'] }); qc.invalidateQueries({ queryKey: ['networth'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); setLiabDeleteTarget(null); notify.success('Liability deleted'); },
    onError: () => notify.error('Failed to delete liability'),
  });

  function resetAssetForm() { setAssetForm({ name: '', type: 'other', currentValue: '', purchaseValue: '', notes: '' }); setShowAssetForm(false); setEditAsset(null); }
  function resetLiabForm() { setLiabForm(EMPTY_LIAB_FORM); setShowLiabForm(false); setEditLiab(null); setShowAmortFields(false); }

  function openEditAsset(a: ManualAsset) {
    setAssetForm({ name: a.name, type: a.type, currentValue: String(a.currentValue), purchaseValue: String(a.purchaseValue ?? ''), notes: a.notes ?? '' });
    setEditAsset(a);
    setShowAssetForm(true);
  }

  function openEditLiab(l: ManualLiability) {
    setLiabForm({
      name: l.name, type: l.type,
      currentBalance: String(l.currentBalance), originalAmount: String(l.originalAmount),
      interestRate: String(l.interestRate ?? ''), monthlyPayment: String(l.monthlyPayment ?? ''),
      notes: l.notes ?? '',
      region: l.region ?? 'US', rateType: l.rateType ?? 'fixed',
      primeRate: String(l.primeRate ?? ''), primeDiscount: String(l.primeDiscount ?? ''),
      termStartDate: l.termStartDate ? l.termStartDate.slice(0, 10) : '',
      termEndDate:   l.termEndDate   ? l.termEndDate.slice(0, 10)   : '',
      amortizationYears: String(l.amortizationYears ?? ''),
      paymentFrequency: l.paymentFrequency ?? 'monthly',
    });
    setShowAmortFields(!!(l.region || l.amortizationYears || l.rateType));
    setEditLiab(l);
    setShowLiabForm(true);
  }

  function submitAsset() {
    const payload = {
      name: assetForm.name,
      type: assetForm.type,
      currentValue: parseFloat(assetForm.currentValue) || 0,
      ...(assetForm.purchaseValue ? { purchaseValue: parseFloat(assetForm.purchaseValue) } : {}),
      ...(assetForm.notes ? { notes: assetForm.notes } : {}),
    };
    if (editAsset) updateAsset.mutate({ id: editAsset.id, ...payload });
    else createAsset.mutate(payload);
  }

  function submitLiab() {
    const payload: Record<string, unknown> = {
      name:           liabForm.name,
      type:           liabForm.type,
      currentBalance: parseFloat(liabForm.currentBalance) || 0,
      originalAmount: parseFloat(liabForm.originalAmount) || 0,
      ...(liabForm.interestRate    ? { interestRate:   parseFloat(liabForm.interestRate) }   : {}),
      ...(liabForm.monthlyPayment  ? { monthlyPayment: parseFloat(liabForm.monthlyPayment) } : {}),
      ...(liabForm.notes           ? { notes: liabForm.notes }                               : {}),
    };
    if (showAmortFields) {
      payload.region   = liabForm.region || 'US';
      payload.rateType = liabForm.rateType || 'fixed';
      payload.paymentFrequency = liabForm.paymentFrequency || 'monthly';
      if (liabForm.amortizationYears) payload.amortizationYears = parseInt(liabForm.amortizationYears, 10);
      if (liabForm.termStartDate)     payload.termStartDate = new Date(liabForm.termStartDate).toISOString();
      if (liabForm.termEndDate)       payload.termEndDate   = new Date(liabForm.termEndDate).toISOString();
      if (liabForm.rateType === 'variable') {
        if (liabForm.primeRate)     payload.primeRate     = parseFloat(liabForm.primeRate);
        if (liabForm.primeDiscount) payload.primeDiscount = parseFloat(liabForm.primeDiscount);
      }
    }
    if (editLiab) updateLiab.mutate({ id: editLiab.id, ...payload });
    else createLiab.mutate(payload);
  }

  const totalAssets = assets.reduce((s, a) => s + a.currentValue, 0);
  const totalLiabs = liabilities.reduce((s, l) => s + l.currentBalance, 0);

  return (
    <div className="flex flex-col gap-5">
      {/* Summary bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: 'Manual Assets', value: totalAssets, color: 'var(--color-success)' },
          { label: 'Manual Liabilities', value: totalLiabs, color: 'var(--color-danger)' },
          { label: 'Net', value: totalAssets - totalLiabs, color: (totalAssets - totalLiabs) >= 0 ? 'var(--color-success)' : 'var(--color-danger)' },
        ].map((s) => (
          <Card key={s.label} padding="md">
            <div className="text-[0.6875rem] uppercase tracking-[0.05em] text-[var(--color-text-muted)] mb-1">{s.label}</div>
            <div className="text-xl font-bold" style={{ color: s.color }}>{fmtCurrency(s.value)}</div>
          </Card>
        ))}
      </div>

      {/* Assets section */}
      <Card padding="lg">
        <div className="flex items-center justify-between mb-3">
          <h3 className="m-0 text-base font-semibold">Manual Assets</h3>
          <Button size="sm" icon={<Plus size={13} />} onClick={() => { resetAssetForm(); setShowAssetForm(true); }}>Add Asset</Button>
        </div>
        {assetsLoading ? <Skeleton height={60} /> : assets.length === 0 ? (
          <p className="text-[var(--color-text-muted)] text-sm m-0">No manual assets yet. Add your home, car, crypto, or other assets.</p>
        ) : assets.map((a) => (
          <div key={a.id} className="flex items-center justify-between py-2.5 border-b border-[var(--color-border)]">
            <div>
              <div className="font-medium text-[0.9rem]">{a.name}</div>
              <div className="text-xs text-[var(--color-text-muted)]">{labelType(a.type)}</div>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-semibold text-[var(--color-success)]">{fmtCurrency(a.currentValue)}</span>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" icon={<Pencil size={13} />} onClick={() => openEditAsset(a)} />
                <Button variant="ghost" size="sm" icon={<Trash2 size={13} />} onClick={() => setAssetDeleteTarget(a)} />
              </div>
            </div>
          </div>
        ))}
      </Card>

      {/* Liabilities section */}
      <Card padding="lg">
        <div className="flex items-center justify-between mb-3">
          <h3 className="m-0 text-base font-semibold">Manual Liabilities</h3>
          <Button size="sm" icon={<Plus size={13} />} onClick={() => { resetLiabForm(); setShowLiabForm(true); }}>Add Liability</Button>
        </div>
        {liabsLoading ? <Skeleton height={60} /> : liabilities.length === 0 ? (
          <p className="text-[var(--color-text-muted)] text-sm m-0">No manual liabilities yet. Add mortgages, loans, or other debts.</p>
        ) : liabilities.map((l) => (
          <div key={l.id}>
            <div
              className="flex items-center justify-between py-2.5 cursor-pointer rounded-[var(--radius-sm)] px-1"
              onClick={() => setSelectedLiab(selectedLiab?.id === l.id ? null : l)}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <div>
                <div className="font-medium text-[0.9rem]">{l.name}</div>
                <div className="text-xs text-[var(--color-text-muted)]">
                  {labelType(l.type)}
                  {l.interestRate ? ` · ${l.interestRate}% APR` : ''}
                  {l.region ? ` · ${l.region}` : ''}
                  {l.amortizationYears ? ` · ${l.amortizationYears}yr amort.` : ''}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[var(--color-danger)]">{fmtCurrency(l.currentBalance)}</span>
                <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="sm" icon={<Pencil size={13} />} onClick={() => openEditLiab(l)} />
                  <Button variant="ghost" size="sm" icon={<Trash2 size={13} />} onClick={() => setLiabDeleteTarget(l)} />
                </div>
              </div>
            </div>
            {/* Inline amortization panel */}
            {selectedLiab?.id === l.id && (
              <div className="ml-2 mr-1 mb-2 border border-[var(--color-border)] rounded-[var(--radius-md)] p-4 bg-[var(--color-surface)]">
                <LiabilityDetailPanel liability={l} currency={l.currency} />
              </div>
            )}
          </div>
        ))}
      </Card>

      {/* Asset form modal */}
      {showAssetForm && (
        <Modal open onClose={resetAssetForm} title={editAsset ? 'Edit Asset' : 'Add Asset'}>
          <div className="flex flex-col gap-3">
            <Input label="Name" value={assetForm.name} onChange={(e) => setAssetForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Primary Home" />
            <Select label="Type" value={assetForm.type} onChange={(e) => setAssetForm((f) => ({ ...f, type: e.target.value }))} options={ASSET_TYPES.map((t) => ({ value: t, label: labelType(t) }))} />
            <Input label="Current Value" type="number" value={assetForm.currentValue} onChange={(e) => setAssetForm((f) => ({ ...f, currentValue: e.target.value }))} placeholder="0.00" />
            <Input label="Purchase Value (optional)" type="number" value={assetForm.purchaseValue} onChange={(e) => setAssetForm((f) => ({ ...f, purchaseValue: e.target.value }))} placeholder="0.00" />
            <Input label="Notes (optional)" value={assetForm.notes} onChange={(e) => setAssetForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Any notes..." />
          </div>
          <ModalFooter>
            <Button variant="ghost" onClick={resetAssetForm}>Cancel</Button>
            <Button onClick={submitAsset} disabled={!assetForm.name || !assetForm.currentValue}>{editAsset ? 'Save' : 'Add Asset'}</Button>
          </ModalFooter>
        </Modal>
      )}

      {/* Liability form modal */}
      {showLiabForm && (
        <Modal open onClose={resetLiabForm} title={editLiab ? 'Edit Liability' : 'Add Liability'} size="md">
          <div className="flex flex-col gap-3">
            {/* Core fields */}
            <Input label="Name" value={liabForm.name} onChange={(e) => setLiabForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Scotia Mortgage" />
            <Select label="Type" value={liabForm.type} onChange={(e) => setLiabForm((f) => ({ ...f, type: e.target.value }))} options={LIABILITY_TYPES.map((t) => ({ value: t, label: labelType(t) }))} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Current Balance" type="number" value={liabForm.currentBalance} onChange={(e) => setLiabForm((f) => ({ ...f, currentBalance: e.target.value }))} placeholder="0.00" />
              <Input label="Original Amount" type="number" value={liabForm.originalAmount} onChange={(e) => setLiabForm((f) => ({ ...f, originalAmount: e.target.value }))} placeholder="0.00" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Interest Rate % (fixed)" type="number" value={liabForm.interestRate} onChange={(e) => setLiabForm((f) => ({ ...f, interestRate: e.target.value }))} placeholder="e.g. 5.25" />
              <Input label="Monthly Payment" type="number" value={liabForm.monthlyPayment} onChange={(e) => setLiabForm((f) => ({ ...f, monthlyPayment: e.target.value }))} placeholder="0.00" />
            </div>
            <Input label="Notes (optional)" value={liabForm.notes} onChange={(e) => setLiabForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Any notes..." />

            {/* Amortization toggle */}
            <button
              type="button"
              onClick={() => setShowAmortFields((v) => !v)}
              className="flex items-center gap-1.5 text-[0.8125rem] font-medium bg-transparent border-0 cursor-pointer p-0 self-start"
              style={{ color: 'var(--color-accent)' }}
            >
              <ChevronDown size={14} style={{ transform: showAmortFields ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
              {showAmortFields ? 'Hide' : 'Add'} amortization settings
            </button>

            {showAmortFields && (
              <div className="flex flex-col gap-3 border-t border-[var(--color-border)] pt-3">
                <div className="grid grid-cols-2 gap-3">
                  <Select
                    label="Region"
                    value={liabForm.region}
                    onChange={(e) => setLiabForm((f) => ({ ...f, region: e.target.value }))}
                    options={[{ value: 'US', label: 'United States' }, { value: 'CA', label: 'Canada' }]}
                  />
                  <Select
                    label="Rate Type"
                    value={liabForm.rateType}
                    onChange={(e) => setLiabForm((f) => ({ ...f, rateType: e.target.value }))}
                    options={[{ value: 'fixed', label: 'Fixed' }, { value: 'variable', label: 'Variable (Prime − Discount)' }]}
                  />
                </div>

                {liabForm.rateType === 'variable' && (
                  <div className="grid grid-cols-2 gap-3">
                    <Input label="Lender Prime Rate %" type="number" step="0.01" value={liabForm.primeRate} onChange={(e) => setLiabForm((f) => ({ ...f, primeRate: e.target.value }))} placeholder="e.g. 6.70" />
                    <Input label="Your Discount %" type="number" step="0.01" value={liabForm.primeDiscount} onChange={(e) => setLiabForm((f) => ({ ...f, primeDiscount: e.target.value }))}
                      placeholder="e.g. 0.90"
                    />
                  </div>
                )}
                {liabForm.rateType === 'variable' && liabForm.primeRate && liabForm.primeDiscount && (
                  <div className="text-[0.8125rem] text-[var(--color-text-muted)] bg-[var(--color-surface-hover)] rounded-[var(--radius-md)] px-3 py-2">
                    Effective rate: <strong style={{ color: 'var(--color-text)' }}>
                      {Math.max(0, parseFloat(liabForm.primeRate) - parseFloat(liabForm.primeDiscount)).toFixed(2)}%
                    </strong>
                    {' '}({liabForm.region === 'CA' ? 'semi-annual compounding' : 'monthly compounding'})
                  </div>
                )}
                {liabForm.rateType === 'fixed' && liabForm.region && liabForm.interestRate && (
                  <div className="text-[0.8125rem] text-[var(--color-text-muted)] bg-[var(--color-surface-hover)] rounded-[var(--radius-md)] px-3 py-2">
                    {liabForm.region === 'CA' ? 'Canada fixed: semi-annual compounding (Interest Act)' : 'US fixed: monthly compounding'}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <Input label="Amortization (years)" type="number" value={liabForm.amortizationYears} onChange={(e) => setLiabForm((f) => ({ ...f, amortizationYears: e.target.value }))} placeholder="e.g. 25" />
                  <Select
                    label="Payment Frequency"
                    value={liabForm.paymentFrequency}
                    onChange={(e) => setLiabForm((f) => ({ ...f, paymentFrequency: e.target.value }))}
                    options={[
                      { value: 'monthly',   label: 'Monthly' },
                      { value: 'biweekly',  label: 'Bi-weekly' },
                      { value: 'weekly',    label: 'Weekly' },
                    ]}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Term Start" type="date" value={liabForm.termStartDate} onChange={(e) => setLiabForm((f) => ({ ...f, termStartDate: e.target.value }))} />
                  <Input label="Term End / Renewal" type="date" value={liabForm.termEndDate} onChange={(e) => setLiabForm((f) => ({ ...f, termEndDate: e.target.value }))} />
                </div>
              </div>
            )}
          </div>
          <ModalFooter>
            <Button variant="ghost" onClick={resetLiabForm}>Cancel</Button>
            <Button onClick={submitLiab} disabled={!liabForm.name || !liabForm.currentBalance}>{editLiab ? 'Save' : 'Add Liability'}</Button>
          </ModalFooter>
        </Modal>
      )}
      <ConfirmDialog
        open={assetDeleteTarget !== null}
        onClose={() => setAssetDeleteTarget(null)}
        onConfirm={() => assetDeleteTarget && deleteAsset.mutate(assetDeleteTarget.id)}
        title="Delete Asset"
        message={<>Delete <strong>{assetDeleteTarget?.name}</strong>? This cannot be undone.</>}
        confirmLabel="Delete asset"
        loading={deleteAsset.isPending}
      />
      <ConfirmDialog
        open={liabDeleteTarget !== null}
        onClose={() => setLiabDeleteTarget(null)}
        onConfirm={() => liabDeleteTarget && deleteLiab.mutate(liabDeleteTarget.id)}
        title="Delete Liability"
        message={<>Delete <strong>{liabDeleteTarget?.name}</strong>? This cannot be undone.</>}
        confirmLabel="Delete liability"
        loading={deleteLiab.isPending}
      />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AccountsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data, isLoading, isError } = useQuery<AccountsData>({
    queryKey: ['accounts'],
    queryFn: () => api.get('/accounts').then((r) => r.data),
  });

  const [activeTab, setActiveTab] = useState<'accounts' | 'assets'>('accounts');
  const [showAdd, setShowAdd] = useState(false);
  const [editAccount, setEditAccount] = useState<Account | null>(null);
  const [detailAccount, setDetailAccount] = useState<Account | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);
  const [reconcileAccount, setReconcileAccount] = useState<Account | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/accounts/${id}`),
    onSuccess: () => {
      notify.success('Account deleted');
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['networth'] });
      setDeleteTarget(null);
      setDetailAccount(null);
    },
    onError: () => notify.error('Failed to delete account'),
  });

  const grouped = data?.groups ? buildGroupMap(data.groups) : null;

  usePrefetchLogos(
    (data?.groups ?? []).flatMap(g => g.accounts).map(a => ({ name: a.institution, type: 'bank' as const }))
  );

  function handleEditFromDetail() {
    const acct = detailAccount;
    setDetailAccount(null);
    setEditAccount(acct);
  }

  function handleDeleteFromDetail() {
    setDeleteTarget(detailAccount);
  }

  function handleDeleteFromRow(account: Account) {
    setDeleteTarget(account);
  }

  return (
    <div className="py-4">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-[var(--color-text)] m-0">
          Accounts
        </h1>
        <div className="flex gap-2">
          {activeTab === 'accounts' && <>
            <Button variant="ghost" size="sm" icon={<RefreshCw size={14} />} onClick={() => queryClient.invalidateQueries({ queryKey: ['accounts'] })}>Refresh all</Button>
            <Button variant="outline" size="sm" icon={<Upload size={14} />} onClick={() => navigate('/accounts/bulk-import')}>Import CSV</Button>
            <Button size="sm" icon={<Plus size={14} />} onClick={() => setShowAdd(true)}>Add account</Button>
          </>}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b-2 border-[var(--color-border)] mb-5">
        {([['accounts', 'Accounts'], ['assets', 'Assets & Debt']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className="py-2 px-5 text-sm bg-transparent border-0 cursor-pointer -mb-0.5 transition-[color] duration-150"
            style={{
              fontWeight: activeTab === key ? 600 : 400,
              color: activeTab === key ? 'var(--color-primary)' : 'var(--color-text-muted)',
              borderBottom: activeTab === key ? '2px solid var(--color-primary)' : '2px solid transparent',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'assets' ? (
        <AssetsLiabilitiesTab />
      ) : isLoading ? (
        <AccountsSkeleton />
      ) : isError || !data ? (
        <div className="p-8 text-center text-[var(--color-danger)] text-sm">
          Failed to load accounts.
        </div>
      ) : grouped && !GROUP_ORDER.some((t) => (grouped.get(t) ?? []).length > 0) ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
          <div className="text-[2.5rem]">🏦</div>
          <p className="text-base font-semibold text-[var(--color-text)] m-0">No accounts yet</p>
          <p className="text-sm text-[var(--color-text-muted)] m-0">Add your first account to get started.</p>
          <Button icon={<Plus size={14} />} onClick={() => setShowAdd(true)}>Add Account</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-4 items-start">
          {/* Left column: net worth chart + groups */}
          <div className="flex flex-col gap-4">
            <NetWorthChart />
            <NetWorthSummary
              totalAssets={data.netWorth.assets}
              totalLiabilities={data.netWorth.liabilities}
              netWorth={data.netWorth.total}
            />

            {grouped && GROUP_ORDER.map((type) => {
              const accounts = grouped.get(type) ?? [];
              return (
                <AccountGroup
                  key={type}
                  type={type}
                  accounts={accounts}
                  onAccountClick={setDetailAccount}
                  onEditAccount={setEditAccount}
                  onDeleteAccount={handleDeleteFromRow}
                />
              );
            })}
          </div>

          {/* Right column: summary stats */}
          <div className="flex flex-col gap-4">
            <Card padding="lg">
              <div className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-[0.04em] mb-4">
                Summary
              </div>
              <div className="flex flex-col gap-3">
                {GROUP_ORDER.map((type) => {
                  const accounts = grouped?.get(type) ?? [];
                  if (accounts.length === 0) return null;
                  const total = groupTotal(accounts);
                  return (
                    <div key={type} className="flex justify-between items-center">
                      <span className="text-sm text-[var(--color-text-secondary)]">
                        {GROUP_LABELS[type]}
                      </span>
                      <span className="text-sm font-semibold" style={{ color: isLiability(type) && total > 0 ? 'var(--color-danger)' : total < 0 ? 'var(--color-danger)' : 'var(--color-text)' }}>
                        {fmtCurrency(total)}
                      </span>
                    </div>
                  );
                })}
                <div className="h-px bg-[var(--color-border)] my-1" />
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold text-[var(--color-text)]">Net Worth</span>
                  <span className="text-base font-bold" style={{ color: data.netWorth.total >= 0 ? 'var(--color-text)' : 'var(--color-danger)' }}>
                    {fmtCurrency(data.netWorth.total)}
                  </span>
                </div>
              </div>
            </Card>

            <Card padding="lg">
              <div className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-[0.04em] mb-4">
                Account Count
              </div>
              <div className="flex flex-col gap-2">
                {GROUP_ORDER.map((type) => {
                  const count = grouped?.get(type)?.length ?? 0;
                  if (count === 0) return null;
                  return (
                    <div key={type} className="flex justify-between items-center">
                      <span className="text-sm text-[var(--color-text-secondary)]">{GROUP_LABELS[type]}</span>
                      <span className="text-xs font-semibold py-0.5 px-2 rounded-[var(--radius-full)] bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)]">
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Modals */}
      <AddAccountModal open={showAdd} onClose={() => setShowAdd(false)} />
      <EditAccountModal account={editAccount} onClose={() => setEditAccount(null)} />
      {detailAccount && (
        <AccountDetailDrawer
          account={detailAccount}
          onClose={() => setDetailAccount(null)}
          onEdit={handleEditFromDetail}
          onDelete={handleDeleteFromDetail}
          onReconcile={() => { setReconcileAccount(detailAccount); setDetailAccount(null); }}
        />
      )}
      <ReconcileModal account={reconcileAccount} onClose={() => setReconcileAccount(null)} />

      {/* Delete confirmation */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Account" size="sm">
        <p className="text-sm text-[var(--color-text-secondary)] mb-1">
          Are you sure you want to delete <strong>{deleteTarget?.name}</strong>?
        </p>
        <p className="text-[0.8125rem] text-[var(--color-text-muted)]">
          All transactions for this account will be hidden. This cannot be undone.
        </p>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setDeleteTarget(null)} disabled={deleteMutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            loading={deleteMutation.isPending}
            style={{ backgroundColor: 'var(--color-danger)', borderColor: 'var(--color-danger)' }}
          >
            Delete Account
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
