import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line,
} from 'recharts';
import { ChevronDown, ChevronRight, RefreshCw, Plus, MoreHorizontal, Pencil, EyeOff, MinusCircle } from 'lucide-react';
import { api } from '@/lib/api';
import {
  Card, Button, Input, Select, Modal, ModalFooter, Skeleton, InstitutionLogo, LogoPicker,
} from '@/components/ui';
import { notify } from '@/components/ui';

// ─── Types ────────────────────────────────────────────────────────────────────

type AccountType = 'checking' | 'savings' | 'credit_card' | 'investment' | 'loan' | 'other';

interface Account {
  id: string;
  name: string;
  type: AccountType;
  institution?: string | null;
  institutionLogo?: string | null;
  lastFour?: string | null;
  balance: number;
  currency: string;
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
}

const EMPTY_FORM: AccountFormValues = {
  name: '',
  type: 'checking',
  institution: '',
  institutionLogo: null,
  lastFour: '',
  balance: '',
  currency: 'USD',
};

// ─── Constants ───────────────────────────────────────────────────────────────

const TYPE_OPTIONS = [
  { value: 'checking', label: 'Checking' },
  { value: 'savings', label: 'Savings' },
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'investment', label: 'Investment' },
  { value: 'loan', label: 'Loan' },
  { value: 'other', label: 'Other' },
];

