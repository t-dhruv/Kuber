import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  User, Monitor, Bell, Shield, Home, Tag, Database, CreditCard,
  Pencil, Trash2, Plus, ChevronDown, ChevronRight, Upload, ShieldCheck, ShieldOff, Mail, Bot,
  CheckCircle2, XCircle, Receipt, Zap, Globe, Eye, EyeOff,
} from 'lucide-react';
import { api } from '@/lib/api';
import {
  Button, Input, Select, Checkbox, Avatar, Card, CardDivider, Modal, ModalFooter, notify, Skeleton,
} from '@/components/ui';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { TaxAccountsSection } from './components/TaxAccountsSection';
import { EmailConnectorSection } from './components/EmailConnectorSection';
import { AutomationSection } from './components/AutomationSection';
import { useAuthStore } from '@/stores/authStore';
import { useTotpStatus, useTotpSetup, useTotpEnable, useTotpDisable } from '@/hooks/useAuth';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProfileData {
  firstName: string;
  lastName: string;
  email: string;
  timezone: string;
  avatarUrl?: string | null;
}

interface NotificationPrefs {
  accountDisconnected: { inApp: boolean; email: boolean; push: boolean };
  largeExpense: { inApp: boolean; email: boolean; push: boolean };
  needsReview: { inApp: boolean; email: boolean; push: boolean };
  overBudget: { inApp: boolean; email: boolean; push: boolean };
  monthlyRecap: { inApp: boolean; email: boolean; push: boolean };
  newRecurring: { inApp: boolean; email: boolean; push: boolean };
  paymentDue: { inApp: boolean; email: boolean; push: boolean };
  goalMilestone: { inApp: boolean; email: boolean; push: boolean };
  weeklyDigest: { inApp: boolean; email: boolean; push: boolean };
}

interface HouseholdData {
  name: string;
  currency: string;
  members: HouseholdMember[];
}

interface HouseholdMember {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  joinedAt: string;
}

interface Category {
  id: string;
  name: string;
  emoji: string | null;
  groupId: string | null;
  groupName: string | null;
  group?: { id: string; name: string } | null;
  isTaxDeductible?: boolean;
}

interface CategoryGroup {
  id: string | null;
  name: string;
  categories: Category[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TIMEZONE_OPTIONS = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HT)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Paris (CET/CEST)' },
  { value: 'Europe/Berlin', label: 'Berlin (CET/CEST)' },
  { value: 'Asia/Kolkata', label: 'India (IST)' },
  { value: 'Asia/Tokyo', label: 'Japan (JST)' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST)' },
  { value: 'UTC', label: 'UTC' },
];

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

const ROLE_OPTIONS = [
  { value: 'Member', label: 'Member' },
  { value: 'Admin', label: 'Admin' },
];

type NavSection =
  | 'profile'
  | 'display'
  | 'notifications'
  | 'security'
  | 'household'
  | 'categories'
  | 'tags'
  | 'merchants'
  | 'integrations'
  | 'report-digest'
  | 'data'
  | 'billing'
  | 'tax-accounts'
  | 'automation'
  | 'webhooks';

const NAV_ITEMS: { id: NavSection; label: string; icon: React.ReactNode }[] = [
  { id: 'profile', label: 'Profile', icon: <User size={16} /> },
  { id: 'display', label: 'Display', icon: <Monitor size={16} /> },
  { id: 'notifications', label: 'Notifications', icon: <Bell size={16} /> },
  { id: 'security', label: 'Security', icon: <Shield size={16} /> },
  { id: 'household', label: 'Household', icon: <Home size={16} /> },
  { id: 'categories', label: 'Categories', icon: <Tag size={16} /> },
  { id: 'tags', label: 'Tags', icon: <Tag size={16} /> },
  { id: 'merchants', label: 'Merchants', icon: <CreditCard size={16} /> },
  { id: 'integrations', label: 'Integrations', icon: <Mail size={16} /> },
  { id: 'report-digest', label: 'Report Digest', icon: <Receipt size={16} /> },
  { id: 'data', label: 'Data', icon: <Database size={16} /> },
  { id: 'billing', label: 'Billing', icon: <CreditCard size={16} /> },
  { id: 'tax-accounts', label: 'Tax Accounts', icon: <Receipt size={16} /> },
  { id: 'automation', label: 'Automation', icon: <Zap size={16} /> },
  { id: 'webhooks', label: 'Webhooks', icon: <Globe size={16} /> },
];

// ─── Section: Profile ─────────────────────────────────────────────────────────

function ProfileSection() {
  const { user, setAuth } = useAuthStore();
  const { data, isLoading } = useQuery<ProfileData>({
    queryKey: ['settings', 'profile'],
    queryFn: () => api.get('/settings/profile').then((r) => r.data),
  });

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [timezone, setTimezone] = useState('UTC');

  useEffect(() => {
    if (data) {
      setFirstName(data.firstName);
      setLastName(data.lastName);
      setTimezone(data.timezone);
    }
  }, [data]);

  const mutation = useMutation({
    mutationFn: () => api.put('/settings/profile', { firstName, lastName, timezone }),
    onSuccess: (res) => {
      const updated = res.data as ProfileData;
      // Update auth store display name
      if (user) {
        setAuth(
          { ...user, firstName: updated.firstName, lastName: updated.lastName } as typeof user,
          useAuthStore.getState().accessToken!
        );
      }
      notify.success('Profile saved');
    },
    onError: () => notify.error('Failed to save profile'),
  });

  const fullName = data ? `${data.firstName} ${data.lastName}`.trim() : '';

  return (
    <div>
      <SectionHeader title="Profile" description="Manage your personal information." />

      {isLoading ? (
        <div className="text-[var(--color-text-muted)] text-sm">Loading...</div>
      ) : (
        <div className="flex flex-col gap-6">
          {/* Avatar row */}
          <div className="flex items-center gap-5">
            <Avatar
              src={data?.avatarUrl}
              name={fullName || 'User'}
              size="xl"
              style={{ width: 72, height: 72, fontSize: '1.25rem' }}
            />
            <div>
              <Button
                variant="secondary"
                size="sm"
                icon={<Upload size={14} />}
                onClick={() => notify.info('Photo upload not yet implemented')}
              >
                Upload photo
              </Button>
              <p className="mt-1.5 text-xs text-[var(--color-text-muted)]">
                JPG, PNG or GIF. Max 2 MB.
              </p>
            </div>
          </div>

          {/* Name row */}
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="First Name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
            <Input
              label="Last Name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>

          <Input
            label="Email"
            value={data?.email ?? ''}
            readOnly
            className="bg-[var(--color-surface-hover)] cursor-not-allowed"
          />

          <Select
            label="Timezone"
            value={timezone}
            options={TIMEZONE_OPTIONS}
            onChange={(e) => setTimezone(e.target.value)}
          />

          <div>
            <Button
              variant="primary"
              loading={mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              Save changes
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Section: Display ─────────────────────────────────────────────────────────

type ThemeOption = 'light' | 'dark' | 'system';

function applyTheme(theme: ThemeOption) {
  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.dataset.theme = prefersDark ? 'dark' : 'light';
  } else {
    document.documentElement.dataset.theme = theme;
  }
}

function DisplaySection() {
  const [theme, setTheme] = useState<ThemeOption>(() => {
    return (localStorage.getItem('kuber_theme') as ThemeOption) ?? 'system';
  });

  function handleThemeChange(t: ThemeOption) {
    setTheme(t);
    localStorage.setItem('kuber_theme', t);
    applyTheme(t);
  }

  const options: { value: ThemeOption; label: string; description: string }[] = [
    { value: 'light', label: 'Light', description: 'Always use light mode' },
    { value: 'dark', label: 'Dark', description: 'Always use dark mode' },
    { value: 'system', label: 'System', description: 'Follow your OS preference' },
  ];

  return (
    <div>
      <SectionHeader title="Display" description="Customize the visual appearance of Kuber." />

      <Card padding="lg" style={{ maxWidth: 480 }}>
        <div className="mb-3">
          <span className="text-sm font-semibold text-[var(--color-text)]">
            Visual Appearance
          </span>
        </div>
        <div className="flex flex-col gap-3">
          {options.map((opt) => (
            <label
              key={opt.value}
              className="flex items-center gap-3 p-3 rounded-[var(--radius-md)] cursor-pointer transition-[border-color,background-color] duration-[0.15s]"
              style={{
                border: `1px solid ${theme === opt.value ? 'var(--color-accent)' : 'var(--color-border)'}`,
                backgroundColor: theme === opt.value ? 'var(--color-accent-light)' : 'transparent',
              }}
            >
              <input
                type="radio"
                name="theme"
                value={opt.value}
                checked={theme === opt.value}
                onChange={() => handleThemeChange(opt.value)}
                className="accent-[var(--color-accent)]"
              />
              <div>
                <div className="text-sm font-medium text-[var(--color-text)]">
                  {opt.label}
                </div>
                <div className="text-xs text-[var(--color-text-muted)]">
                  {opt.description}
                </div>
              </div>
            </label>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ─── Section: Notifications ───────────────────────────────────────────────────

type NotifKey = keyof NotificationPrefs;
type NotifChannel = 'inApp' | 'email' | 'push';

const NOTIF_ROWS: { key: NotifKey; label: string; group: string }[] = [
  { key: 'accountDisconnected', label: 'Account disconnected', group: 'ACCOUNTS' },
  { key: 'largeExpense', label: 'Large expense alert (>$500)', group: 'TRANSACTIONS' },
  { key: 'needsReview', label: 'Needs review reminder', group: 'TRANSACTIONS' },
  { key: 'overBudget', label: 'Over budget alert', group: 'BUDGETS' },
  { key: 'monthlyRecap', label: 'Monthly recap', group: 'BUDGETS' },
  { key: 'newRecurring', label: 'New recurring detected', group: 'RECURRING' },
  { key: 'paymentDue', label: 'Payment due reminder', group: 'RECURRING' },
  { key: 'goalMilestone', label: 'Goal milestone reached', group: 'GOALS' },
  { key: 'weeklyDigest', label: 'Weekly financial digest', group: 'OTHER' },
];

const DEFAULT_NOTIF_PREFS: NotificationPrefs = {
  accountDisconnected: { inApp: true, email: true, push: false },
  largeExpense: { inApp: true, email: false, push: false },
  needsReview: { inApp: true, email: false, push: false },
  overBudget: { inApp: true, email: true, push: false },
  monthlyRecap: { inApp: true, email: true, push: false },
  newRecurring: { inApp: true, email: false, push: false },
  paymentDue: { inApp: true, email: true, push: false },
  goalMilestone: { inApp: true, email: true, push: false },
  weeklyDigest: { inApp: true, email: true, push: false },
};

function PushSubscriptionButton() {
  const [status, setStatus] = useState<'unknown' | 'subscribed' | 'unsubscribed' | 'unsupported'>('unknown');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setStatus('unsupported');
      return;
    }
    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      setStatus(sub ? 'subscribed' : 'unsubscribed');
    }).catch(() => setStatus('unsubscribed'));
  }, []);

  async function subscribe() {
    setLoading(true);
    try {
      const { data } = await api.get('/push/vapid-public-key');
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: data.publicKey,
      });
      const json = sub.toJSON();
      await api.post('/push/subscribe', {
        endpoint: json.endpoint,
        keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
      });
      setStatus('subscribed');
      notify.success('Push notifications enabled');
    } catch (err: any) {
      notify.error(err?.response?.data?.error ?? 'Could not enable push notifications');
    } finally {
      setLoading(false);
    }
  }

  async function unsubscribe() {
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await api.delete('/push/unsubscribe', { data: { endpoint: sub.endpoint } });
        await sub.unsubscribe();
      }
      setStatus('unsubscribed');
      notify.success('Push notifications disabled');
    } catch {
      notify.error('Failed to unsubscribe');
    } finally {
      setLoading(false);
    }
  }

  if (status === 'unsupported') return null;
  if (status === 'unknown') return null;

  return (
    <div className="flex items-center justify-between px-3 py-3 border border-[var(--color-border)] rounded-[var(--radius-lg)] bg-[var(--color-surface)]">
      <div>
        <div className="text-sm font-medium text-[var(--color-text)]">Browser push notifications</div>
        <div className="text-xs text-[var(--color-text-muted)] mt-0.5">
          {status === 'subscribed' ? 'This browser will receive push notifications.' : 'Subscribe to receive push alerts on this device.'}
        </div>
      </div>
      <Button
        variant={status === 'subscribed' ? 'secondary' : 'primary'}
        size="sm"
        loading={loading}
        onClick={status === 'subscribed' ? unsubscribe : subscribe}
      >
        {status === 'subscribed' ? 'Unsubscribe' : 'Enable'}
      </Button>
    </div>
  );
}

