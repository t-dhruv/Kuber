import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Bot, CheckCircle2, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { Button, Card, Input, Select, notify, Skeleton } from '@/components/ui';
import { EmailConnectorSection } from './EmailConnectorSection';
import { SectionHeader } from './SectionHeader';

interface ApiErrorBody {
  error?: string;
}

interface AiConfigResponse {
  provider: string;
  model: string;
  baseUrl: string | null;
  headers: string | null;
  hasApiKey: boolean;
  updatedAt: string | null;
}

interface EmailConfigResponse {
  provider?: 'resend' | 'smtp' | 'none';
  resendFrom?: string | null;
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpUser?: string | null;
  smtpFrom?: string | null;
  hasResendKey?: boolean;
  hasSmtpPass?: boolean;
}

const PROVIDER_DEFAULTS: Record<string, { model: string; label: string; keyHint: string; needsBaseUrl: boolean; apiKeyOptional: boolean }> = {
  anthropic: { model: 'claude-sonnet-4-6', label: 'Claude (Anthropic)', keyHint: 'console.anthropic.com', needsBaseUrl: false, apiKeyOptional: false },
  openai: { model: 'gpt-4o', label: 'OpenAI (GPT)', keyHint: 'platform.openai.com', needsBaseUrl: false, apiKeyOptional: false },
  gemini: { model: 'gemini-1.5-pro', label: 'Google Gemini', keyHint: 'aistudio.google.com', needsBaseUrl: false, apiKeyOptional: false },
  openrouter: { model: 'openai/gpt-4o', label: 'OpenRouter', keyHint: 'openrouter.ai/keys', needsBaseUrl: false, apiKeyOptional: false },
  nvidia: { model: 'moonshotai/kimi-k2-instruct', label: 'Nvidia NIM', keyHint: 'build.nvidia.com', needsBaseUrl: false, apiKeyOptional: false },
  ollama: { model: 'llama3.2', label: 'Ollama (local)', keyHint: '', needsBaseUrl: true, apiKeyOptional: true },
  custom: { model: '', label: 'Custom API endpoint', keyHint: '', needsBaseUrl: true, apiKeyOptional: true },
  none: { model: '', label: 'None (disabled)', keyHint: '', needsBaseUrl: false, apiKeyOptional: true },
};

const PROVIDER_OPTIONS = [
  { value: 'none', label: 'None (disabled)' },
  { value: 'anthropic', label: 'Claude (Anthropic)' },
  { value: 'openai', label: 'OpenAI (GPT)' },
  { value: 'gemini', label: 'Google Gemini' },
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'nvidia', label: 'Nvidia NIM' },
  { value: 'ollama', label: 'Ollama (local)' },
  { value: 'custom', label: 'Custom API endpoint' },
];

const EMAIL_PROVIDER_OPTIONS = [
  { value: 'none', label: 'None (disabled)' },
  { value: 'resend', label: 'Resend' },
  { value: 'smtp', label: 'SMTP' },
];

function getErrorMessage(err: unknown, fallback: string) {
  if (axios.isAxiosError<ApiErrorBody>(err)) {
    return err.response?.data?.error ?? fallback;
  }
  return fallback;
}

