import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Mail, Eye, EyeOff, CheckCircle2, XCircle, Info } from 'lucide-react';
import { api } from '@/lib/api';
import { Button, Input, Select, Checkbox, Card, notify, ConfirmDialog } from '@/components/ui';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ImapConfigResponse {
  configured: boolean;
  host?: string;
  port?: number;
  user?: string;
  tls?: boolean;
  accountId?: string;
}

interface AccountGroup {
  accounts: { id: string; name: string; type: string }[];
}

interface AccountsResponse {
  groups: AccountGroup[];
}

interface ParsedTransaction {
  description: string;
  amount: number;
  date: string;
}

interface TestResult {
  success: boolean;
  found: number;
  preview: ParsedTransaction[];
}

interface SyncResult {
  imported: number;
  found: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function EmailConnectorSection() {
  const queryClient = useQueryClient();

  // Form state
  const [host, setHost] = useState('');
  const [port, setPort] = useState(993);
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [tls, setTls] = useState(true);
  const [folder, setFolder] = useState('INBOX');
  const [accountId, setAccountId] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  // Result state
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: config } = useQuery<ImapConfigResponse>({
    queryKey: ['email-connector-config'],
    queryFn: () => api.get('/email-connector/config').then((r) => r.data as ImapConfigResponse),
  });

  const { data: accountsData } = useQuery<AccountsResponse>({
    queryKey: ['accounts'],
    queryFn: () => api.get('/accounts').then((r) => r.data as AccountsResponse),
  });

  // Flatten accounts for select
  const allAccounts = accountsData?.groups.flatMap((g) => g.accounts) ?? [];
  const accountOptions = [
    { value: '', label: 'Select an account…' },
    ...allAccounts.map((a) => ({ value: a.id, label: a.name })),
  ];

  // Pre-fill form from fetched config
  useEffect(() => {
    if (config && !initialized) {
      if (config.configured) {
        setHost(config.host ?? '');
        setPort(config.port ?? 993);
        setUser(config.user ?? '');
        setTls(config.tls ?? true);
        setAccountId(config.accountId ?? '');
      }
      setInitialized(true);
    }
  }, [config, initialized]);