function NotificationsSection() {
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIF_PREFS);
  const [lowBalanceThreshold, setLowBalanceThreshold] = useState<number | null>(null);
  const [lowBalanceInput, setLowBalanceInput] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lowBalanceDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data, isLoading } = useQuery<{ preferences: NotificationPrefs & { lowBalanceThreshold?: number | null } }>({
    queryKey: ['settings', 'notifications'],
    queryFn: () => api.get('/settings/notifications').then((r) => r.data),
  });

  useEffect(() => {
    if (data?.preferences) {
      const { lowBalanceThreshold: lbt, ...rest } = data.preferences as NotificationPrefs & { lowBalanceThreshold?: number | null };
      setPrefs(rest as NotificationPrefs);
      const threshold = lbt ?? null;
      setLowBalanceThreshold(threshold);
      if (threshold != null) setLowBalanceInput(String(threshold));
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: (updated: NotificationPrefs) =>
      api.put('/settings/notifications', { preferences: updated }),
    onError: () => notify.error('Failed to save notification preferences'),
  });

  const saveLowBalanceMutation = useMutation({
    mutationFn: (threshold: number | null) =>
      api.put('/settings/notifications', { lowBalanceThreshold: threshold }),
    onError: () => notify.error('Failed to save low balance threshold'),
  });

  function togglePref(key: NotifKey, channel: NotifChannel) {
    setPrefs((prev) => {
      const updated = {
        ...prev,
        [key]: { ...prev[key], [channel]: !prev[key][channel] },
      };
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => saveMutation.mutate(updated), 500);
      return updated;
    });
  }

  function toggleLowBalance(enabled: boolean) {
    const threshold = enabled ? (parseFloat(lowBalanceInput) || 100) : null;
    if (enabled) setLowBalanceInput(String(threshold));
    setLowBalanceThreshold(threshold);
    saveLowBalanceMutation.mutate(threshold);
  }

  function handleLowBalanceAmount(val: string) {
    setLowBalanceInput(val);
    const parsed = parseFloat(val);
    if (!isNaN(parsed) && parsed >= 0) {
      setLowBalanceThreshold(parsed);
      if (lowBalanceDebounceRef.current) clearTimeout(lowBalanceDebounceRef.current);
      lowBalanceDebounceRef.current = setTimeout(() => saveLowBalanceMutation.mutate(parsed), 500);
    }
  }

  // Group rows by their group label
  const groups = NOTIF_ROWS.reduce<Record<string, typeof NOTIF_ROWS>>((acc, row) => {
    if (!acc[row.group]) acc[row.group] = [];
    acc[row.group].push(row);
    return acc;
  }, {});

  const channels: { key: NotifChannel; label: string }[] = [
    { key: 'inApp', label: 'In-App' },
    { key: 'email', label: 'Email' },
    { key: 'push', label: 'Push' },
  ];

  if (isLoading) {
    return (
      <div>
        <SectionHeader title="Notifications" description="Choose what you want to be notified about." />
        <div className="text-[var(--color-text-muted)] text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div>
      <SectionHeader title="Notifications" description="Choose what you want to be notified about." />

      <PushSubscriptionButton />

      <div className="flex flex-col gap-0">
        {Object.entries(groups).map(([groupName, rows]) => (
          <div key={groupName}>
            <div className="px-3 pt-3.5 pb-1.5 text-[0.6875rem] font-bold text-[var(--color-text-muted)] tracking-[0.06em] uppercase">
              {groupName}
            </div>
            {/* Channel headers */}
            <div className="flex items-center border-t border-[var(--color-border)] px-3 py-1">
              <div className="flex-1 text-xs font-medium text-[var(--color-text-muted)]" />
              {channels.map((ch) => (
                <div key={ch.key} className="w-16 text-center text-[0.6875rem] font-semibold text-[var(--color-text-secondary)]">
                  {ch.label}
                </div>
              ))}
            </div>
            {rows.map((row) => (
              <div
                key={row.key}
                className="flex items-center border-t border-[var(--color-border)] px-3 py-2.5"
              >
                <div className="flex-1 text-sm text-[var(--color-text)] pr-2">{row.label}</div>
                {channels.map((ch) => (
                  <div key={ch.key} className="w-16 flex justify-center">
                    <input
                      type="checkbox"
                      checked={prefs[row.key][ch.key]}
                      onChange={() => togglePref(row.key, ch.key)}
                      className="w-4 h-4 accent-[var(--color-accent)] cursor-pointer"
                      aria-label={`${row.label} — ${ch.label}`}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}

        {/* Low balance alert */}
        <div>
          <div className="px-3 pt-3.5 pb-1.5 text-[0.6875rem] font-bold text-[var(--color-text-muted)] tracking-[0.06em] uppercase">
            ALERTS
          </div>
          <div className="flex items-center border-t border-[var(--color-border)] px-3 py-2.5 gap-3">
            <div className="flex-1 text-sm text-[var(--color-text)]">Low balance alert</div>
            <div className="flex items-center gap-2">
              {lowBalanceThreshold != null && (
                <div className="flex items-center gap-1">
                  <span className="text-sm text-[var(--color-text-muted)]">$</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={lowBalanceInput}
                    onChange={(e) => handleLowBalanceAmount(e.target.value)}
                    className="w-20 text-sm border border-[var(--color-border)] rounded-[var(--radius-sm)] px-2 py-1 bg-[var(--color-surface)] text-[var(--color-text)]"
                    aria-label="Low balance threshold amount"
                  />
                </div>
              )}
              <input
                type="checkbox"
                checked={lowBalanceThreshold != null}
                onChange={(e) => toggleLowBalance(e.target.checked)}
                className="w-4 h-4 accent-[var(--color-accent)] cursor-pointer"
                aria-label="Enable low balance alert"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 2FA Setup Flow ───────────────────────────────────────────────────────────

type TotpSetupStep = 'idle' | 'qr' | 'confirm' | 'backup-codes';

function TwoFactorCard() {
  const { data: status, isLoading } = useTotpStatus();
  const setupMutation = useTotpSetup();
  const enableMutation = useTotpEnable();
  const disableMutation = useTotpDisable();

  const [step, setStep] = useState<TotpSetupStep>('idle');
  const [qrData, setQrData] = useState<{ secret: string; qrCodeDataUrl: string } | null>(null);
  const [confirmCode, setConfirmCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [disableModalOpen, setDisableModalOpen] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');

  const errorMessage = (enableMutation.error as any)?.response?.data?.error ?? null;
  const disableError = (disableMutation.error as any)?.response?.data?.error ?? null;

  function handleStartSetup() {
    setupMutation.mutate(undefined, {
      onSuccess: (data) => {
        setQrData(data);
        setConfirmCode('');
        setStep('qr');
      },
      onError: () => notify.error('Failed to start 2FA setup'),
    });
  }

  function handleConfirm() {
    if (confirmCode.length !== 6) return;
    enableMutation.mutate({ code: confirmCode }, {
      onSuccess: (data) => {
        setBackupCodes(data.backupCodes);
        setStep('backup-codes');
        notify.success('Two-factor authentication enabled');
      },
    });
  }

  function handleDisable() {
    if (!disablePassword) return;
    disableMutation.mutate({ password: disablePassword }, {
      onSuccess: () => {
        setDisableModalOpen(false);
        setDisablePassword('');
        notify.success('Two-factor authentication disabled');
      },
    });
  }

  if (isLoading) return null;

  const isEnabled = status?.totpEnabled ?? false;

  return (
    <>
      <Card padding="lg">
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-3 items-start">
            {isEnabled
              ? <ShieldCheck size={20} className="text-[var(--color-success)] shrink-0 mt-0.5" />
              : <ShieldOff size={20} className="text-[var(--color-text-muted)] shrink-0 mt-0.5" />
            }
            <div>
              <div className="font-semibold text-[var(--color-text)] mb-1">
                Two-Factor Authentication
              </div>
              <p className="text-sm text-[var(--color-text-secondary)] m-0">
                {isEnabled
                  ? `Enabled — ${status?.backupCodesRemaining ?? 0} backup code${status?.backupCodesRemaining !== 1 ? 's' : ''} remaining`
                  : 'Add an extra layer of security using an authenticator app.'}
              </p>
            </div>
          </div>
          {step === 'idle' && (
            isEnabled ? (
              <Button variant="outline" size="sm" className="border-[var(--color-danger)] text-[var(--color-danger)] shrink-0" onClick={() => setDisableModalOpen(true)}>
                Disable
              </Button>
            ) : (
              <Button variant="secondary" size="sm" loading={setupMutation.isPending} onClick={handleStartSetup} className="shrink-0">
                Set up
              </Button>
            )
          )}
        </div>

        {/* Step: Show QR code */}
        {step === 'qr' && qrData && (
          <div className="mt-6 border-t border-[var(--color-border)] pt-6">
            <p className="text-sm text-[var(--color-text-secondary)] mb-4">
              Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.), then click <strong>Next</strong>.
            </p>
            <div className="flex justify-center mb-4">
              <img src={qrData.qrCodeDataUrl} alt="TOTP QR code" className="w-[180px] h-[180px] rounded-[var(--radius-md)] border border-[var(--color-border)]" />
            </div>
            <p className="text-xs text-[var(--color-text-muted)] text-center mb-4">
              Can't scan? Enter this key manually: <code className="select-all">{qrData.secret}</code>
            </p>
            <div className="flex gap-3 justify-end">
              <Button variant="ghost" onClick={() => { setStep('idle'); setQrData(null); }}>Cancel</Button>
              <Button variant="primary" onClick={() => setStep('confirm')}>Next</Button>
            </div>
          </div>
        )}

        {/* Step: Confirm code */}
        {step === 'confirm' && (
          <div className="mt-6 border-t border-[var(--color-border)] pt-6">
            <p className="text-sm text-[var(--color-text-secondary)] mb-4">
              Enter the 6-digit code from your authenticator app to verify setup.
            </p>
            <input
              type="text"
              inputMode="numeric"
              value={confirmCode}
              onChange={(e) => setConfirmCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              maxLength={6}
              autoFocus
              className="w-full px-3.5 py-2.5 rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-bg)] text-[var(--color-text)] text-[1.375rem] tracking-[0.4em] text-center outline-none box-border mb-3"
            />
            {errorMessage && (
              <div className="p-2.5 rounded-[var(--radius-md)] bg-[var(--color-danger-light)] text-[var(--color-danger)] text-sm mb-3">
                {errorMessage}
              </div>
            )}
            <div className="flex gap-3 justify-end">
              <Button variant="secondary" onClick={() => setStep('qr')}>Back</Button>
              <Button
                variant="primary"
                loading={enableMutation.isPending}
                disabled={confirmCode.length !== 6}
                onClick={handleConfirm}
              >
                Verify & Enable
              </Button>
            </div>
          </div>
        )}

        {/* Step: Show backup codes */}
        {step === 'backup-codes' && (
          <div className="mt-6 border-t border-[var(--color-border)] pt-6">
            <p className="text-sm text-[var(--color-text)] font-semibold mb-2">
              Save your backup codes
            </p>
            <p className="text-sm text-[var(--color-text-secondary)] mb-4">
              Store these codes somewhere safe. Each can be used once if you lose access to your authenticator app.
            </p>
            <div className="grid grid-cols-2 gap-2 bg-[var(--color-surface-hover)] rounded-[var(--radius-md)] p-4 mb-4 font-mono text-[0.9375rem]">
              {backupCodes.map((code) => (
                <div key={code} className="text-[var(--color-text)] tracking-[0.05em]">{code}</div>
              ))}
            </div>
            <div className="flex gap-3 justify-end">
              <Button variant="secondary" size="sm" onClick={() => {
                navigator.clipboard.writeText(backupCodes.join('\n'));
                notify.success('Backup codes copied to clipboard');
              }}>
                Copy codes
              </Button>
              <Button variant="primary" onClick={() => setStep('idle')}>Done</Button>
            </div>
          </div>
        )}
      </Card>

      {/* Disable 2FA modal */}
      <Modal
        open={disableModalOpen}
        onClose={() => { setDisableModalOpen(false); setDisablePassword(''); }}
        title="Disable Two-Factor Authentication"
        size="sm"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-[var(--color-text)]">
            Enter your password to confirm disabling 2FA.
          </p>
          <Input
            label="Password"
            type="password"
            value={disablePassword}
            onChange={(e) => setDisablePassword(e.target.value)}
            autoComplete="current-password"
            error={disableError || undefined}
          />
          <ModalFooter>
            <Button variant="ghost" onClick={() => { setDisableModalOpen(false); setDisablePassword(''); }}>Cancel</Button>
            <Button
              variant="danger"
              loading={disableMutation.isPending}
              disabled={!disablePassword}
              onClick={handleDisable}
            >
              Disable 2FA
            </Button>
          </ModalFooter>
        </div>
      </Modal>
    </>
  );
}

// ─── Section: Security ────────────────────────────────────────────────────────

function SecuritySection() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwError, setPwError] = useState('');
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const clearAuth = useAuthStore((s) => s.clearAuth);

  const passwordMutation = useMutation({
    mutationFn: () => api.put('/settings/password', { currentPassword, newPassword }),
    onSuccess: () => {
      notify.success('Password updated');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPwError('');
    },
    onError: () => notify.error('Failed to update password', 'Check your current password and try again.'),
  });

  function handlePasswordSubmit() {
    setPwError('');
    if (newPassword.length < 8) {
      setPwError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError('Passwords do not match.');
      return;
    }
    passwordMutation.mutate();
  }

  const deleteMutation = useMutation({
    mutationFn: () => api.delete('/settings/account', { data: { confirmPassword: deletePassword } }),
    onSuccess: () => {
      notify.success('Account deleted');
      clearAuth();
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      notify.error(err.response?.data?.error ?? 'Failed to delete account');
    },
  });

  function handleDeleteConfirm() {
    if (!deletePassword) return;
    deleteMutation.mutate();
  }

  return (
    <div>
      <SectionHeader title="Security" description="Manage your password and account access." />

      <div className="flex flex-col gap-6" style={{ maxWidth: 480 }}>
        {/* Change Password */}
        <Card padding="lg">
          <div className="mb-5 font-semibold text-[var(--color-text)]">
            Change Password
          </div>
          <div className="flex flex-col gap-4">
            <Input
              label="Current password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
            />
            <Input
              label="New password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
            <Input
              label="Confirm password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              error={pwError || undefined}
            />
            <Button
              variant="primary"
              loading={passwordMutation.isPending}
              onClick={handlePasswordSubmit}
              className="self-start"
            >
              Update password
            </Button>
          </div>
        </Card>

        {/* Two-Factor Authentication */}
        <TwoFactorCard />

        {/* Danger Zone */}
        <Card padding="lg" className="border-[var(--color-danger)]">
          <div className="mb-2 font-semibold text-[var(--color-danger)]">
            Danger Zone
          </div>
          <p className="text-sm text-[var(--color-text-secondary)] mb-4">
            Permanently delete your account and all associated data. This cannot be undone.
          </p>
          <Button
            variant="outline"
            className="border-[var(--color-danger)] text-[var(--color-danger)]"
            onClick={() => setDeleteModalOpen(true)}
          >
            Delete account
          </Button>
        </Card>
      </div>

      {/* Delete confirmation modal */}
      <Modal
        open={deleteModalOpen}
        onClose={() => { setDeleteModalOpen(false); setDeletePassword(''); }}
        title="Delete Account"
        description="This action is permanent and cannot be undone."
        size="sm"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-[var(--color-text)]">
            Enter your password to permanently delete your account and all associated data.
          </p>
          <Input
            label="Password"
            type="password"
            value={deletePassword}
            onChange={(e) => setDeletePassword(e.target.value)}
            autoComplete="current-password"
          />
          <ModalFooter>
            <Button variant="secondary" onClick={() => { setDeleteModalOpen(false); setDeletePassword(''); }}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={!deletePassword || deleteMutation.isPending}
              loading={deleteMutation.isPending}
              onClick={handleDeleteConfirm}
            >
              Delete my account
            </Button>
          </ModalFooter>
        </div>
      </Modal>
    </div>
  );
}

// ─── Section: Household ───────────────────────────────────────────────────────

function HouseholdSection() {
  const { data, isLoading, refetch } = useQuery<HouseholdData>({
    queryKey: ['settings', 'household'],
    queryFn: () => api.get('/settings/household').then((r) => r.data),
  });

  const [householdName, setHouseholdName] = useState('');
  const [currency, setCurrency] = useState('USD');

  const {
    data: fxData,
    isFetching: fxFetching,
    refetch: refetchFx,
    dataUpdatedAt: fxUpdatedAt,
  } = useQuery<{ base: string; rates: Array<{ code: string; rate: number }> }>({
    queryKey: ['fx', 'snapshot', currency],
    queryFn: () => api.get(`/fx/snapshot?base=${currency}`).then((r) => r.data),
    staleTime: 60 * 60 * 1000,
    enabled: !!currency,
  });
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('Member');
  const [removeTarget, setRemoveTarget] = useState<HouseholdMember | null>(null);

  useEffect(() => {
    if (data) {
      setHouseholdName(data.name);
      setCurrency(data.currency);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => api.put('/settings/household', { name: householdName, currency }),
    onSuccess: () => notify.success('Household saved'),
    onError: () => notify.error('Failed to save household'),
  });

  const inviteMutation = useMutation({
    mutationFn: () => api.post('/settings/household/invite', { email: inviteEmail, role: inviteRole }),
    onSuccess: () => {
      notify.success('Invite sent', `An invitation was sent to ${inviteEmail}`);
      setInviteEmail('');
    },
    onError: () => notify.error('Failed to send invite'),
  });

  const removeMutation = useMutation({
    mutationFn: (memberId: string) => api.delete(`/settings/household/members/${memberId}`),
    onSuccess: () => {
      notify.success('Member removed');
      setRemoveTarget(null);
      refetch();
    },
    onError: () => notify.error('Failed to remove member'),
  });

  if (isLoading) {
    return (
      <div>
        <SectionHeader title="Household" description="Manage your household settings and members." />
        <div className="text-[var(--color-text-muted)] text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div>
      <SectionHeader title="Household" description="Manage your household settings and members." />

      <div className="flex flex-col gap-6" style={{ maxWidth: 560 }}>
        {/* Household settings */}
        <Card padding="lg">
          <div className="flex flex-col gap-4">
            <Input
              label="Household Name"
              value={householdName}
              onChange={(e) => setHouseholdName(e.target.value)}
            />
            <Select
              label="Currency"
              value={currency}
              options={CURRENCY_OPTIONS}
              onChange={(e) => setCurrency(e.target.value)}
            />
            <Button
              variant="primary"
              loading={saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
              className="self-start"
            >
              Save
            </Button>
          </div>
        </Card>

        {/* Live FX Rates */}
        <Card padding="lg">
          <div className="flex items-center justify-between mb-3">
            <div className="font-semibold text-[var(--color-text)]">Live FX Rates</div>
            <div className="flex items-center gap-3">
              {fxUpdatedAt ? (
                <span className="text-xs text-[var(--color-text-muted)]">
                  Updated {new Date(fxUpdatedAt).toLocaleTimeString()}
                </span>
              ) : null}
              <Button variant="ghost" size="sm" loading={fxFetching} onClick={() => refetchFx()}>
                Refresh
              </Button>
            </div>
          </div>
          {fxData ? (
            <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
              {fxData.rates.map((r) => (
                <div
                  key={r.code}
                  className="px-3 py-2 rounded-[0.375rem] bg-[var(--color-surface-elevated)] text-[0.8125rem] text-[var(--color-text)]"
                >
                  <span className="font-semibold">1 {fxData.base}</span>
                  {' = '}
                  <span className="text-[var(--color-primary)]">{r.rate} {r.code}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-[var(--color-text-muted)]">
              {fxFetching ? 'Loading rates...' : 'Rates unavailable'}
            </div>
          )}
        </Card>

        {/* Members */}
        <Card padding="lg">
          <div className="mb-4 font-semibold text-[var(--color-text)]">
            Members
          </div>
          <div className="flex flex-col gap-3">
            {(data?.members ?? []).map((member) => {
              const fullName = `${member.firstName} ${member.lastName}`.trim();
              const isOwnerMember = member.role.toLowerCase() === 'owner';
              return (
                <div
                  key={member.userId}
                  className="flex items-center gap-3 py-2.5 border-b border-[var(--color-border)]"
                >
                  <Avatar src={null} name={fullName} size="sm" />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-[var(--color-text)]">
                      {fullName}
                    </div>
                    <div className="text-xs text-[var(--color-text-muted)]">{member.email}</div>
                  </div>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-[var(--radius-full)] bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)]">
                    {member.role}
                  </span>
                  {!isOwnerMember && (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Trash2 size={13} />}
                      className="text-[var(--color-danger)]"
                      onClick={() => setRemoveTarget(member)}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              );
            })}
          </div>

          <CardDivider />

          {/* Invite */}
          <div className="mt-3">
            <div className="mb-3 font-semibold text-[var(--color-text)] text-sm">
              Invite Member
            </div>
            <div className="flex flex-col gap-3">
              <Input
                label="Email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="name@example.com"
              />
              <Select
                label="Role"
                value={inviteRole}
                options={ROLE_OPTIONS}
                onChange={(e) => setInviteRole(e.target.value)}
              />
              <Button
                variant="secondary"
                loading={inviteMutation.isPending}
                disabled={!inviteEmail}
                onClick={() => inviteMutation.mutate()}
                className="self-start"
              >
                Send invite
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* Remove member modal */}
      <Modal
        open={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        title="Remove Member"
        size="sm"
      >
        <p className="text-sm text-[var(--color-text)] mb-2">
          Remove <strong>{removeTarget ? `${removeTarget.firstName} ${removeTarget.lastName}`.trim() : ''}</strong> from the household?
        </p>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setRemoveTarget(null)}>Cancel</Button>
          <Button
            variant="danger"
            loading={removeMutation.isPending}
            onClick={() => removeTarget && removeMutation.mutate(removeTarget.userId)}
          >
            Remove
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

// ─── Emoji Picker ─────────────────────────────────────────────────────────────

const EMOJI_GROUPS: { label: string; emojis: string[] }[] = [
  { label: 'Money', emojis: ['💰','💵','💳','🏦','📈','📉','💸','🏧','💹','🪙','💴','💶','💷','🤑','📊','💼'] },
  { label: 'Food', emojis: ['🍔','🍕','🥗','☕','🍺','🛒','🥩','🍣','🍜','🥐','🍎','🥑','🧃','🍷','🍰','🥡'] },
  { label: 'Home', emojis: ['🏠','🏡','🛋️','🧹','🔑','🛏️','🪴','🧰','🔧','💡','🚿','🪟','🏗️','🪞','🧺','🏘️'] },
  { label: 'Transport', emojis: ['🚗','✈️','🚌','🚇','⛽','🚕','🛵','🚲','🛫','🏎️','🚢','🚁','🛻','🏍️','⛵','🚐'] },
  { label: 'Health', emojis: ['💊','🏥','🩺','🧘','🏋️','💉','🩻','🦷','🩹','😷','🫀','🧬','⚕️','🏃','🧪','🩼'] },
  { label: 'Shopping', emojis: ['👗','👟','👜','💎','🎁','🛍️','⌚','👒','💄','🕶️','👔','🧥','💍','🎀','👠','🛒'] },
  { label: 'Fun', emojis: ['🎮','🎬','🎵','🎭','⚽','🎯','🎲','🎸','🎟️','🏖️','🎡','🎠','🏄','🎳','🧩','🪂'] },
  { label: 'Bills', emojis: ['📱','💻','📺','📡','💧','🔌','🌐','📰','🖨️','☁️','📷','⌨️','🖥️','📠','🔋','🎙️'] },
  { label: 'Symbols', emojis: ['⭐','🔴','🟢','🔵','🟡','🟠','🟣','⚫','🔶','🔷','✅','❌','⚡','🔥','💥','🌈'] },
];

function EmojiPicker({ value, onChange }: { value: string; onChange: (e: string) => void }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div>
      <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">
        Emoji
      </label>
      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="flex items-center gap-2.5 px-3.5 py-2 rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-bg)] cursor-pointer text-2xl leading-none min-w-[120px]"
        >
          <span>{value || '—'}</span>
          <span className="text-xs text-[var(--color-text-muted)] ml-auto">Pick ▾</span>
        </button>

        {open && (
          <div className="absolute top-full left-0 z-[100] bg-[var(--color-surface-elevated,var(--color-surface))] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-[var(--shadow-lg)] w-[300px] mt-1">
            {/* Tabs */}
            <div className="flex border-b border-[var(--color-border)] overflow-x-auto px-2 pt-1">
              {EMOJI_GROUPS.map((g, i) => (
                <button
                  key={g.label}
                  type="button"
                  onClick={() => setTab(i)}
                  className="bg-none border-none cursor-pointer px-2 py-1 text-[0.6875rem] whitespace-nowrap shrink-0"
                  style={{
                    fontWeight: tab === i ? 700 : 400,
                    color: tab === i ? 'var(--color-accent)' : 'var(--color-text-muted)',
                    borderBottom: tab === i ? '2px solid var(--color-accent)' : '2px solid transparent',
                  }}
                >
                  {g.label}
                </button>
              ))}
            </div>
            {/* Emoji grid */}
            <div className="p-2 grid grid-cols-8 gap-0.5">
              {EMOJI_GROUPS[tab].emojis.map((em) => (
                <button
                  key={em}
                  type="button"
                  onClick={() => { onChange(em); setOpen(false); }}
                  className="border-none cursor-pointer rounded-[var(--radius-sm)] text-xl p-1 leading-none text-center transition-[background] duration-100"
                  style={{ background: value === em ? 'var(--color-accent-light)' : 'none' }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = value === em ? 'var(--color-accent-light)' : 'transparent')}
                  title={em}
                >
                  {em}
                </button>
              ))}
            </div>
            {/* Manual input for custom */}
            <div className="border-t border-[var(--color-border)] p-2 flex gap-2 items-center">
              <span className="text-xs text-[var(--color-text-muted)] shrink-0">Custom:</span>
              <input
                value={value}
                onChange={(e) => onChange(e.target.value.slice(0, 2))}
                placeholder="✏️"
                maxLength={2}
                className="flex-1 border border-[var(--color-border)] rounded-[var(--radius-sm)] px-2 py-1 text-base bg-[var(--color-bg)] text-[var(--color-text)] outline-none"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Section: Categories ──────────────────────────────────────────────────────

interface CategoryModalState {
  mode: 'add' | 'edit';
  category?: Category;
}

// ─── Bucket badge colours ─────────────────────────────────────────────────────

type BucketType = 'needs' | 'wants' | 'savings' | 'uncategorized';

const BUCKET_COLORS: Record<BucketType, { bg: string; text: string; label: string }> = {
  needs:          { bg: '#dbeafe', text: '#1d4ed8', label: 'Needs' },
  wants:          { bg: '#ffedd5', text: '#c2410c', label: 'Wants' },
  savings:        { bg: '#dcfce7', text: '#15803d', label: 'Savings' },
  uncategorized:  { bg: '#f1f5f9', text: '#64748b', label: 'Unset' },
};

interface CategoryBucket {
  id: string;
  name: string;
  emoji: string | null;
  bucketType: string;
}

function CategoriesSection() {
  const queryClient = useQueryClient();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [modal, setModal] = useState<CategoryModalState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  // Track which category has the bucket dropdown open
  const [editingBucket, setEditingBucket] = useState<string | null>(null);

  // Modal form state
  const [catName, setCatName] = useState('');
  const [catEmoji, setCatEmoji] = useState('');
  const [catGroup, setCatGroup] = useState('');
  const [catError, setCatError] = useState('');

  const { data: rawCategories, isLoading } = useQuery<Category[]>({
    queryKey: ['settings', 'categories'],
    queryFn: () => api.get('/settings/categories').then((r) => r.data),
  });

  // Fetch bucket assignments
  const { data: buckets } = useQuery<CategoryBucket[]>({
    queryKey: ['wealth', 'category-buckets'],
    queryFn: () => api.get('/wealth/category-buckets').then((r) => r.data),
  });

  const bucketMap = new Map<string, BucketType>(
    (buckets ?? []).map((b) => [b.id, (b.bucketType as BucketType) ?? 'uncategorized'])
  );

  // Update a single bucket
  const updateBucketMutation = useMutation({
    mutationFn: ({ categoryId, bucketType }: { categoryId: string; bucketType: BucketType }) =>
      api.put('/wealth/category-buckets', { categoryId, bucketType }),
    onMutate: async ({ categoryId, bucketType }) => {
      await queryClient.cancelQueries({ queryKey: ['wealth', 'category-buckets'] });
      const prev = queryClient.getQueryData<CategoryBucket[]>(['wealth', 'category-buckets']);
      queryClient.setQueryData<CategoryBucket[]>(['wealth', 'category-buckets'], (old) =>
        (old ?? []).map((b) => (b.id === categoryId ? { ...b, bucketType } : b))
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['wealth', 'category-buckets'], ctx.prev);
      notify.error('Failed to update bucket');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['wealth', 'category-buckets'] });
      queryClient.invalidateQueries({ queryKey: ['wealth', 'analysis'] });
      setEditingBucket(null);
    },
  });

  // Toggle tax deductible on a category
  const toggleTaxMutation = useMutation({
    mutationFn: ({ categoryId, isTaxDeductible }: { categoryId: string; isTaxDeductible: boolean }) =>
      api.put(`/settings/categories/${categoryId}`, { isTaxDeductible }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'categories'] });
    },
    onError: () => {
      notify.error('Failed to update tax setting');
    },
  });

  // Reset all buckets to defaults
  const resetBucketsMutation = useMutation({
    mutationFn: () => api.post('/wealth/category-buckets/reset'),
    onSuccess: () => {
      notify.success('Buckets reset to defaults');
      queryClient.invalidateQueries({ queryKey: ['wealth', 'category-buckets'] });
      queryClient.invalidateQueries({ queryKey: ['wealth', 'analysis'] });
    },
    onError: () => notify.error('Failed to reset buckets'),
  });

  const data: { groups: CategoryGroup[] } | undefined = rawCategories
    ? {
        groups: rawCategories.reduce((acc, cat) => {
          const groupId = cat.group?.id ?? null;
          const groupName = cat.group?.name ?? 'Ungrouped';
          const existing = acc.find((g) => g.id === groupId);
          if (existing) {
            existing.categories.push(cat);
          } else {
            acc.push({ id: groupId, name: groupName, categories: [cat] });
          }
          return acc;
        }, [] as CategoryGroup[]),
      }
    : undefined;

  function openAdd(group?: string) {
    setCatName('');
    setCatEmoji('');
    setCatGroup(group ?? '');
    setCatError('');
    setModal({ mode: 'add' });
  }

  function openEdit(cat: Category) {
    setCatName(cat.name);
    setCatEmoji(cat.emoji ?? '');
    setCatGroup(cat.group?.name ?? '');
    setCatError('');
    setModal({ mode: 'edit', category: cat });
  }

  function closeModal() {
    setModal(null);
    setCatError('');
  }

  const createMutation = useMutation({
    mutationFn: () => {
      const resolvedGroupId = data?.groups.find((g) => g.name === catGroup)?.id ?? null;
      return api.post('/settings/categories', { name: catName, emoji: catEmoji, groupId: resolvedGroupId });
    },
    onSuccess: () => {
      notify.success('Category created');
      queryClient.invalidateQueries({ queryKey: ['settings', 'categories'] });
      closeModal();
    },
    onError: () => {
      setCatError('Failed to create category.');
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      const resolvedGroupId = data?.groups.find((g) => g.name === catGroup)?.id ?? null;
      return api.put(`/settings/categories/${modal?.category?.id}`, { name: catName, emoji: catEmoji, groupId: resolvedGroupId });
    },
    onSuccess: () => {
      notify.success('Category updated');
      queryClient.invalidateQueries({ queryKey: ['settings', 'categories'] });
      closeModal();
    },
    onError: () => {
      setCatError('Failed to update category.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/settings/categories/${id}`),
    onSuccess: () => {
      notify.success('Category deleted');
      queryClient.invalidateQueries({ queryKey: ['settings', 'categories'] });
      setDeleteTarget(null);
    },
    onError: (err: any) => {
      const status = err?.response?.status;
      if (status === 400) {
        notify.error('Category is in use by transactions');
      } else {
        notify.error('Failed to delete category');
      }
      setDeleteTarget(null);
    },
  });

  function handleSave() {
    setCatError('');
    if (!catName.trim()) { setCatError('Name is required.'); return; }
    if (!catGroup.trim()) { setCatError('Group is required.'); return; }
    if (modal?.mode === 'edit') {
      updateMutation.mutate();
    } else {
      createMutation.mutate();
    }
  }

  const groupOptions =
    data?.groups.map((g) => ({ value: g.name, label: g.name })) ?? [];

  if (isLoading) {
    return (
      <div>
        <SectionHeader title="Categories" description="Manage transaction categories." />
        <div className="text-[var(--color-text-muted)] text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
        <SectionHeader title="Categories" description="Manage transaction categories and 50/30/20 buckets." inline />
        <div className="flex gap-2 items-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => resetBucketsMutation.mutate()}
            loading={resetBucketsMutation.isPending}
            className="text-[var(--color-text-muted)] text-[0.8125rem]"
          >
            Reset buckets to defaults
          </Button>
          <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={() => openAdd()}>
            Add category
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2 mt-5">
        {(data?.groups ?? []).map((group) => {
          const isCollapsed = collapsed[group.name];
          return (
            <Card key={group.name} padding="none" className="overflow-hidden">
              {/* Group header */}
              <button
                onClick={() => setCollapsed((prev) => ({ ...prev, [group.name]: !isCollapsed }))}
                className="flex items-center gap-2 w-full px-4 py-3 bg-none border-none cursor-pointer text-left"
                style={{ borderBottom: isCollapsed ? 'none' : '1px solid var(--color-border)' }}
              >
                {isCollapsed ? <ChevronRight size={14} className="text-[var(--color-text-muted)]" /> : <ChevronDown size={14} className="text-[var(--color-text-muted)]" />}
                <span className="text-sm font-semibold text-[var(--color-text)]">
                  {group.name}
                </span>
                <span className="text-xs text-[var(--color-text-muted)] ml-1">
                  ({group.categories.length})
                </span>
              </button>

              {/* Category rows */}
              {!isCollapsed && (
                <div>
                  {group.categories.map((cat, idx) => {
                    const bucketKey = (bucketMap.get(cat.id) ?? 'uncategorized') as BucketType;
                    const bucketMeta = BUCKET_COLORS[bucketKey];
                    const isEditingThisBucket = editingBucket === cat.id;
                    return (
                    <div
                      key={cat.id}
                      className="flex items-center gap-3 pl-8 pr-4 py-2.5"
                      style={{ borderBottom: idx < group.categories.length - 1 ? '1px solid var(--color-border)' : 'none' }}
                    >
                      <span className="text-[1.625rem] leading-none w-7 text-center shrink-0">
                        {cat.emoji || '·'}
                      </span>
                      <span className="flex-1 text-sm text-[var(--color-text)]">
                        {cat.name}
                      </span>
                      {/* Bucket badge / dropdown */}
                      {isEditingThisBucket ? (
                        <select
                          autoFocus
                          value={bucketKey}
                          onChange={(e) => {
                            updateBucketMutation.mutate({
                              categoryId: cat.id,
                              bucketType: e.target.value as BucketType,
                            });
                          }}
                          onBlur={() => setEditingBucket(null)}
                          className="text-xs px-1.5 py-0.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] cursor-pointer"
                        >
                          <option value="needs">Needs</option>
                          <option value="wants">Wants</option>
                          <option value="savings">Savings</option>
                          <option value="uncategorized">Unset</option>
                        </select>
                      ) : (
                        <button
                          onClick={() => setEditingBucket(cat.id)}
                          title="Click to change bucket"
                          className="text-[0.6875rem] font-semibold py-[0.1875rem] px-2 rounded-full border-none cursor-pointer shrink-0 tracking-[0.01em]"
                          style={{ background: bucketMeta.bg, color: bucketMeta.text }}
                        >
                          {bucketMeta.label}
                        </button>
                      )}
                      {/* Tax deductible toggle */}
                      <button
                        onClick={() => toggleTaxMutation.mutate({ categoryId: cat.id, isTaxDeductible: !cat.isTaxDeductible })}
                        title={cat.isTaxDeductible ? 'Tax deductible (click to remove)' : 'Mark as tax deductible'}
                        className="flex items-center gap-1 py-[0.1875rem] px-[0.4375rem] rounded-full text-[0.6875rem] font-semibold border cursor-pointer shrink-0"
                        style={{
                          borderColor: cat.isTaxDeductible ? 'var(--color-success)' : 'var(--color-border)',
                          background: cat.isTaxDeductible ? 'color-mix(in srgb, var(--color-success) 12%, transparent)' : 'transparent',
                          color: cat.isTaxDeductible ? 'var(--color-success)' : 'var(--color-text-secondary)',
                          opacity: toggleTaxMutation.isPending ? 0.5 : 1,
                        }}
                      >
                        <Receipt size={10} />
                        Tax
                      </button>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Pencil size={13} />}
                        onClick={() => openEdit(cat)}
                        className="text-[var(--color-text-secondary)]"
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Trash2 size={13} />}
                        onClick={() => setDeleteTarget(cat)}
                        className="text-[var(--color-danger)]"
                      >
                        Delete
                      </Button>
                    </div>
                    );
                  })}
                  {/* Add to group */}
                  <button
                    onClick={() => openAdd(group.name)}
                    className="flex items-center gap-2 w-full pl-8 pr-4 py-2.5 bg-none border-none cursor-pointer text-[0.8125rem] text-[var(--color-accent)] font-medium"
                  >
                    <Plus size={13} />
                    Add category to group
                  </button>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Add / Edit modal */}
      <Modal
        open={!!modal}
        onClose={closeModal}
        title={modal?.mode === 'edit' ? 'Edit Category' : 'Add Category'}
        size="sm"
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Name"
            value={catName}
            onChange={(e) => setCatName(e.target.value)}
            placeholder="e.g. Groceries"
          />
          <EmojiPicker value={catEmoji} onChange={setCatEmoji} />
          <Input
            label="Group"
            value={catGroup}
            onChange={(e) => setCatGroup(e.target.value)}
            placeholder="e.g. Food & Dining"
            hint={groupOptions.length > 0 ? `Existing groups: ${groupOptions.map((g) => g.label).join(', ')}` : undefined}
            error={catError || undefined}
          />
          <ModalFooter>
            <Button variant="ghost" onClick={closeModal}>Cancel</Button>
            <Button
              variant="primary"
              loading={createMutation.isPending || updateMutation.isPending}
              onClick={handleSave}
            >
              {modal?.mode === 'edit' ? 'Save' : 'Create'}
            </Button>
          </ModalFooter>
        </div>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete Category"
        size="sm"
      >
        <p className="text-sm text-[var(--color-text)]">
          Delete <strong>{deleteTarget?.emoji} {deleteTarget?.name}</strong>? This cannot be undone.
        </p>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button
            variant="danger"
            loading={deleteMutation.isPending}
            onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
          >
            Delete
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

// ─── Section: Tags ────────────────────────────────────────────────────────────

interface TagData {
  id: string;
  name: string;
  color: string;
  transactionCount: number;
}

const TAG_PRESET_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6'];

interface TagModalState {
  mode: 'add' | 'edit';
  tag?: TagData;
}

function TagsSection() {
  const queryClient = useQueryClient();
  const [modal, setModal] = useState<TagModalState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TagData | null>(null);
  const [tagName, setTagName] = useState('');
  const [tagColor, setTagColor] = useState(TAG_PRESET_COLORS[4]);
  const [tagError, setTagError] = useState('');

  const { data: tags, isLoading } = useQuery<TagData[]>({
    queryKey: ['settings', 'tags'],
    queryFn: () => api.get('/settings/tags').then((r) => r.data),
  });

  function openAdd() {
    setTagName('');
    setTagColor(TAG_PRESET_COLORS[4]);
    setTagError('');
    setModal({ mode: 'add' });
  }

  function openEdit(tag: TagData) {
    setTagName(tag.name);
    setTagColor(tag.color);
    setTagError('');
    setModal({ mode: 'edit', tag });
  }

  function closeModal() {
    setModal(null);
    setTagError('');
  }

  const createMutation = useMutation({
    mutationFn: () => api.post('/settings/tags', { name: tagName, color: tagColor }),
    onSuccess: () => {
      notify.success('Tag created');
      queryClient.invalidateQueries({ queryKey: ['settings', 'tags'] });
      closeModal();
    },
    onError: () => setTagError('Failed to create tag.'),
  });

  const updateMutation = useMutation({
    mutationFn: () => api.put(`/settings/tags/${modal?.tag?.id}`, { name: tagName, color: tagColor }),
    onSuccess: () => {
      notify.success('Tag updated');
      queryClient.invalidateQueries({ queryKey: ['settings', 'tags'] });
      closeModal();
    },
    onError: () => setTagError('Failed to update tag.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/settings/tags/${id}`),
    onSuccess: () => {
      notify.success('Tag deleted');
      queryClient.invalidateQueries({ queryKey: ['settings', 'tags'] });
      setDeleteTarget(null);
    },
    onError: () => {
      notify.error('Failed to delete tag');
      setDeleteTarget(null);
    },
  });

  function handleSave() {
    setTagError('');
    if (!tagName.trim()) { setTagError('Name is required.'); return; }
    if (modal?.mode === 'edit') updateMutation.mutate();
    else createMutation.mutate();
  }

  if (isLoading) {
    return (
      <div>
        <SectionHeader title="Tags" description="Manage transaction tags." />
        <div className="text-[var(--color-text-muted)] text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <SectionHeader title="Tags" description="Manage transaction tags." inline />
        <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={openAdd}>
          New Tag
        </Button>
      </div>

      <Card padding="none">
        {(!tags || tags.length === 0) ? (
          <div className="p-8 text-center text-[var(--color-text-muted)] text-sm">
            No tags yet. Create one to start organizing transactions.
          </div>
        ) : (
          tags.map((tag, idx) => (
            <div
              key={tag.id}
              className="flex items-center gap-3 px-4 py-2.5"
              style={{ borderBottom: idx < tags.length - 1 ? '1px solid var(--color-border)' : 'none' }}
            >
              {/* Color swatch */}
              <div
                className="w-4 h-4 rounded-[var(--radius-full)] shrink-0"
                style={{ backgroundColor: tag.color }}
              />
              {/* Name */}
              <span className="flex-1 text-sm text-[var(--color-text)] font-medium">
                {tag.name}
              </span>
              {/* Transaction count badge */}
              <span className="text-xs font-semibold text-[var(--color-text-muted)] bg-[var(--color-surface-hover)] rounded-[var(--radius-full)] px-2 py-0.5">
                {tag.transactionCount} {tag.transactionCount === 1 ? 'tx' : 'txs'}
              </span>
              <Button
                variant="ghost"
                size="sm"
                icon={<Pencil size={13} />}
                onClick={() => openEdit(tag)}
                className="text-[var(--color-text-secondary)]"
              >
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon={<Trash2 size={13} />}
                onClick={() => setDeleteTarget(tag)}
                className="text-[var(--color-danger)]"
              >
                Delete
              </Button>
            </div>
          ))
        )}
      </Card>

      {/* Add / Edit modal */}
      <Modal
        open={!!modal}
        onClose={closeModal}
        title={modal?.mode === 'edit' ? 'Edit Tag' : 'New Tag'}
        size="sm"
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Name"
            value={tagName}
            onChange={(e) => setTagName(e.target.value)}
            placeholder="e.g. Business"
            error={tagError || undefined}
          />
          <div>
            <label className="block text-sm font-medium text-[var(--color-text)] mb-2">
              Color
            </label>
            <div className="flex gap-2">
              {TAG_PRESET_COLORS.map((c) => (
                <div
                  key={c}
                  onClick={() => setTagColor(c)}
                  className="w-7 h-7 rounded-[var(--radius-full)] cursor-pointer transition-[outline] duration-100"
                  style={{
                    backgroundColor: c,
                    outline: tagColor === c ? `3px solid ${c}` : '3px solid transparent',
                    outlineOffset: 2,
                  }}
                />
              ))}
            </div>
          </div>
          <ModalFooter>
            <Button variant="ghost" onClick={closeModal}>Cancel</Button>
            <Button
              variant="primary"
              loading={createMutation.isPending || updateMutation.isPending}
              onClick={handleSave}
            >
              {modal?.mode === 'edit' ? 'Save' : 'Create'}
            </Button>
          </ModalFooter>
        </div>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete Tag"
        size="sm"
      >
        <p className="text-sm text-[var(--color-text)]">
          This tag will be removed from all transactions. Are you sure you want to delete <strong>{deleteTarget?.name}</strong>?
        </p>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button
            variant="danger"
            loading={deleteMutation.isPending}
            onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
          >
            Delete
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

// ─── Section: Merchants ───────────────────────────────────────────────────────

interface MerchantItem {
  id: string;
  name: string;
  displayName: string;
  logoUrl: string | null;
  transactionCount: number;
}

function MerchantsSection() {
  const queryClient = useQueryClient();
  const [order, setOrder] = useState<'TRANSACTION_COUNT' | 'NAME'>('TRANSACTION_COUNT');
  const [search, setSearch] = useState('');
  const [showCount, setShowCount] = useState(50);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<MerchantItem | null>(null);

  const { data: merchants, isLoading } = useQuery<MerchantItem[]>({
    queryKey: ['settings', 'merchants', order],
    queryFn: () => api.get(`/settings/merchants?order=${order}`).then(r => r.data),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, displayName }: { id: string; displayName: string }) =>
      api.put(`/settings/merchants/${id}`, { displayName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'merchants'] });
      setEditingId(null);
      notify.success('Merchant updated');
    },
    onError: (err: any) => notify.error('Failed to update merchant', err?.response?.data?.error ?? 'Please try again.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/settings/merchants/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'merchants'] });
      setDeleteTarget(null);
      notify.success('Merchant removed');
    },
    onError: () => notify.error('Failed to delete merchant'),
  });

  const filtered = (merchants ?? []).filter(m =>
    m.displayName.toLowerCase().includes(search.toLowerCase()) ||
    m.name.toLowerCase().includes(search.toLowerCase())
  );
  const visible = filtered.slice(0, showCount);

  function startEdit(m: MerchantItem) {
    setEditingId(m.id);
    setEditValue(m.displayName);
  }

  function commitEdit(id: string) {
    const trimmed = editValue.trim();
    if (!trimmed) return;
    updateMutation.mutate({ id, displayName: trimmed });
  }

  function handleEditKeyDown(e: React.KeyboardEvent, id: string) {
    if (e.key === 'Enter') commitEdit(id);
    if (e.key === 'Escape') setEditingId(null);
  }

  return (
    <div>
      <SectionHeader
        title="Merchants"
        description="View and edit how merchants appear throughout Kuber."
      />

      {/* Controls */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Input
          placeholder="Search merchants..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ maxWidth: 260 }}
        />
        <div className="flex gap-1.5">
          <button
            onClick={() => setOrder('TRANSACTION_COUNT')}
            className="px-3 py-1.5 rounded-[var(--radius-sm)] text-[0.8125rem] font-semibold border border-[var(--color-border)] cursor-pointer"
            style={{
              backgroundColor: order === 'TRANSACTION_COUNT' ? 'var(--color-accent)' : 'var(--color-surface)',
              color: order === 'TRANSACTION_COUNT' ? '#fff' : 'var(--color-text-secondary)',
            }}
          >
            By transaction count
          </button>
          <button
            onClick={() => setOrder('NAME')}
            className="px-3 py-1.5 rounded-[var(--radius-sm)] text-[0.8125rem] font-semibold border border-[var(--color-border)] cursor-pointer"
            style={{
              backgroundColor: order === 'NAME' ? 'var(--color-accent)' : 'var(--color-surface)',
              color: order === 'NAME' ? '#fff' : 'var(--color-text-secondary)',
            }}
          >
            By name
          </button>
        </div>
      </div>

      <Card padding="none">
        {isLoading ? (
          <div className="p-8 text-center text-[var(--color-text-muted)] text-sm">
            Loading merchants...
          </div>
        ) : visible.length === 0 ? (
          <div className="p-8 text-center text-[var(--color-text-muted)] text-sm">
            {search ? 'No merchants match your search.' : 'No merchants yet.'}
          </div>
        ) : (
          visible.map((m, idx) => (
            <div
              key={m.id}
              className="flex items-center gap-3 px-4 py-2.5"
              style={{ borderBottom: idx < visible.length - 1 ? '1px solid var(--color-border)' : 'none' }}
            >
              {/* Name or inline editor */}
              {editingId === m.id ? (
                <input
                  autoFocus
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  onKeyDown={e => handleEditKeyDown(e, m.id)}
                  onBlur={() => commitEdit(m.id)}
                  className="flex-1 text-sm font-medium px-2 py-1 border border-[var(--color-accent)] rounded-[var(--radius-sm)] bg-[var(--color-surface)] text-[var(--color-text)] outline-none"
                />
              ) : (
                <span className="flex-1 text-sm text-[var(--color-text)] font-medium">
                  {m.displayName}
                  {m.displayName !== m.name && (
                    <span className="ml-1.5 text-xs text-[var(--color-text-muted)]">
                      ({m.name})
                    </span>
                  )}
                </span>
              )}

              {/* Transaction count badge */}
              <span className="text-xs font-semibold text-[var(--color-text-muted)] bg-[var(--color-surface-hover)] rounded-[var(--radius-full)] px-2 py-0.5 shrink-0">
                {m.transactionCount} {m.transactionCount === 1 ? 'tx' : 'txs'}
              </span>

              <Button
                variant="ghost"
                size="sm"
                icon={<Pencil size={13} />}
                onClick={() => startEdit(m)}
                className="text-[var(--color-text-secondary)] shrink-0"
              >
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon={<Trash2 size={13} />}
                onClick={() => setDeleteTarget(m)}
                className="text-[var(--color-danger)] shrink-0"
              >
                Delete
              </Button>
            </div>
          ))
        )}
      </Card>

      {/* Show more */}
      {filtered.length > showCount && (
        <div className="mt-3 text-center">
          <Button variant="secondary" size="sm" onClick={() => setShowCount(c => c + 50)}>
            Show more ({filtered.length - showCount} remaining)
          </Button>
        </div>
      )}

      {/* Delete confirmation modal */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Remove Merchant"
        size="sm"
      >
        <p className="text-sm text-[var(--color-text)]">
          Remove this merchant? Transactions will become unlinked.{' '}
          Are you sure you want to remove <strong>{deleteTarget?.displayName}</strong>?
        </p>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button
            variant="danger"
            loading={deleteMutation.isPending}
            onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
          >
            Remove
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

// ─── Section: Integrations ────────────────────────────────────────────────────

interface AiConfigResponse {
  provider: string;
  model: string;
  baseUrl: string | null;
  hasApiKey: boolean;
  updatedAt: string | null;
}

const PROVIDER_DEFAULTS: Record<string, { model: string; label: string; keyHint: string }> = {
  anthropic:  { model: 'claude-sonnet-4-6', label: 'Claude (Anthropic)', keyHint: 'console.anthropic.com' },
  openai:     { model: 'gpt-4o',            label: 'OpenAI (GPT)',        keyHint: 'platform.openai.com' },
  gemini:     { model: 'gemini-1.5-pro',    label: 'Google Gemini',       keyHint: 'aistudio.google.com' },
  openrouter: { model: 'openai/gpt-4o',     label: 'OpenRouter',          keyHint: 'openrouter.ai/keys' },
  none:       { model: '',                  label: 'None (disabled)',      keyHint: '' },
};

const PROVIDER_OPTIONS = [
  { value: 'none',       label: 'None (disabled)' },
  { value: 'anthropic',  label: 'Claude (Anthropic)' },
  { value: 'openai',     label: 'OpenAI (GPT)' },
  { value: 'gemini',     label: 'Google Gemini' },
  { value: 'openrouter', label: 'OpenRouter' },
];

function AiAdvisorCard() {
  const queryClient = useQueryClient();
  const [provider, setProvider] = useState('none');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [testResult, setTestResult] = useState<{ valid: boolean; error?: string } | null>(null);
  const [initialized, setInitialized] = useState(false);

  const { data: config } = useQuery<AiConfigResponse>({
    queryKey: ['settings', 'ai-config'],
    queryFn: () => api.get('/settings/ai-config').then((r) => r.data as AiConfigResponse),
  });

  // Seed form from fetched config once
  useEffect(() => {
    if (config && !initialized) {
      setProvider(config.provider);
      setModel(config.model || PROVIDER_DEFAULTS[config.provider]?.model || '');
      setBaseUrl(config.baseUrl ?? '');
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
      }).then((r) => r.data as AiConfigResponse),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'ai-config'] });
      setApiKey('');
      setTestResult(null);
      notify.success('AI configuration saved');
    },
    onError: (err: any) => notify.error('Failed to save', err?.response?.data?.error ?? 'Unknown error'),
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
    setBaseUrl('');
    setTestResult(null);
  }

  const isConfigured = config && config.provider !== 'none' && config.hasApiKey;
  const keyHint = PROVIDER_DEFAULTS[provider]?.keyHint ?? '';

  return (
    <Card padding="lg">
      {/* Header + status */}
      <div className="flex items-center gap-2 mb-2">
        <Bot size={18} color="var(--color-primary)" />
        <span className="font-semibold text-[var(--color-text)]">AI Advisor</span>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <span
          className="w-2 h-2 rounded-full inline-block shrink-0"
          style={{ backgroundColor: isConfigured ? 'var(--color-success, #22c55e)' : 'var(--color-text-muted)' }}
        />
        <span className="text-[0.8125rem] text-[var(--color-text-secondary)]">
          {isConfigured
            ? `Configured — ${PROVIDER_DEFAULTS[config.provider]?.label ?? config.provider} (${config.model})`
            : 'Not configured'}
        </span>
      </div>

      <div className="flex flex-col gap-3.5">
        {/* Provider */}
        <div>
          <label className="text-[0.8125rem] font-medium text-[var(--color-text)] block mb-1.5">
            Provider
          </label>
          <Select
            value={provider}
            onChange={(e) => handleProviderChange(e.target.value)}
            options={PROVIDER_OPTIONS}
          />
        </div>

        {/* Model */}
        {provider !== 'none' && (
          <div>
            <label className="text-[0.8125rem] font-medium text-[var(--color-text)] block mb-1.5">
              Model
            </label>
            <Input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={PROVIDER_DEFAULTS[provider]?.model ?? 'Enter model name'}
            />
          </div>
        )}

        {/* API Key */}
        {provider !== 'none' && (
          <div>
            <label className="text-[0.8125rem] font-medium text-[var(--color-text)] block mb-1.5">
              API Key
              {keyHint && (
                <span className="font-normal text-[var(--color-text-muted)] ml-2">
                  — get yours at {keyHint}
                </span>
              )}
            </label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={config?.hasApiKey && config.provider === provider ? '••••••••' : 'Enter API key'}
            />
          </div>
        )}

        {/* Base URL (OpenRouter only) */}
        {provider === 'openrouter' && (
          <div>
            <label className="text-[0.8125rem] font-medium text-[var(--color-text)] block mb-1.5">
              API Base URL
            </label>
            <Input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://openrouter.ai/api/v1"
            />
          </div>
        )}

        {/* Test result */}
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

        {/* Actions */}
        <div className="flex gap-3 mt-1">
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

function IntegrationsSection() {
  const testEmailMutation = useMutation({
    mutationFn: () => api.post('/settings/email/test'),
    onSuccess: () => notify.success('Test email sent', 'Check your inbox.'),
    onError: (err: any) => notify.error('Failed to send test email', err?.response?.data?.error ?? 'Check server SMTP configuration.'),
  });

  return (
    <div>
      <SectionHeader title="Integrations" description="Configure external services used by Kuber." />

      <div className="flex flex-col gap-6" style={{ maxWidth: 560 }}>
        {/* AI Advisor */}
        <AiAdvisorCard />

        {/* Email / IMAP Connector */}
        <EmailConnectorSection />

        {/* SMTP */}
        <Card padding="lg">
          <div className="mb-3">
            <div className="font-semibold text-[var(--color-text)] mb-1">
              Email (SMTP)
            </div>
            <p className="text-sm text-[var(--color-text-secondary)] m-0">
              Kuber uses SMTP for password reset emails and account notifications. Configure SMTP via environment variables on your server:
            </p>
          </div>

          <div className="bg-[var(--color-surface-hover)] rounded-[var(--radius-md)] px-4 py-3.5 font-mono text-[0.8125rem] text-[var(--color-text-secondary)] mb-4 leading-[1.6]">
            <div>SMTP_HOST=smtp.gmail.com</div>
            <div>SMTP_PORT=587</div>
            <div>SMTP_USER=you@gmail.com</div>
            <div>SMTP_PASS=your-app-password</div>
            <div>SMTP_FROM="Kuber &lt;noreply@yourdomain.com&gt;"</div>
          </div>

          <Button
            variant="secondary"
            size="sm"
            loading={testEmailMutation.isPending}
            onClick={() => testEmailMutation.mutate()}
          >
            Send test email to my address
          </Button>
        </Card>
      </div>
    </div>
  );
}

// ─── Section: Report Digest ───────────────────────────────────────────────────

interface ReportSchedule {
  householdId: string;
  frequency: 'weekly' | 'monthly';
  enabled: boolean;
  lastSentAt: string | null;
}

function ReportDigestSection() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<ReportSchedule>({
    queryKey: ['settings', 'report-schedule'],
    queryFn: () => api.get('/settings/report-schedule').then((r) => r.data),
  });

  const mutation = useMutation({
    mutationFn: (body: { frequency: 'weekly' | 'monthly'; enabled: boolean }) =>
      api.put('/settings/report-schedule', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'report-schedule'] });
      notify.success('Report digest settings saved');
    },
    onError: () => notify.error('Failed to save report digest settings'),
  });

  const enabled = data?.enabled ?? false;
  const frequency = data?.frequency ?? 'weekly';

  function handleToggle(newEnabled: boolean) {
    mutation.mutate({ frequency, enabled: newEnabled });
  }

  function handleFrequency(newFreq: 'weekly' | 'monthly') {
    mutation.mutate({ frequency: newFreq, enabled });
  }

  function lastSentLabel(): string | null {
    if (!data?.lastSentAt) return null;
    const ms = Date.now() - new Date(data.lastSentAt).getTime();
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));
    if (days === 0) return 'today';
    if (days === 1) return '1 day ago';
    return `${days} days ago`;
  }

  const lastSent = lastSentLabel();

  return (
    <div>
      <SectionHeader
        title="Report Digest"
        description="Receive a periodic email summary of your finances."
      />

      <div style={{ maxWidth: 560 }}>
        <Card padding="lg">
          {isLoading ? (
            <Skeleton height={120} />
          ) : (
            <div className="flex flex-col gap-5">
              {/* Enable toggle */}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="font-semibold text-[var(--color-text)] mb-1">
                    Enable digest emails
                  </div>
                  <p className="text-sm text-[var(--color-text-secondary)] m-0">
                    You'll receive a summary of your finances including net worth change,
                    top spending categories, budget status, and upcoming bills.
                  </p>
                </div>
                <Checkbox
                  checked={enabled}
                  onChange={(e) => handleToggle(e.target.checked)}
                  disabled={mutation.isPending}
                />
              </div>

              {/* Frequency selector — only shown when enabled */}
              {enabled && (
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text)] mb-2">
                    Frequency
                  </label>
                  <Select
                    value={frequency}
                    options={[
                      { value: 'weekly', label: 'Weekly (every Monday)' },
                      { value: 'monthly', label: 'Monthly (1st of each month)' },
                    ]}
                    onChange={(e) => handleFrequency(e.target.value as 'weekly' | 'monthly')}
                    disabled={mutation.isPending}
                  />
                </div>
              )}

              {/* Last sent info */}
              {lastSent && (
                <div className="text-[0.8125rem] text-[var(--color-text-secondary)] border-t border-[var(--color-border)] pt-3">
                  Last sent: {lastSent}
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

import RecentOperationsSection from './components/RecentOperationsSection';

// ─── Section: Data ────────────────────────────────────────────────────────────

async function downloadFile(url: string, filename: string) {
  try {
    const response = await api.get(url, { responseType: 'blob' });
    const blob = new Blob([response.data], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  } catch {
    notify.error('Download failed', 'Could not export the file. Please try again.');
  }
}

function DataSection() {
  const [cleanStartDate, setCleanStartDate] = useState('');
  const [deleteHistoryModalOpen, setDeleteHistoryModalOpen] = useState(false);
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: (date: string) =>
      api.delete(`/transactions/before?date=${encodeURIComponent(date)}`).then((r) => r.data as { count: number }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      setDeleteHistoryModalOpen(false);
      setCleanStartDate('');
      notify.success(`${data.count} transaction${data.count !== 1 ? 's' : ''} deleted`);
    },
    onError: () => {
      setDeleteHistoryModalOpen(false);
      notify.error('Failed to delete transactions');
    },
  });

  function handleDeleteHistory() {
    deleteMutation.mutate(cleanStartDate);
  }

  return (
    <div>
      <SectionHeader title="Data" description="Export your data or manage transaction history." />

      <div className="flex flex-col gap-6" style={{ maxWidth: 560 }}>
        {/* Export */}
        <Card padding="lg">
          <div className="mb-4 font-semibold text-[var(--color-text)]">
            Export Data
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-[var(--color-text)]">Transactions</div>
                <div className="text-xs text-[var(--color-text-muted)]">Download all transactions as CSV</div>
              </div>
              <Button variant="secondary" size="sm" onClick={() => downloadFile('/transactions/export/csv', 'transactions.csv')}>
                Download CSV
              </Button>
            </div>
            <div className="h-px bg-[var(--color-border)]" />
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-[var(--color-text)]">Account Balances</div>
                <div className="text-xs text-[var(--color-text-muted)]">Download account balance history as CSV</div>
              </div>
              <Button variant="secondary" size="sm" onClick={() => downloadFile('/accounts/export/csv', 'account-balances.csv')}>
                Download CSV
              </Button>
            </div>
            <div className="h-px bg-[var(--color-border)]" />
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-[var(--color-text)]">All Data</div>
                <div className="text-xs text-[var(--color-text-muted)]">Export all your financial data as a multi-sheet Excel workbook</div>
              </div>
              <Button variant="secondary" size="sm" onClick={() => downloadFile('/settings/export', `kuber-export-${new Date().toISOString().split('T')[0]}.xlsx`)}>
                Export All
              </Button>
            </div>
          </div>
        </Card>

        {/* Recent Operations / Rollback */}
        <Card padding="lg">
          <RecentOperationsSection />
        </Card>

        {/* Delete history */}
        <Card padding="lg" className="border-[var(--color-warning)]">
          <div className="mb-2 font-semibold text-[var(--color-warning)]">
            Delete History
          </div>
          <p className="text-sm text-[var(--color-text-secondary)] mb-4">
            Set a clean start date — all transactions before this date will be permanently deleted.
          </p>
          <div className="flex gap-3 items-end">
            <Input
              label="Delete transactions before"
              type="date"
              value={cleanStartDate}
              onChange={(e) => setCleanStartDate(e.target.value)}
              style={{ maxWidth: 220 }}
            />
            <Button
              variant="outline"
              className="border-[var(--color-warning)] text-[var(--color-warning)] mb-0.5"
              disabled={!cleanStartDate}
              onClick={() => setDeleteHistoryModalOpen(true)}
            >
              Delete history
            </Button>
          </div>
        </Card>
      </div>

      {/* Confirm delete history modal */}
      <Modal
        open={deleteHistoryModalOpen}
        onClose={() => setDeleteHistoryModalOpen(false)}
        title="Delete Transaction History"
        description="This action is permanent and cannot be undone."
        size="sm"
      >
        <p className="text-sm text-[var(--color-text)]">
          All transactions before <strong>{cleanStartDate}</strong> will be permanently deleted.
        </p>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setDeleteHistoryModalOpen(false)}>Cancel</Button>
          <Button variant="danger" onClick={handleDeleteHistory} disabled={deleteMutation.isPending}>
            {deleteMutation.isPending ? 'Deleting…' : 'Delete history'}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

// ─── Section: Billing ─────────────────────────────────────────────────────────

// ─── Section: Webhooks ────────────────────────────────────────────────────────

const WEBHOOK_EVENTS = [
  'transaction.created',
  'transaction.updated',
  'transaction.deleted',
  'goal.created',
  'goal.updated',
] as const;

type WebhookEventType = typeof WEBHOOK_EVENTS[number];

interface WebhookItem {
  id: string;
  name: string;
  url: string;
  events: WebhookEventType[];
  secret?: string | null;
  isActive: boolean;
  createdAt: string;
}

const emptyWebhookForm = { name: '', url: '', events: [] as WebhookEventType[], secret: '', isActive: true };

function WebhooksSection() {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<WebhookItem | null>(null);
  const [form, setForm] = useState(emptyWebhookForm);
  const [showSecret, setShowSecret] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  const { data: webhooks = [], isLoading } = useQuery<WebhookItem[]>({
    queryKey: ['webhooks'],
    queryFn: () => api.get('/webhooks').then((r) => r.data),
  });

  const saveMutation = useMutation({
    mutationFn: (data: typeof emptyWebhookForm) =>
      editing
        ? api.put(`/webhooks/${editing.id}`, data).then((r) => r.data)
        : api.post('/webhooks', data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      setShowModal(false);
      setEditing(null);
      setForm(emptyWebhookForm);
      notify.success(editing ? 'Webhook updated' : 'Webhook created');
    },
    onError: (err: any) => notify.error(err?.response?.data?.error ?? 'Failed to save webhook'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/webhooks/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      notify.success('Webhook deleted');
    },
  });

  async function testWebhook(id: string) {
    setTestingId(id);
    try {
      const { data } = await api.post(`/webhooks/${id}/test`);
      notify.success(`Ping sent — server responded ${data.status}`);
    } catch (err: any) {
      notify.error(err?.response?.data?.error ?? 'Delivery failed');
    } finally {
      setTestingId(null);
    }
  }

  function openAdd() {
    setEditing(null);
    setForm(emptyWebhookForm);
    setShowSecret(false);
    setShowModal(true);
  }

  function openEdit(hook: WebhookItem) {
    setEditing(hook);
    setForm({ name: hook.name, url: hook.url, events: hook.events, secret: hook.secret ?? '', isActive: hook.isActive });
    setShowSecret(false);
    setShowModal(true);
  }

  function toggleEvent(ev: WebhookEventType) {
    setForm((f) => ({
      ...f,
      events: f.events.includes(ev) ? f.events.filter((e) => e !== ev) : [...f.events, ev],
    }));
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Webhooks"
        description="Send real-time HTTP POST notifications to external URLs when events occur in Kuber."
      />

      <Button variant="primary" icon={<Plus size={14} />} onClick={openAdd} style={{ alignSelf: 'flex-start' }}>
        Add Webhook
      </Button>

      {isLoading ? (
        <div className="flex flex-col gap-2">{[1,2].map((i) => <Skeleton key={i} height={56} />)}</div>
      ) : webhooks.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">No webhooks configured yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {webhooks.map((hook) => (
            <Card key={hook.id} padding="md">
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-[var(--color-text)]">{hook.name}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${hook.isActive ? 'bg-[var(--color-success-light,#f0fdf4)] text-[var(--color-success)]' : 'bg-[var(--color-surface-hover)] text-[var(--color-text-muted)]'}`}>
                      {hook.isActive ? 'Active' : 'Paused'}
                    </span>
                  </div>
                  <span className="text-xs text-[var(--color-text-muted)] truncate">{hook.url}</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {hook.events.map((ev) => (
                      <span key={ev} className="text-[0.6875rem] px-1.5 py-0.5 rounded bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)] border border-[var(--color-border)]">{ev}</span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => testWebhook(hook.id)} loading={testingId === hook.id}>Test</Button>
                  <Button variant="ghost" size="sm" icon={<Pencil size={13} />} onClick={() => openEdit(hook)} />
                  <Button variant="ghost" size="sm" icon={<Trash2 size={13} />} onClick={() => deleteMutation.mutate(hook.id)} />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={showModal} onClose={() => { setShowModal(false); setEditing(null); }} title={editing ? 'Edit Webhook' : 'Add Webhook'} size="md">
        <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(form); }}>
          <div className="flex flex-col gap-4 p-1">
            <Input label="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="My webhook" />
            <Input label="URL" value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} placeholder="https://example.com/hook" />
            <div>
              <label className="block text-sm font-medium text-[var(--color-text)] mb-2">Events</label>
              <div className="flex flex-wrap gap-2">
                {WEBHOOK_EVENTS.map((ev) => (
                  <button
                    key={ev}
                    type="button"
                    onClick={() => toggleEvent(ev)}
                    className="text-xs px-2.5 py-1 rounded-full border transition-colors"
                    style={{
                      background: form.events.includes(ev) ? 'var(--color-accent)' : 'var(--color-surface-hover)',
                      color: form.events.includes(ev) ? '#fff' : 'var(--color-text-secondary)',
                      borderColor: form.events.includes(ev) ? 'var(--color-accent)' : 'var(--color-border)',
                    }}
                  >
                    {ev}
                  </button>
                ))}
              </div>
            </div>
            <div className="relative">
              <Input
                label="Signing secret (optional)"
                type={showSecret ? 'text' : 'password'}
                value={form.secret}
                onChange={(e) => setForm((f) => ({ ...f, secret: e.target.value }))}
                placeholder="Leave blank to skip signature"
              />
              <button
                type="button"
                onClick={() => setShowSecret((s) => !s)}
                className="absolute right-2 top-8 text-[var(--color-text-muted)] bg-transparent border-none cursor-pointer"
              >
                {showSecret ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} className="accent-[var(--color-accent)]" />
              <span className="text-[var(--color-text)]">Active</span>
            </label>
          </div>
          <ModalFooter>
            <Button variant="ghost" type="button" onClick={() => { setShowModal(false); setEditing(null); }}>Cancel</Button>
            <Button variant="primary" type="submit" loading={saveMutation.isPending} disabled={!form.name || !form.url || form.events.length === 0}>
              {editing ? 'Save Changes' : 'Create Webhook'}
            </Button>
          </ModalFooter>
        </form>
      </Modal>
    </div>
  );
}

function BillingSection() {
  return (
    <div>
      <SectionHeader title="Billing" description="Manage your subscription." />

      <Card padding="lg" style={{ maxWidth: 400 }}>
        <div className="mb-1.5 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-[0.06em]">
          Current Plan
        </div>
        <div className="text-xl font-bold text-[var(--color-text)] mb-2">
          Kuber Free
        </div>
        <p className="text-sm text-[var(--color-text-secondary)] mb-5">
          Upgrade to Pro for unlimited accounts, advanced reports, and priority support.
        </p>
        <Button
          variant="outline"
          className="border-[var(--color-accent)] text-[var(--color-accent)]"
          onClick={() => notify.info('Billing portal not yet available')}
        >
          Upgrade to Pro — $9.99/mo
        </Button>
      </Card>
    </div>
  );
}

// ─── Shared: SectionHeader ────────────────────────────────────────────────────

function SectionHeader({
  title,
  description,
  inline = false,
}: {
  title: string;
  description?: string;
  inline?: boolean;
}) {
  if (inline) return null; // when used alongside a button row, caller handles layout
  return (
    <div className="mb-6">
      <h2 className="text-lg font-bold text-[var(--color-text)] m-0">
        {title}
      </h2>
      {description && (
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          {description}
        </p>
      )}
    </div>
  );
}

// ─── Main: SettingsPage ───────────────────────────────────────────────────────

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState<NavSection>('profile');

  function renderSection() {
    switch (activeSection) {
      case 'profile': return <ProfileSection />;
      case 'display': return <DisplaySection />;
      case 'notifications': return <NotificationsSection />;
      case 'security': return <SecuritySection />;
      case 'household': return <HouseholdSection />;
      case 'categories': return <CategoriesSection />;
      case 'tags': return <TagsSection />;
      case 'merchants': return <MerchantsSection />;
      case 'integrations': return <IntegrationsSection />;
      case 'report-digest': return <ReportDigestSection />;
      case 'data': return <DataSection />;
      case 'billing': return <BillingSection />;
      case 'tax-accounts': return <TaxAccountsSection />;
      case 'automation': return <AutomationSection />;
      case 'webhooks': return <WebhooksSection />;
    }
  }

  return (
    <div className="flex min-h-full">
      {/* Sidebar */}
      <nav
        aria-label="Settings navigation"
        className="w-[200px] shrink-0 pr-4 border-r border-[var(--color-border)] mr-8"
      >
        <div className="mb-3 text-[0.6875rem] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.06em]">
          Settings
        </div>
        <div className="flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-[var(--radius-md)] border-none cursor-pointer text-left text-sm transition-[background-color,color] duration-[0.15s]"
                style={{
                  fontWeight: isActive ? 600 : 400,
                  backgroundColor: isActive ? 'var(--color-accent-light)' : 'transparent',
                  color: isActive ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)';
                    e.currentTarget.style.color = 'var(--color-text)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = 'var(--color-text-secondary)';
                  }
                }}
                aria-current={isActive ? 'page' : undefined}
              >
                <span className="shrink-0 flex items-center">
                  {item.icon}
                </span>
                {item.label}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 min-w-0 pb-8">
        {renderSection()}
      </main>
    </div>
  );
}