function AiAdvisorCard() {
  const queryClient = useQueryClient();
  const [provider, setProvider] = useState('none');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [headers, setHeaders] = useState('');
  const [testResult, setTestResult] = useState<{ valid: boolean; error?: string } | null>(null);
  const [initialized, setInitialized] = useState(false);

  const { data: config } = useQuery<AiConfigResponse>({
    queryKey: ['settings', 'ai-config'],
    queryFn: () => api.get('/settings/ai-config').then((r) => r.data),
  });

  useEffect(() => {
    if (config && !initialized) {
      setProvider(config.provider);
      setModel(config.model || PROVIDER_DEFAULTS[config.provider]?.model || '');
      setBaseUrl(config.baseUrl ?? '');
      setHeaders(config.headers ?? '');
      setInitialized(true);
    }
  }, [config, initialized]);

  const saveMutation = useMutation({
    mutationFn: () =>
      api.put('/settings/ai-config', {
        provider,
        model,
        apiKey: apiKey || undefined,
        baseUrl: baseUrl || undefined,
        headers: headers.trim() || undefined,
      }).then((r) => r.data as AiConfigResponse),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'ai-config'] });
      setApiKey('');
      setTestResult(null);
      notify.success('AI configuration saved');
    },
    onError: (err: unknown) => notify.error('Failed to save', getErrorMessage(err, 'Unknown error')),
  });

  const testMutation = useMutation({
    mutationFn: () =>
      api.post('/settings/ai-config/test').then((r) => r.data as { valid: boolean; error?: string }),
    onSuccess: (data) => setTestResult(data),
    onError: () => setTestResult({ valid: false, error: 'Request failed' }),
  });

  function handleProviderChange(newProvider: string) {
    setProvider(newProvider);
    setModel(PROVIDER_DEFAULTS[newProvider]?.model ?? '');
    setBaseUrl(newProvider === 'ollama' ? 'http://localhost:11434/v1' : '');
    setHeaders('');
    setTestResult(null);
  }

  const providerMeta = PROVIDER_DEFAULTS[provider];
  const isConfigured = config && config.provider !== 'none' && (config.hasApiKey || PROVIDER_DEFAULTS[config.provider]?.apiKeyOptional);
  const keyHint = providerMeta?.keyHint ?? '';
  const showBaseUrl = providerMeta?.needsBaseUrl || provider === 'openrouter';
  const showHeaders = provider === 'custom';
  const showApiKey = provider !== 'none';

  return (
    <Card padding="lg">
      <div className="mb-2 flex items-center gap-2">
        <Bot size={18} color="var(--color-primary)" />
        <span className="font-semibold text-[var(--color-text)]">AI Advisor</span>
      </div>

      <div className="mb-4 flex items-center gap-2">
        <span
          className="inline-block h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: isConfigured ? 'var(--color-success, #22c55e)' : 'var(--color-text-muted)' }}
        />
        <span className="text-[0.8125rem] text-[var(--color-text-secondary)]">
          {isConfigured
            ? `Configured - ${PROVIDER_DEFAULTS[config.provider]?.label ?? config.provider} (${config.model})`
            : 'Not configured'}
        </span>
      </div>

      <div className="flex flex-col gap-3.5">
        <div>
          <label className="mb-1.5 block text-[0.8125rem] font-medium text-[var(--color-text)]">
            Provider
          </label>
          <Select
            value={provider}
            onChange={(e) => handleProviderChange(e.target.value)}
            options={PROVIDER_OPTIONS}
          />
        </div>

        {provider !== 'none' && (
          <div>
            <label className="mb-1.5 block text-[0.8125rem] font-medium text-[var(--color-text)]">
              Model
            </label>
            <Input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={providerMeta?.model || 'Enter model name'}
            />
          </div>
        )}

        {showBaseUrl && (
          <div>
            <label className="mb-1.5 block text-[0.8125rem] font-medium text-[var(--color-text)]">
              API Base URL
              {provider === 'ollama' && (
                <span className="ml-2 font-normal text-[var(--color-text-muted)]">- default: http://localhost:11434/v1</span>
              )}
            </label>
            <Input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={provider === 'ollama' ? 'http://localhost:11434/v1' : provider === 'openrouter' ? 'https://openrouter.ai/api/v1' : 'https://your-api.example.com/v1'}
            />
            {provider === 'custom' && (
              <p className="mt-1.5 text-xs text-[var(--color-warning)]">
                Custom endpoints receive your AI prompt and financial context. Kuber blocks private and reserved network targets, but only use endpoints you operate or trust.
              </p>
            )}
          </div>
        )}

        {showApiKey && (
          <div>
            <label className="mb-1.5 block text-[0.8125rem] font-medium text-[var(--color-text)]">
              API Key
              {providerMeta?.apiKeyOptional && (
                <span className="ml-2 font-normal text-[var(--color-text-muted)]">- optional</span>
              )}
              {keyHint && (
                <span className="ml-2 font-normal text-[var(--color-text-muted)]">
                  - get yours at {keyHint}
                </span>
              )}
            </label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={config?.hasApiKey && config.provider === provider ? '********' : providerMeta?.apiKeyOptional ? 'Leave empty if not required' : 'Enter API key'}
            />
          </div>
        )}

        {showHeaders && (
          <div>
            <label className="mb-1.5 block text-[0.8125rem] font-medium text-[var(--color-text)]">
              Custom Headers
              <span className="ml-2 font-normal text-[var(--color-text-muted)]">- JSON object, optional</span>
            </label>
            <textarea
              value={headers}
              onChange={(e) => setHeaders(e.target.value)}
              placeholder={'{"Authorization": "Bearer sk-...", "X-Custom-Header": "value"}'}
              rows={3}
              className="w-full resize-y rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
            />
          </div>
        )}

        {testResult && (
          <div
            className="flex items-center gap-2 text-[0.8125rem]"
            style={{ color: testResult.valid ? 'var(--color-success, #22c55e)' : 'var(--color-danger, #ef4444)' }}
          >
            {testResult.valid
              ? <><CheckCircle2 size={14} /> Connection successful</>
              : <><XCircle size={14} /> {testResult.error ?? 'Connection failed'}</>}
          </div>
        )}

        <div className="mt-1 flex gap-3">
          <Button
            variant="primary"
            size="sm"
            loading={saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            Save
          </Button>
          <Button
            variant="secondary"
            size="sm"
            loading={testMutation.isPending}
            onClick={() => testMutation.mutate()}
            disabled={provider === 'none'}
          >
            Test Connection
          </Button>
        </div>
      </div>
    </Card>
  );
}