  // ── Mutations ────────────────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: () =>
      api.put('/email-connector/config', {
        host,
        port,
        user,
        password,
        tls,
        folder: folder || 'INBOX',
        accountId: accountId || undefined,
      }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-connector-config'] });
      setPassword('');
      setTestResult(null);
      setSyncResult(null);
      notify.success('Email connector saved');
    },
    onError: (err: { response?: { data?: { error?: string } } }) =>
      notify.error('Failed to save', err?.response?.data?.error ?? 'Unknown error'),
  });

  const testMutation = useMutation({
    mutationFn: () =>
      api.post('/email-connector/test', {
        host,
        port,
        user,
        password,
        tls,
        folder: folder || 'INBOX',
        accountId: accountId || undefined,
      }).then((r) => r.data as TestResult),
    onSuccess: (data) => {
      setTestResult(data);
      setSyncResult(null);
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      setTestResult(null);
      notify.error('Test failed', err?.response?.data?.error ?? 'Connection failed');
    },
  });

  const syncMutation = useMutation({
    mutationFn: () =>
      api.post('/email-connector/sync').then((r) => r.data as SyncResult),
    onSuccess: (data) => {
      setSyncResult(data);
      setTestResult(null);
      notify.success(`Imported ${data.imported} transaction${data.imported !== 1 ? 's' : ''}`);
    },
    onError: (err: { response?: { data?: { error?: string } } }) =>
      notify.error('Sync failed', err?.response?.data?.error ?? 'Unknown error'),
  });

  const removeMutation = useMutation({
    mutationFn: () => api.delete('/email-connector/config').then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-connector-config'] });
      setHost('');
      setPort(993);
      setUser('');
      setPassword('');
      setTls(true);
      setFolder('INBOX');
      setAccountId('');
      setTestResult(null);
      setSyncResult(null);
      setInitialized(false);
      setConfirmRemove(false);
      notify.success('Email connector removed');
    },
    onError: (err: { response?: { data?: { error?: string } } }) =>
      notify.error('Failed to remove', err?.response?.data?.error ?? 'Unknown error'),
  });

  // ── Derived ──────────────────────────────────────────────────────────────

  const isConfigured = config?.configured ?? false;
  const canSave = !!accountId;
  const needsPasswordForTest = !password && !isConfigured;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <Card padding="lg">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <Mail size={18} color="var(--color-primary)" />
        <span className="font-semibold text-[var(--color-text)]">Email / IMAP Connector</span>
      </div>

      <p className="text-sm text-[var(--color-text-secondary)] m-0 mb-4">
        Automatically import transactions from Amazon order emails and PayPal receipts.
      </p>

      {/* Status badge */}
      <div className="flex items-center gap-2 mb-5">
        <span
          className="w-2 h-2 rounded-full inline-block shrink-0"
          style={{ backgroundColor: isConfigured ? 'var(--color-success, #22c55e)' : 'var(--color-text-muted)' }}
        />
        <span className="text-[0.8125rem] text-[var(--color-text-secondary)]">
          {isConfigured ? `Connected — ${config?.user}` : 'Not configured'}
        </span>
      </div>

      {/* Info banner */}
      <div className="flex gap-2.5 items-start bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-[var(--radius-md)] px-4 py-3 mb-5 text-[0.8125rem] text-[var(--color-text-secondary)] leading-relaxed">
        <Info size={14} className="shrink-0 mt-0.5 text-[var(--color-primary)]" />
        <span>
          Parses <strong>Amazon order confirmations</strong> (subject: "Your Amazon.com order") and{' '}
          <strong>PayPal payment receipts</strong> (subject: "You sent a payment") from your inbox.
          Transactions are imported with "needs review" status.
        </span>
      </div>

      {/* Form */}
      <div className="flex flex-col gap-3.5">

        {/* Host + Port row */}
        <div className="flex gap-3">
          <div className="flex-1">
            <label className={labelClass}>IMAP Host</label>
            <Input
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="imap.gmail.com"
            />
          </div>
          <div className="w-[100px]">
            <label className={labelClass}>Port</label>
            <Input
              type="number"
              value={String(port)}
              onChange={(e) => setPort(Number(e.target.value))}
              placeholder="993"
            />
          </div>
        </div>

        {/* Username */}
        <div>
          <label className={labelClass}>Username / Email</label>
          <Input
            value={user}
            onChange={(e) => setUser(e.target.value)}
            placeholder="you@gmail.com"
          />
        </div>

        {/* Password */}
        <div>
          <label className={labelClass}>
            Password
            {isConfigured && (
              <span className="font-normal text-[var(--color-text-muted)] ml-2">
                — leave blank to keep existing
              </span>
            )}
          </label>
          <div className="relative">
            <Input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isConfigured ? '••••••••' : 'App password or IMAP password'}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 bg-transparent border-none cursor-pointer p-0 text-[var(--color-text-secondary)] flex items-center"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>

        {/* TLS */}
        <div className="flex items-center gap-2">
          <Checkbox
            checked={tls}
            onChange={(e) => setTls((e.target as HTMLInputElement).checked)}
            id="imap-tls"
          />
          <label htmlFor="imap-tls" className="text-[0.8125rem] text-[var(--color-text)] cursor-pointer">
            Use TLS (recommended — port 993)
          </label>
        </div>

        {/* Folder */}
        <div>
          <label className={labelClass}>Folder</label>
          <Input
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            placeholder="INBOX"
          />
        </div>

        {/* Account */}
        <div>
          <label className={labelClass}>Destination Account</label>
          <Select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            options={accountOptions}
          />
          {!accountId && (
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              Select an account to enable saving.
            </p>
          )}
        </div>

        {/* Test result */}
        {testResult && (
          <div className="bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-[var(--radius-md)] px-4 py-3 text-[0.8125rem]">
            <div className={`flex items-center gap-2 ${testResult.preview.length ? 'mb-2.5' : ''}`}>
              {testResult.success
                ? <CheckCircle2 size={14} color="var(--color-success, #22c55e)" />
                : <XCircle size={14} color="var(--color-danger, #ef4444)" />}
              <span
                className="font-medium"
                style={{ color: testResult.success ? 'var(--color-success, #22c55e)' : 'var(--color-danger, #ef4444)' }}
              >
                {testResult.success ? `Connection successful — found ${testResult.found} matching email${testResult.found !== 1 ? 's' : ''}` : 'Connection failed'}
              </span>
            </div>
            {testResult.preview.length > 0 && (
              <div className="text-[var(--color-text-secondary)]">
                <div className="font-medium mb-1.5">Preview:</div>
                {testResult.preview.map((tx, i) => (
                  <div key={i} className="flex gap-2 pl-2">
                    <span>{tx.description}</span>
                    <span className="text-[var(--color-danger,#ef4444)]">${Math.abs(tx.amount).toFixed(2)}</span>
                    <span>{tx.date}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Sync result */}
        {syncResult && (
          <div className="flex items-center gap-2 text-[0.8125rem] text-[var(--color-success,#22c55e)]">
            <CheckCircle2 size={14} />
            Imported {syncResult.imported} transaction{syncResult.imported !== 1 ? 's' : ''} (found {syncResult.found} emails)
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 flex-wrap mt-1 items-center">
          <div title={!canSave ? 'Select an account first' : undefined} className="inline-flex">
            <Button
              variant="primary"
              size="sm"
              loading={saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
              disabled={!canSave}
            >
              Save Config
            </Button>
          </div>

          <Button
            variant="secondary"
            size="sm"
            loading={testMutation.isPending}
            onClick={() => testMutation.mutate()}
            disabled={!host || !user || needsPasswordForTest}
          >
            Test Connection
          </Button>

          {isConfigured && (
            <Button
              variant="secondary"
              size="sm"
              loading={syncMutation.isPending}
              onClick={() => syncMutation.mutate()}
            >
              Sync Now
            </Button>
          )}

          {isConfigured && (
            <Button
              variant="ghost"
              size="sm"
              loading={removeMutation.isPending}
              onClick={() => setConfirmRemove(true)}
              className="ml-auto text-[var(--color-danger,#ef4444)]"
            >
              Remove
            </Button>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        onConfirm={() => removeMutation.mutate()}
        title="Remove Email Connector"
        message="Remove this IMAP connector configuration? Automatic email imports will stop."
        confirmLabel="Remove connector"
        loading={removeMutation.isPending}
      />
    </Card>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const labelClass = 'text-[0.8125rem] font-medium text-[var(--color-text)] block mb-1.5';