// Display order: liquid first, then investment, then liabilities, then other
const GROUP_ORDER: AccountType[] = [
  'checking',
  'savings',
  'investment',
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

function balanceColor(balance: number, type: AccountType): string {
  if (balance < 0) return 'var(--color-danger)';
  if (type === 'investment' && balance > 0) return 'var(--color-success)';
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
}: {
  onEdit: () => void;
  onHide: () => void;
  onExclude: () => void;
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

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '0.25rem',
          borderRadius: 'var(--radius-sm)',
          color: 'var(--color-text-muted)',
          display: 'flex',
          alignItems: 'center',
        }}
        aria-label="Account options"
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div style={{
          position: 'absolute',
          right: 0,
          top: '100%',
          zIndex: 20,
          backgroundColor: 'var(--color-surface-elevated)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-md)',
          minWidth: 180,
          overflow: 'hidden',
        }}>
          {[
            { icon: <Pencil size={14} />, label: 'Edit', action: onEdit },
            { icon: <EyeOff size={14} />, label: 'Hide account', action: onHide },
            { icon: <MinusCircle size={14} />, label: 'Exclude from net worth', action: onExclude },
          ].map(({ icon, label, action }) => (
            <button
              key={label}
              onClick={(e) => { e.stopPropagation(); action(); setOpen(false); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                width: '100%',
                padding: '0.5rem 0.875rem',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.8125rem',
                color: 'var(--color-text)',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <span style={{ color: 'var(--color-text-secondary)' }}>{icon}</span>
              {label}
            </button>
          ))}
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
  monthChange,
}: {
  account: Account;
  onClick: () => void;
  onEdit: () => void;
  monthChange?: number;
}) {
  const displayName = account.institution
    ? account.lastFour
      ? `${account.institution} ••${account.lastFour}`
      : account.institution
    : account.name;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0 0',
        height: 48,
        cursor: 'pointer',
        borderRadius: 'var(--radius-md)',
        paddingLeft: '0.5rem',
        paddingRight: '0.5rem',
      }}
      onClick={onClick}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)')}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
    >
      {/* Bank logo */}
      <InstitutionLogo name={account.institution ?? account.name} logoSlug={account.institutionLogo ?? undefined} size={32} />

      {/* Name + last four */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: '0.875rem',
          fontWeight: 500,
          color: 'var(--color-text)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {account.name}
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
          {displayName}
        </div>
      </div>

      {/* Balance + optional 1M change */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0, marginRight: '0.25rem' }}>
        <div style={{
          fontSize: '0.875rem',
          fontWeight: 600,
          color: balanceColor(account.balance, account.type),
        }}>
          {fmtCurrency(account.balance, account.currency)}
        </div>
        {monthChange !== undefined && (
          <div style={{
            fontSize: '0.6875rem',
            color: monthChange >= 0 ? 'var(--color-success)' : 'var(--color-danger)',
          }}>
            {fmtChange(monthChange)}
          </div>
        )}
      </div>

      {/* Overflow menu */}
      <OverflowMenu
        onEdit={onEdit}
        onHide={() => notify.info(`${account.name} hidden`)}
        onExclude={() => notify.info(`${account.name} excluded from net worth`)}
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
}: {
  type: AccountType;
  accounts: Account[];
  onAccountClick: (account: Account) => void;
  onEditAccount: (account: Account) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  if (accounts.length === 0) return null;

  const total = groupTotal(accounts);
  const change = groupMonthChange(accounts);

  return (
    <Card padding="none" style={{ overflow: 'hidden' }}>
      {/* Group header */}
      <div
        onClick={() => setCollapsed((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.75rem 1rem',
          backgroundColor: 'var(--color-surface-hover)',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <span style={{ color: 'var(--color-text-muted)', flexShrink: 0 }}>
          {collapsed
            ? <ChevronRight size={16} />
            : <ChevronDown size={16} />
          }
        </span>
        <span style={{ flex: 1, fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {GROUP_LABELS[type]}
        </span>
        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)', marginRight: '0.75rem' }}>
          {fmtCurrency(total)}
        </span>
        <span style={{
          fontSize: '0.75rem',
          color: change >= 0 ? 'var(--color-success)' : 'var(--color-danger)',
          minWidth: 60,
          textAlign: 'right',
        }}>
          {fmtChange(change)}
        </span>
      </div>

      {/* Account rows */}
      {!collapsed && (
        <div style={{ padding: '0.25rem 0.5rem 0.5rem' }}>
          {accounts.map((account, idx) => (
            <div key={account.id}>
              <AccountRow
                account={account}
                onClick={() => onAccountClick(account)}
                onEdit={() => onEditAccount(account)}
              />
              {idx < accounts.length - 1 && (
                <div style={{ height: 1, backgroundColor: 'var(--color-border)', margin: '0 0.5rem' }} />
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
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>Net Worth</div>
          {isLoading ? (
            <Skeleton height={36} width={160} />
          ) : (
            <div style={{ fontSize: '2rem', fontWeight: 700, color: (current?.netWorth ?? 0) >= 0 ? 'var(--color-text)' : 'var(--color-danger)' }}>
              {fmtCurrency(current?.netWorth ?? 0)}
            </div>
          )}
          {!isLoading && change && change.since && (
            <div style={{ fontSize: '0.8125rem', color: changePositive ? 'var(--color-success)' : 'var(--color-danger)', marginTop: '0.25rem' }}>
              {fmtChange(change.amount)} ({fmtPercent(change.percent)}) since {fmtDate(change.since)}
            </div>
          )}
        </div>
        {/* Range tabs */}
        <div style={{ display: 'flex', gap: '0.25rem', backgroundColor: 'var(--color-surface-hover)', borderRadius: 'var(--radius-md)', padding: '0.25rem' }}>
          {NW_RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              style={{
                padding: '0.25rem 0.625rem',
                fontSize: '0.75rem',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: range === r ? 'var(--color-surface-elevated)' : 'transparent',
                color: range === r ? 'var(--color-text)' : 'var(--color-text-muted)',
                transition: 'background 0.15s',
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
        <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
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
              stroke="#E5622A"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: '#E5622A' }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}

      {/* Assets vs Liabilities breakdown */}
      {!isLoading && current && (
        <div style={{
          display: 'flex',
          gap: '1.5rem',
          marginTop: '1rem',
          paddingTop: '1rem',
          borderTop: '1px solid var(--color-border)',
          flexWrap: 'wrap',
        }}>
          <div style={{ flex: 1, minWidth: 100 }}>
            <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.25rem' }}>Assets</div>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-success)' }}>{fmtCurrency(current.assets)}</div>
          </div>
          <div style={{ flex: 1, minWidth: 100 }}>
            <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.25rem' }}>Liabilities</div>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-danger)' }}>{fmtCurrency(current.liabilities)}</div>
          </div>
          <div style={{ flex: 1, minWidth: 100 }}>
            <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.25rem' }}>Net Worth</div>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: current.netWorth >= 0 ? 'var(--color-text)' : 'var(--color-danger)' }}>{fmtCurrency(current.netWorth)}</div>
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
      <div style={{ display: 'flex', gap: '2rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>Assets</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-success)' }}>
            {fmtCurrency(totalAssets)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>Liabilities</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-danger)' }}>
            {fmtCurrency(Math.abs(totalLiabilities))}
          </div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem', textAlign: 'right' }}>Net Worth</div>
          <div style={{
            fontSize: '1.5rem',
            fontWeight: 700,
            color: netWorth >= 0 ? 'var(--color-text)' : 'var(--color-danger)',
            textAlign: 'right',
          }}>
            {fmtCurrency(netWorth)}
          </div>
        </div>
      </div>

      {/* Stacked bar */}
      <div style={{
        height: 10,
        borderRadius: 'var(--radius-full)',
        overflow: 'hidden',
        backgroundColor: 'var(--color-danger)',
        display: 'flex',
      }}>
        <div style={{
          width: `${assetPct}%`,
          backgroundColor: 'var(--color-success)',
          borderRadius: 'var(--radius-full)',
          transition: 'width 0.4s ease',
        }} />
      </div>
    </Card>
  );
}

// ─── Account Form ─────────────────────────────────────────────────────────────

function AccountForm({
  values,
  onChange,
  onLogoChange,
  errors,
  hideBalance = false,
}: {
  values: AccountFormValues;
  onChange: (field: keyof AccountFormValues, value: string) => void;
  onLogoChange: (slug: string | null) => void;
  errors: Partial<Record<keyof AccountFormValues, string>>;
  hideBalance?: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
      <Input
        label="Institution"
        value={values.institution}
        onChange={(e) => onChange('institution', e.target.value)}
        placeholder="e.g. Chase Bank"
      />
      <div>
        <div style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
          Logo
        </div>
        <LogoPicker
          value={values.institutionLogo}
          institutionName={values.institution || values.name}
          onChange={onLogoChange}
        />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <Input
          label="Last Four Digits"
          value={values.lastFour}
          onChange={(e) => onChange('lastFour', e.target.value.replace(/\D/g, '').slice(0, 4))}
          placeholder="4321"
          maxLength={4}
          inputMode="numeric"
        />
        <Input
          label="Currency"
          value={values.currency}
          onChange={(e) => onChange('currency', e.target.value.toUpperCase().slice(0, 3))}
          placeholder="USD"
          maxLength={3}
        />
      </div>
      {!hideBalance && (
        <Input
          label="Starting Balance"
          value={values.balance}
          onChange={(e) => onChange('balance', e.target.value)}
          error={errors.balance}
          placeholder="0.00"
          type="number"
          step="0.01"
          required
        />
      )}
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
  const [values, setValues] = useState<AccountFormValues>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof AccountFormValues, string>>>({});

  function handleChange(field: keyof AccountFormValues, value: string) {
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  }

  function handleLogoChange(slug: string | null) {
    setValues((v) => ({ ...v, institutionLogo: slug }));
  }

  const mutation = useMutation({
    mutationFn: (body: object) => api.post('/accounts', body).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      notify.success('Account added');
      onClose();
      setValues(EMPTY_FORM);
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
    });
  }

  function handleClose() {
    onClose();
    setValues(EMPTY_FORM);
    setErrors({});
  }

  return (
    <Modal open={open} onClose={handleClose} title="Add Account" size="md">
      <AccountForm values={values} onChange={handleChange} onLogoChange={handleLogoChange} errors={errors} />
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
      });
      setErrors({});
    }
  }, [account]);

  function handleChange(field: keyof AccountFormValues, value: string) {
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  }

  function handleLogoChange(slug: string | null) {
    setValues((v) => ({ ...v, institutionLogo: slug }));
  }

  const mutation = useMutation({
    mutationFn: (body: object) => api.put(`/accounts/${account!.id}`, body).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
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
    });
  }

  return (
    <Modal open={!!account} onClose={onClose} title="Edit Account" size="md">
      <AccountForm values={values} onChange={handleChange} onLogoChange={handleLogoChange} errors={errors} hideBalance />
      <ModalFooter>
        <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
        <Button onClick={handleSubmit} loading={mutation.isPending}>Save Changes</Button>
      </ModalFooter>
    </Modal>
  );
}

// ─── Account Detail Modal ─────────────────────────────────────────────────────

const BALANCE_HISTORY_RANGES: BalanceHistoryRange[] = ['1M', '3M', '6M', '1Y'];

function AccountDetailModal({
  account,
  onClose,
  onEdit,
}: {
  account: Account | null;
  onClose: () => void;
  onEdit: () => void;
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

  const detail = data?.account ?? account;
  const history = historyData ?? [];
  const txns = data?.recentTransactions ?? [];

  return (
    <Modal open={!!account} onClose={onClose} title={account?.name ?? ''} size="lg">
      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <Skeleton height={32} width={160} />
          <Skeleton height={200} width="100%" />
          {[1, 2, 3].map((i) => <Skeleton key={i} height={40} width="100%" />)}
        </div>
      ) : (
        <>
          {/* Header stats */}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>
                {detail?.institution ?? ''}{detail?.lastFour ? ` ••${detail.lastFour}` : ''}
              </div>
              <div style={{
                fontSize: '1.75rem',
                fontWeight: 700,
                color: detail && detail.balance < 0 ? 'var(--color-danger)' : 'var(--color-text)',
              }}>
                {detail ? fmtCurrency(detail.balance, detail.currency) : '—'}
              </div>
            </div>
            <Button variant="outline" size="sm" icon={<Pencil size={14} />} onClick={onEdit}>
              Edit
            </Button>
          </div>

          {/* Balance history chart */}
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Balance History
              </div>
              <div style={{ display: 'flex', gap: '0.25rem', backgroundColor: 'var(--color-surface-hover)', borderRadius: 'var(--radius-md)', padding: '0.2rem' }}>
                {BALANCE_HISTORY_RANGES.map((r) => (
                  <button
                    key={r}
                    onClick={() => setHistoryRange(r)}
                    style={{
                      padding: '0.2rem 0.5rem',
                      fontSize: '0.6875rem',
                      fontWeight: 600,
                      border: 'none',
                      cursor: 'pointer',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: historyRange === r ? 'var(--color-surface-elevated)' : 'transparent',
                      color: historyRange === r ? 'var(--color-text)' : 'var(--color-text-muted)',
                      transition: 'background 0.15s',
                    }}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
            {historyLoading ? (
              <Skeleton height={160} width="100%" />
            ) : history.length === 0 ? (
              <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                No history yet — snapshots are taken daily.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={history} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="acctGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#E5622A" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#E5622A" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }}
                    tickFormatter={(d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    interval="preserveStartEnd"
                  />
                  <YAxis hide domain={['auto', 'auto']} />
                  <Tooltip
                    formatter={(value: number) => [fmtCurrency(value), 'Balance']}
                    labelFormatter={(label: string) => fmtDate(label)}
                    contentStyle={{
                      backgroundColor: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '0.8125rem',
                    }}
                  />
                  <Area type="monotone" dataKey="balance" stroke="#E5622A" strokeWidth={2} fill="url(#acctGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Recent transactions */}
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.5rem' }}>
              Recent Transactions
            </div>
            {txns.length === 0 ? (
              <div style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', padding: '0.5rem 0' }}>
                No transactions found.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {txns.map((txn, idx) => (
                  <div key={txn.id}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0' }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: 'var(--radius-full)',
                        backgroundColor: 'var(--color-accent)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', fontSize: '0.75rem', fontWeight: 700, flexShrink: 0,
                      }}>
                        {(txn.merchantName ?? '?')[0].toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {txn.merchantName}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                          {txn.categoryName ?? '—'} · {fmtDate(txn.date)}
                        </div>
                      </div>
                      <span style={{ fontSize: '0.875rem', fontWeight: 600, color: txn.amount < 0 ? 'var(--color-danger)' : 'var(--color-success)', flexShrink: 0 }}>
                        {txn.amount < 0 ? '-' : '+'}{fmtCurrency(Math.abs(txn.amount))}
                      </span>
                    </div>
                    {idx < txns.length - 1 && (
                      <div style={{ height: 1, backgroundColor: 'var(--color-border)' }} />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}

// ─── Skeleton Loaders ─────────────────────────────────────────────────────────

function AccountsSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <Card padding="lg">
        <div style={{ display: 'flex', gap: '2rem', marginBottom: '1rem' }}>
          <Skeleton height={40} width={120} />
          <Skeleton height={40} width={120} />
          <div style={{ marginLeft: 'auto' }}>
            <Skeleton height={48} width={140} />
          </div>
        </div>
        <Skeleton height={10} width="100%" />
      </Card>
      {[1, 2, 3].map((i) => (
        <Card key={i} padding="none" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '0.75rem 1rem', backgroundColor: 'var(--color-surface-hover)' }}>
            <Skeleton height={16} width={120} />
          </div>
          <div style={{ padding: '0.5rem 1rem' }}>
            {[1, 2].map((j) => (
              <div key={j} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', height: 48 }}>
                <Skeleton width={32} height={32} rounded />
                <div style={{ flex: 1 }}>
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

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AccountsPage() {
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery<AccountsData>({
    queryKey: ['accounts'],
    queryFn: () => api.get('/accounts').then((r) => r.data),
  });

  const [showAdd, setShowAdd] = useState(false);
  const [editAccount, setEditAccount] = useState<Account | null>(null);
  const [detailAccount, setDetailAccount] = useState<Account | null>(null);

  const grouped = data?.groups ? buildGroupMap(data.groups) : null;

  // When edit is triggered from detail modal, close detail and open edit
  function handleEditFromDetail() {
    const acct = detailAccount;
    setDetailAccount(null);
    setEditAccount(acct);
  }

  return (
    <div style={{ padding: '1rem 0' }}>
      {/* Page header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '1.5rem',
        flexWrap: 'wrap',
        gap: '0.75rem',
      }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>
          Accounts
        </h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Button
            variant="ghost"
            size="sm"
            icon={<RefreshCw size={14} />}
            onClick={() => notify.info('Manual refresh is not available')}
          >
            Refresh all
          </Button>
          <Button
            size="sm"
            icon={<Plus size={14} />}
            onClick={() => setShowAdd(true)}
          >
            Add account
          </Button>
        </div>
      </div>

      {isLoading ? (
        <AccountsSkeleton />
      ) : isError || !data ? (
        <div style={{
          padding: '2rem',
          textAlign: 'center',
          color: 'var(--color-danger)',
          fontSize: '0.875rem',
        }}>
          Failed to load accounts.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)', gap: '1rem', alignItems: 'start' }}>
          {/* Left column: net worth chart + groups */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
                />
              );
            })}
          </div>

          {/* Right column: summary stats */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <Card padding="lg">
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '1rem' }}>
                Summary
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {GROUP_ORDER.map((type) => {
                  const accounts = grouped?.get(type) ?? [];
                  if (accounts.length === 0) return null;
                  const total = groupTotal(accounts);
                  return (
                    <div key={type} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                        {GROUP_LABELS[type]}
                      </span>
                      <span style={{
                        fontSize: '0.875rem',
                        fontWeight: 600,
                        color: isLiability(type) && total > 0 ? 'var(--color-danger)' : total < 0 ? 'var(--color-danger)' : 'var(--color-text)',
                      }}>
                        {fmtCurrency(total)}
                      </span>
                    </div>
                  );
                })}
                <div style={{ height: 1, backgroundColor: 'var(--color-border)', margin: '0.25rem 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)' }}>Net Worth</span>
                  <span style={{
                    fontSize: '1rem',
                    fontWeight: 700,
                    color: data.netWorth.total >= 0 ? 'var(--color-text)' : 'var(--color-danger)',
                  }}>
                    {fmtCurrency(data.netWorth.total)}
                  </span>
                </div>
              </div>
            </Card>

            <Card padding="lg">
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '1rem' }}>
                Account Count
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {GROUP_ORDER.map((type) => {
                  const count = grouped?.get(type)?.length ?? 0;
                  if (count === 0) return null;
                  return (
                    <div key={type} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>{GROUP_LABELS[type]}</span>
                      <span style={{
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        padding: '0.125rem 0.5rem',
                        borderRadius: 'var(--radius-full)',
                        backgroundColor: 'var(--color-surface-hover)',
                        color: 'var(--color-text-secondary)',
                      }}>
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
      <AccountDetailModal
        account={detailAccount}
        onClose={() => setDetailAccount(null)}
        onEdit={handleEditFromDetail}
      />
    </div>
  );
}