function EmailConfigCard() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery<EmailConfigResponse>({
    queryKey: ['email-config'],
    queryFn: () => api.get('/settings/email-config').then((r) => r.data),
  });

  const [provider, setProvider] = useState<'resend' | 'smtp' | 'none'>('none');
  const [resendKey, setResendKey] = useState('');
  const [resendFrom, setResendFrom] = useState('');
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [smtpFrom, setSmtpFrom] = useState('');

  useEffect(() => {
    if (!data) return;
    setProvider(data.provider ?? 'none');
    setResendFrom(data.resendFrom ?? '');
    setSmtpHost(data.smtpHost ?? '');
    setSmtpPort(String(data.smtpPort ?? 587));
    setSmtpUser(data.smtpUser ?? '');
    setSmtpFrom(data.smtpFrom ?? '');
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => api.put('/settings/email-config', {
      provider,
      ...(resendKey ? { resendApiKey: resendKey } : {}),
      resendFrom,
      smtpHost,
      smtpPort: parseInt(smtpPort, 10) || 587,
      smtpUser,
      ...(smtpPass ? { smtpPass } : {}),
      smtpFrom,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-config'] });
      setResendKey('');
      setSmtpPass('');
      notify.success('Email config saved');
    },
    onError: (err: unknown) => notify.error('Failed to save', getErrorMessage(err, 'Unknown error')),
  });

  const testMutation = useMutation({
    mutationFn: () => api.post('/settings/email/test'),
    onSuccess: () => notify.success('Test email sent', 'Check your inbox.'),
    onError: (err: unknown) => notify.error('Failed to send test email', getErrorMessage(err, 'Check your email configuration.')),
  });

  if (isLoading) return <Card padding="lg"><Skeleton className="h-40" /></Card>;

  return (
    <Card padding="lg">
      <div className="mb-1 font-semibold text-[var(--color-text)]">Email provider</div>
      <p className="mb-4 text-sm text-[var(--color-text-secondary)]">
        Used for password resets, welcome emails, and notifications.
      </p>

      <div className="flex flex-col gap-3">
        <Select
          label="Provider"
          value={provider}
          onChange={(e) => setProvider(e.target.value as 'resend' | 'smtp' | 'none')}
          options={EMAIL_PROVIDER_OPTIONS}
        />

        {provider === 'resend' && (
          <>
            <Input
              label={data?.hasResendKey ? 'Resend API key (leave blank to keep existing)' : 'Resend API key'}
              type="password"
              placeholder={data?.hasResendKey ? '************' : 're_...'}
              value={resendKey}
              onChange={(e) => setResendKey(e.target.value)}
            />
            <Input
              label="From address"
              placeholder="Kuber <noreply@yourdomain.com>"
              value={resendFrom}
              onChange={(e) => setResendFrom(e.target.value)}
            />
          </>
        )}

        {provider === 'smtp' && (
          <>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <Input label="SMTP host" placeholder="smtp.gmail.com" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} />
              </div>
              <Input label="Port" placeholder="587" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} />
            </div>
            <Input label="Username" placeholder="you@gmail.com" value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} />
            <Input
              label={data?.hasSmtpPass ? 'Password (leave blank to keep existing)' : 'Password'}
              type="password"
              placeholder={data?.hasSmtpPass ? '********' : 'App password'}
              value={smtpPass}
              onChange={(e) => setSmtpPass(e.target.value)}
            />
            <Input
              label="From address"
              placeholder="Kuber <noreply@yourdomain.com>"
              value={smtpFrom}
              onChange={(e) => setSmtpFrom(e.target.value)}
            />
          </>
        )}

        <div className="flex gap-2 pt-1">
          <Button variant="primary" size="sm" loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            Save
          </Button>
          <Button variant="secondary" size="sm" loading={testMutation.isPending} onClick={() => testMutation.mutate()} disabled={provider === 'none'}>
            Send test email
          </Button>
        </div>
      </div>
    </Card>
  );
}

export function IntegrationsSection() {
  return (
    <div>
      <SectionHeader title="Integrations" description="Configure external services used by Kuber." />

      <div className="flex flex-col gap-6" style={{ maxWidth: 560 }}>
        <AiAdvisorCard />
        <EmailConnectorSection />
        <EmailConfigCard />
      </div>
    </div>
  );
}
