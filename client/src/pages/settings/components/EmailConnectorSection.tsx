import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Mail, Eye, EyeOff, CheckCircle2, XCircle, Info } from 'lucide-react';
import { api } from '@/lib/api';
import { Button, Input, Select, Checkbox, Card, notify } from '@/components/ui';

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
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <Mail size={18} color="var(--color-primary)" />
        <span style={{ fontWeight: 600, color: 'var(--color-text)' }}>Email / IMAP Connector</span>
      </div>

      <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', margin: '0 0 1rem 0' }}>
        Automatically import transactions from Amazon order emails and PayPal receipts.
      </p>

      {/* Status badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          backgroundColor: isConfigured ? 'var(--color-success, #22c55e)' : 'var(--color-text-muted)',
          display: 'inline-block', flexShrink: 0,
        }} />
        <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
          {isConfigured ? `Connected — ${config?.user}` : 'Not configured'}
        </span>
      </div>

      {/* Info banner */}
      <div style={{
        display: 'flex', gap: '0.625rem', alignItems: 'flex-start',
        backgroundColor: 'var(--color-surface-hover)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        padding: '0.75rem 1rem',
        marginBottom: '1.25rem',
        fontSize: '0.8125rem',
        color: 'var(--color-text-secondary)',
        lineHeight: 1.5,
      }}>
        <Info size={14} style={{ flexShrink: 0, marginTop: 2, color: 'var(--color-primary)' }} />
        <span>
          Parses <strong>Amazon order confirmations</strong> (subject: "Your Amazon.com order") and{' '}
          <strong>PayPal payment receipts</strong> (subject: "You sent a payment") from your inbox.
          Transactions are imported with "needs review" status.
        </span>
      </div>

      {/* Form */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>

        {/* Host + Port row */}
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>IMAP Host</label>
            <Input
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="imap.gmail.com"
            />
          </div>
          <div style={{ width: 100 }}>
            <label style={labelStyle}>Port</label>
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
          <label style={labelStyle}>Username / Email</label>
          <Input
            value={user}
            onChange={(e) => setUser(e.target.value)}
            placeholder="you@gmail.com"
          />
        </div>

        {/* Password */}
        <div>
          <label style={labelStyle}>
            Password
            {isConfigured && (
              <span style={{ fontWeight: 400, color: 'var(--color-text-muted)', marginLeft: '0.5rem' }}>
                — leave blank to keep existing
              </span>
            )}
          </label>
          <div style={{ position: 'relative' }}>
            <Input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isConfigured ? '••••••••' : 'App password or IMAP password'}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              style={{
                position: 'absolute', right: '0.625rem', top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                color: 'var(--color-text-secondary)',
                display: 'flex', alignItems: 'center',
              }}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>

        {/* TLS */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Checkbox
            checked={tls}
            onChange={(e) => setTls((e.target as HTMLInputElement).checked)}
            id="imap-tls"
          />
          <label htmlFor="imap-tls" style={{ fontSize: '0.8125rem', color: 'var(--color-text)', cursor: 'pointer' }}>
            Use TLS (recommended — port 993)
          </label>
        </div>

        {/* Folder */}
        <div>
          <label style={labelStyle}>Folder</label>
          <Input
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            placeholder="INBOX"
          />
        </div>

        {/* Account */}
        <div>
          <label style={labelStyle}>Destination Account</label>
          <Select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            options={accountOptions}
          />
          {!accountId && (
            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.3rem' }}>
              Select an account to enable saving.
            </p>
          )}
        </div>

        {/* Test result */}
        {testResult && (
          <div style={{
            backgroundColor: 'var(--color-surface-hover)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            padding: '0.75rem 1rem',
            fontSize: '0.8125rem',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: testResult.preview.length ? '0.625rem' : 0 }}>
              {testResult.success
                ? <CheckCircle2 size={14} color="var(--color-success, #22c55e)" />
                : <XCircle size={14} color="var(--color-danger, #ef4444)" />}
              <span style={{ color: testResult.success ? 'var(--color-success, #22c55e)' : 'var(--color-danger, #ef4444)', fontWeight: 500 }}>
                {testResult.success ? `Connection successful — found ${testResult.found} matching email${testResult.found !== 1 ? 's' : ''}` : 'Connection failed'}
              </span>
            </div>
            {testResult.preview.length > 0 && (
              <div style={{ color: 'var(--color-text-secondary)' }}>
                <div style={{ fontWeight: 500, marginBottom: '0.375rem' }}>Preview:</div>
                {testResult.preview.map((tx, i) => (
                  <div key={i} style={{ display: 'flex', gap: '0.5rem', paddingLeft: '0.5rem' }}>
                    <span>{tx.description}</span>
                    <span style={{ color: 'var(--color-danger, #ef4444)' }}>${Math.abs(tx.amount).toFixed(2)}</span>
                    <span>{tx.date}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Sync result */}
        {syncResult && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            fontSize: '0.8125rem',
            color: 'var(--color-success, #22c55e)',
          }}>
            <CheckCircle2 size={14} />
            Imported {syncResult.imported} transaction{syncResult.imported !== 1 ? 's' : ''} (found {syncResult.found} emails)
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.25rem', alignItems: 'center' }}>
          <div title={!canSave ? 'Select an account first' : undefined} style={{ display: 'inline-flex' }}>
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
              onClick={() => removeMutation.mutate()}
              style={{ color: 'var(--color-danger, #ef4444)', marginLeft: 'auto' }}
            >
              Remove
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  fontSize: '0.8125rem',
  fontWeight: 500,
  color: 'var(--color-text)',
  display: 'block',
  marginBottom: '0.375rem',
};
