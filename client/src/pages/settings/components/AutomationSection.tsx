import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, Check, Trash2, Plus, Key, Zap, Globe } from 'lucide-react';
import { api } from '@/lib/api';
import { Button, Input, Card, Modal, ModalFooter, notify, ConfirmDialog } from '@/components/ui';

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
      className="inline-flex items-center gap-1 px-2 py-1 border border-[var(--color-border)] rounded-[var(--radius-sm)] bg-[var(--color-surface)] cursor-pointer text-xs shrink-0"
      style={{ color: copied ? 'var(--color-success)' : 'var(--color-text-secondary)' }}
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
  const [revokeTarget, setRevokeTarget] = useState<ApiToken | null>(null);

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
      setRevokeTarget(null);
      queryClient.invalidateQueries({ queryKey: ['settings', 'api-tokens'] });
    },
    onError: () => notify.error('Failed to revoke token'),
  });

  function handleCreate() {
    if (!tokenName.trim()) return;
    createMutation.mutate(tokenName.trim());
  }

  return (
    <Card className="p-5 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <Key size={16} className="text-[var(--color-accent)]" />
        <h3 className="m-0 text-[0.9375rem] font-semibold text-[var(--color-text)]">
          API Tokens
        </h3>
      </div>
      <p className="text-[0.8125rem] text-[var(--color-text-secondary)] mb-4">
        Create long-lived API tokens for external automation tools.
      </p>

      <div className="flex gap-2 mb-5">
        <Input
          value={tokenName}
          onChange={(e) => setTokenName(e.target.value)}
          placeholder="Token name (e.g. statement-importer)"
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          className="flex-1"
        />
        <Button
          onClick={handleCreate}
          disabled={!tokenName.trim() || createMutation.isPending}
          size="sm"
        >
          <Plus size={14} className="mr-1" />
          Create Token
        </Button>
      </div>

      {isLoading ? (
        <div className="text-[0.8125rem] text-[var(--color-text-muted)]">Loading...</div>
      ) : tokens.length === 0 ? (
        <div className="text-[0.8125rem] text-[var(--color-text-muted)] py-3">
          No tokens yet.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {tokens.map((token) => (
            <div
              key={token.id}
              className="flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-[var(--color-text)]">
                  {token.name}
                </div>
                <div className="text-xs text-[var(--color-text-muted)] mt-0.5">
                  Created {formatDate(token.createdAt)}
                  {' · '}Last used {formatDate(token.lastUsedAt)}
                  {token.expiresAt && ` · Expires ${formatDate(token.expiresAt)}`}
                </div>
              </div>
              <button
                onClick={() => setRevokeTarget(token)}
                disabled={revokeMutation.isPending}
                title="Revoke token"
                className="flex items-center p-1 border-none bg-transparent cursor-pointer text-[var(--color-danger)] rounded-[var(--radius-sm)]"
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
          <div className="py-4">
            <p className="text-sm text-[var(--color-text-secondary)] mb-4">
              This is the only time this token will be shown. Copy it now and store it securely.
            </p>
            <div className="flex items-center gap-3 p-3 rounded-[var(--radius-md)] bg-[var(--color-surface)] border border-[var(--color-border)] font-mono text-[0.8125rem] break-all text-[var(--color-text)]">
              <span className="flex-1">{newToken.token}</span>
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
      <ConfirmDialog
        open={revokeTarget !== null}
        onClose={() => setRevokeTarget(null)}
        onConfirm={() => revokeTarget && revokeMutation.mutate(revokeTarget.id)}
        title="Revoke API Token"
        message={<>Revoke <strong>{revokeTarget?.name}</strong>? Automations using this token will stop working.</>}
        confirmLabel="Revoke token"
        loading={revokeMutation.isPending}
      />
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
    <Card className="p-5 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <Globe size={16} className="text-[var(--color-accent)]" />
        <h3 className="m-0 text-[0.9375rem] font-semibold text-[var(--color-text)]">
          Webhook URLs
        </h3>
      </div>
      <p className="text-[0.8125rem] text-[var(--color-text-secondary)] mb-4">
        Use these URLs with external automation tools. All endpoints require a Bearer API token.
      </p>
      <div className="flex flex-col gap-2">
        {endpoints.map(({ label, url }) => (
          <div
            key={url}
            className="flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]"
          >
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-[var(--color-text-muted)] mb-0.5">
                {label}
              </div>
              <div className="text-[0.8125rem] font-mono text-[var(--color-text)] overflow-hidden text-ellipsis whitespace-nowrap">
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
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <Zap size={16} className="text-[var(--color-accent)]" />
        <h3 className="m-0 text-[0.9375rem] font-semibold text-[var(--color-text)]">
          Watch Tickers
        </h3>
      </div>
      <p className="text-[0.8125rem] text-[var(--color-text-secondary)] mb-4">
        Comma-separated list of ticker symbols for market news filtering and price updates (e.g. AAPL, TSLA, VFV.TO).
      </p>
      {isLoading ? (
        <div className="text-[0.8125rem] text-[var(--color-text-muted)]">Loading...</div>
      ) : (
        <div className="flex gap-2">
          <Input
            value={tickers}
            onChange={(e) => setTickers(e.target.value)}
            placeholder="AAPL, TSLA, MSFT, VFV.TO"
            className="flex-1"
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
      <div className="mb-6">
        <h2 className="text-lg font-bold text-[var(--color-text)] m-0">
          Automation
        </h2>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          Connect external tools to automate market news, price updates, and statement imports.
        </p>
      </div>
      <ApiTokensSection />
      <WebhookUrlsSection />
      <WatchTickersSection />
    </div>
  );
}
