import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, Check, Trash2, Plus, ExternalLink, Key, Zap, Globe } from 'lucide-react';
import { api } from '@/lib/api';
import { Button, Input, Card, Modal, ModalFooter, notify } from '@/components/ui';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ApiToken {
  id: string;
  name: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

interface CreatedToken {
  id: string;
  name: string;
  token: string;
  createdAt: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function CopyButton({ value, size = 14 }: { value: string; size?: number }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button
      onClick={handleCopy}
      title="Copy to clipboard"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem',
        padding: '0.25rem 0.5rem',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-sm)',
        backgroundColor: 'var(--color-surface)',
        cursor: 'pointer',
        fontSize: '0.75rem',
        color: copied ? 'var(--color-success)' : 'var(--color-text-secondary)',
        flexShrink: 0,
      }}
    >
      {copied ? <Check size={size} /> : <Copy size={size} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Sub-sections ─────────────────────────────────────────────────────────────

function ApiTokensSection() {
  const queryClient = useQueryClient();
  const [tokenName, setTokenName] = useState('');
  const [newToken, setNewToken] = useState<CreatedToken | null>(null);
  const [showModal, setShowModal] = useState(false);

  const { data: tokens = [], isLoading } = useQuery<ApiToken[]>({
    queryKey: ['settings', 'api-tokens'],
    queryFn: () => api.get('/settings/api-tokens').then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => api.post('/settings/api-tokens', { name }).then((r) => r.data as CreatedToken),
    onSuccess: (data) => {
      setNewToken(data);
      setShowModal(true);
      setTokenName('');
      queryClient.invalidateQueries({ queryKey: ['settings', 'api-tokens'] });
    },
    onError: () => notify.error('Failed to create token'),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/settings/api-tokens/${id}`),
    onSuccess: () => {
      notify.success('Token revoked');
      queryClient.invalidateQueries({ queryKey: ['settings', 'api-tokens'] });
    },
    onError: () => notify.error('Failed to revoke token'),
  });

  function handleCreate() {
    if (!tokenName.trim()) return;
    createMutation.mutate(tokenName.trim());
  }

  return (
    <Card style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
        <Key size={16} style={{ color: 'var(--color-accent)' }} />
        <h3 style={{ margin: 0, fontSize: '0.9375rem', fontWeight: 600, color: 'var(--color-text)' }}>
          API Tokens
        </h3>
      </div>
      <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
        Create long-lived API tokens for n8n and other automation tools.
      </p>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
        <Input
          value={tokenName}
          onChange={(e) => setTokenName(e.target.value)}
          placeholder="Token name (e.g. n8n-automation)"
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          style={{ flex: 1 }}
        />
        <Button
          onClick={handleCreate}
          disabled={!tokenName.trim() || createMutation.isPending}
          size="sm"
        >
          <Plus size={14} style={{ marginRight: '0.25rem' }} />
          Create Token
        </Button>
      </div>

      {isLoading ? (
        <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>Loading...</div>
      ) : tokens.length === 0 ? (
        <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', padding: '0.75rem 0' }}>
          No tokens yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {tokens.map((token) => (
            <div
              key={token.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.625rem 0.75rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-surface)',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)' }}>
                  {token.name}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.125rem' }}>
                  Created {formatDate(token.createdAt)}
                  {' · '}Last used {formatDate(token.lastUsedAt)}
                  {token.expiresAt && ` · Expires ${formatDate(token.expiresAt)}`}
                </div>
              </div>
              <button
                onClick={() => revokeMutation.mutate(token.id)}
                disabled={revokeMutation.isPending}
                title="Revoke token"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0.25rem',
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  color: 'var(--color-danger)',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* One-time token reveal modal */}
      {showModal && newToken && (
        <Modal
          open={showModal}
          onClose={() => { setShowModal(false); setNewToken(null); }}
          title="Token Created — Save It Now"
        >
          <div style={{ padding: '1rem 0' }}>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
              This is the only time this token will be shown. Copy it now and store it securely.
            </p>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.75rem',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                fontFamily: 'monospace',
                fontSize: '0.8125rem',
                wordBreak: 'break-all',
                color: 'var(--color-text)',
              }}
            >
              <span style={{ flex: 1 }}>{newToken.token}</span>
              <CopyButton value={newToken.token} size={16} />
            </div>
          </div>
          <ModalFooter>
            <Button onClick={() => { setShowModal(false); setNewToken(null); }}>
              I saved it — Close
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </Card>
  );
}

function N8nConnectionSection() {
  return (
    <Card style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
        <Zap size={16} style={{ color: 'var(--color-accent)' }} />
        <h3 style={{ margin: 0, fontSize: '0.9375rem', fontWeight: 600, color: 'var(--color-text)' }}>
          n8n Automation
        </h3>
      </div>
      <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
        n8n is the workflow automation engine that powers market news syncing, price updates, and CSV imports.
        Start it with the automation profile.
      </p>
      <div
        style={{
          padding: '0.75rem',
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          fontSize: '0.8125rem',
          fontFamily: 'monospace',
          marginBottom: '1rem',
          color: 'var(--color-text-secondary)',
        }}
      >
        docker compose --profile automation up -d
      </div>
      <a
        href="http://localhost:5678"
        target="_blank"
        rel="noopener noreferrer"
        style={{ textDecoration: 'none' }}
      >
        <Button variant="outline" size="sm">
          <ExternalLink size={14} style={{ marginRight: '0.375rem' }} />
          Open n8n
        </Button>
      </a>
    </Card>
  );
}

function WebhookUrlsSection() {
  const origin = window.location.origin;

  const endpoints = [
    { label: 'Webhook Import', url: `${origin}/api/v1/import/webhook` },
    { label: 'Intel Feed', url: `${origin}/api/v1/investment-intel/feed` },
    { label: 'Price Update', url: `${origin}/api/v1/investments/holdings/prices` },
    { label: 'CSV Import', url: `${origin}/api/v1/import/csv` },
  ];

  return (
    <Card style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
        <Globe size={16} style={{ color: 'var(--color-accent)' }} />
        <h3 style={{ margin: 0, fontSize: '0.9375rem', fontWeight: 600, color: 'var(--color-text)' }}>
          Webhook URLs
        </h3>
      </div>
      <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
        Use these URLs in your n8n workflows. All endpoints require a Bearer API token.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {endpoints.map(({ label, url }) => (
          <div
            key={url}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.625rem 0.75rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              backgroundColor: 'var(--color-surface)',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '0.125rem' }}>
                {label}
              </div>
              <div style={{ fontSize: '0.8125rem', fontFamily: 'monospace', color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {url}
              </div>
            </div>
            <CopyButton value={url} />
          </div>
        ))}
      </div>
    </Card>
  );
}

function WatchTickersSection() {
  const queryClient = useQueryClient();
  const [tickers, setTickers] = useState('');

  const { data, isLoading } = useQuery<{ tickers: string }>({
    queryKey: ['settings', 'watch-tickers'],
    queryFn: () => api.get('/settings/watch-tickers').then((r) => r.data),
  });

  useEffect(() => {
    if (data) setTickers(data.tickers);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: (value: string) => api.put('/settings/watch-tickers', { tickers: value }),
    onSuccess: () => {
      notify.success('Watch tickers saved');
      queryClient.invalidateQueries({ queryKey: ['settings', 'watch-tickers'] });
    },
    onError: () => notify.error('Failed to save tickers'),
  });

  return (
    <Card style={{ padding: '1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
        <Zap size={16} style={{ color: 'var(--color-accent)' }} />
        <h3 style={{ margin: 0, fontSize: '0.9375rem', fontWeight: 600, color: 'var(--color-text)' }}>
          Watch Tickers
        </h3>
      </div>
      <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
        Comma-separated list of ticker symbols for market news filtering and price updates (e.g. AAPL, TSLA, VFV.TO).
      </p>
      {isLoading ? (
        <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>Loading...</div>
      ) : (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Input
            value={tickers}
            onChange={(e) => setTickers(e.target.value)}
            placeholder="AAPL, TSLA, MSFT, VFV.TO"
            style={{ flex: 1 }}
          />
          <Button
            onClick={() => saveMutation.mutate(tickers)}
            disabled={saveMutation.isPending}
            size="sm"
          >
            Save
          </Button>
        </div>
      )}
    </Card>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function AutomationSection() {
  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>
          Automation
        </h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginTop: '0.25rem' }}>
          Connect n8n workflows to automate market news, price updates, and statement imports.
        </p>
      </div>
      <ApiTokensSection />
      <N8nConnectionSection />
      <WebhookUrlsSection />
      <WatchTickersSection />
    </div>
  );
}
