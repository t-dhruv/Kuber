import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  User, Monitor, Bell, Shield, Home, Tag, Database, CreditCard,
  Trash2, Upload, ShieldCheck, ShieldOff, Mail,
  Receipt, Zap, Globe,
} from 'lucide-react';
import { api } from '@/lib/api';
import { getApiErrorMessage } from '@/lib/apiError';
import {
  Button, Input, Select, Avatar, Card, CardDivider, Modal, ModalFooter, notify, ConfirmDialog,
} from '@/components/ui';
import { SectionHeader } from '../components/SectionHeader';
import { useAuthStore } from '@/stores/authStore';
import {
  useEmailMfaDisable,
  useEmailMfaEnable,
  useTotpDisable,
  useTotpEnable,
  useTotpSetup,
  useTotpStatus,
} from '@/hooks/useAuth';

export { DataSection } from '../components/DataSection';
export { AuditLogSection } from '../components/AuditLogSection';
export { BillingSection } from '../components/BillingSection';
export { WebhooksSection } from '../components/WebhooksSection';
export { ReportDigestSection } from '../components/ReportDigestSection';
export { IntegrationsSection } from '../components/IntegrationsSection';
export { MerchantsSection } from '../components/MerchantsSection';
export { TagsSection } from '../components/TagsSection';
export { CategoriesSection } from '../components/CategoriesSection';

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
  totpEnabled?: boolean;
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

export type NavSection =
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
  | 'audit'
  | 'tax-accounts'
  | 'automation'
  | 'webhooks';

export const NAV_ITEMS: { id: NavSection; label: string; icon: React.ReactNode }[] = [
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
  { id: 'audit', label: 'Audit Log', icon: <ShieldCheck size={16} /> },
  { id: 'tax-accounts', label: 'Tax Accounts', icon: <Receipt size={16} /> },
  { id: 'automation', label: 'Automation', icon: <Zap size={16} /> },
  { id: 'webhooks', label: 'Webhooks', icon: <Globe size={16} /> },
];

// ─── Section: Profile ─────────────────────────────────────────────────────────

export function ProfileSection() {
  const { user, setAuth } = useAuthStore();
  const queryClient = useQueryClient();
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
      queryClient.invalidateQueries({ queryKey: ['settings', 'profile'] });
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
type AccentOption = 'orange' | 'green' | 'ink' | 'indigo' | 'teal' | 'lime';

const ACCENT_OPTIONS: { id: AccentOption; name: string; swatch: string }[] = [
  { id: 'orange', name: 'Ember Orange', swatch: '#E5622A' },
  { id: 'green',  name: 'Vault Green',  swatch: '#1B7A4F' },
  { id: 'ink',    name: 'Ink Black',    swatch: '#111827' },
  { id: 'indigo', name: 'Trust Indigo', swatch: '#3730A3' },
  { id: 'teal',   name: 'Terminal Teal',swatch: '#0E9594' },
  { id: 'lime',   name: 'Neon Lime',    swatch: '#C6F24C' },
];

function applyTheme(theme: ThemeOption) {
  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.dataset.theme = prefersDark ? 'dark' : 'light';
  } else {
    document.documentElement.dataset.theme = theme;
  }
}

function applyAccent(accent: AccentOption) {
  document.documentElement.dataset.accent = accent;
}

export function DisplaySection() {
  const [theme, setTheme] = useState<ThemeOption>(() => {
    return (localStorage.getItem('kuber_theme') as ThemeOption) ?? 'system';
  });
  const [accent, setAccent] = useState<AccentOption>(() => {
    return (localStorage.getItem('kuber_accent') as AccentOption) ?? 'orange';
  });

  function handleThemeChange(t: ThemeOption) {
    setTheme(t);
    localStorage.setItem('kuber_theme', t);
    applyTheme(t);
  }

  function handleAccentChange(a: AccentOption) {
    setAccent(a);
    localStorage.setItem('kuber_accent', a);
    applyAccent(a);
  }

  const options: { value: ThemeOption; label: string; description: string }[] = [
    { value: 'light', label: 'Light', description: 'Always use light mode' },
    { value: 'dark', label: 'Dark', description: 'Always use dark mode' },
    { value: 'system', label: 'System', description: 'Follow your OS preference' },
  ];

  return (
    <div className="flex flex-col gap-6">
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

      <Card padding="lg" style={{ maxWidth: 480 }}>
        <div className="mb-3">
          <span className="text-sm font-semibold text-[var(--color-text)]">Brand Accent</span>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            Default is Ember Orange — Kuber's signature warm tone. Applies everywhere instantly.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {ACCENT_OPTIONS.map((a) => {
            const active = accent === a.id;
            return (
              <button
                key={a.id}
                onClick={() => handleAccentChange(a.id)}
                className="flex items-center gap-2.5 p-2.5 rounded-[var(--radius-md)] cursor-pointer text-left transition-[border-color,background-color] duration-[0.15s]"
                style={{
                  border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-border)'}`,
                  background: active ? 'var(--color-accent-light)' : 'var(--color-surface)',
                }}
              >
                <span
                  className="flex-shrink-0 rounded-full"
                  style={{ width: 20, height: 20, background: a.swatch, border: '1px solid var(--color-border)' }}
                />
                <div className="flex-1 min-w-0">
                  <div
                    className="text-[13px] font-medium truncate"
                    style={{ color: active ? 'var(--color-accent)' : 'var(--color-text)' }}
                  >
                    {a.name}
                  </div>
                </div>
                {a.id === 'orange' && !active && (
                  <span
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wider flex-shrink-0"
                    style={{ background: 'var(--color-surface-alt)', color: 'var(--color-text-muted)' }}
                  >
                    Default
                  </span>
                )}
              </button>
            );
          })}
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
  const [confirmUnsubscribe, setConfirmUnsubscribe] = useState(false);

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
    } catch (err: unknown) {
      notify.error(getApiErrorMessage(err, 'Could not enable push notifications'));
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
      setConfirmUnsubscribe(false);
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
    <>
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
          onClick={status === 'subscribed' ? () => setConfirmUnsubscribe(true) : subscribe}
        >
          {status === 'subscribed' ? 'Unsubscribe' : 'Enable'}
        </Button>
      </div>
      <ConfirmDialog
        open={confirmUnsubscribe}
        onClose={() => setConfirmUnsubscribe(false)}
        onConfirm={unsubscribe}
        title="Unsubscribe Browser"
        message="Remove this browser's push notification subscription?"
        confirmLabel="Unsubscribe"
        loading={loading}
      />
    </>
  );
}

export function NotificationsSection() {
  const queryClient = useQueryClient();
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings', 'notifications'] }),
    onError: () => notify.error('Failed to save notification preferences'),
  });

  const saveLowBalanceMutation = useMutation({
    mutationFn: (threshold: number | null) =>
      api.put('/settings/notifications', { lowBalanceThreshold: threshold }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings', 'notifications'] }),
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

  const errorMessage = enableMutation.error
    ? getApiErrorMessage(enableMutation.error, 'Failed to enable two-factor authentication')
    : null;
  const disableError = disableMutation.error
    ? getApiErrorMessage(disableMutation.error, 'Failed to disable two-factor authentication')
    : null;

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

function EmailMfaCard() {
  const { data: status, isLoading } = useTotpStatus();
  const enableMutation = useEmailMfaEnable();
  const disableMutation = useEmailMfaDisable();
  const [modalMode, setModalMode] = useState<'enable' | 'disable' | null>(null);
  const [password, setPassword] = useState('');

  if (isLoading) return null;

  const isEnabled = status?.emailMfaEnabled ?? false;
  const emailVerified = status?.emailVerified ?? false;
  const activeMutation = modalMode === 'enable' ? enableMutation : disableMutation;
  const errorMessage = activeMutation.error
    ? getApiErrorMessage(activeMutation.error, 'Failed to update email MFA')
    : null;

  function handleSubmit() {
    if (!modalMode || !password) return;
    const mutation = modalMode === 'enable' ? enableMutation : disableMutation;
    mutation.mutate({ password }, {
      onSuccess: () => {
        notify.success(modalMode === 'enable' ? 'Email MFA enabled' : 'Email MFA disabled');
        setPassword('');
        setModalMode(null);
      },
    });
  }

  return (
    <>
      <Card padding="lg">
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-3 items-start">
            <Mail size={20} className="text-[var(--color-text-muted)] shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-[var(--color-text)] mb-1">
                Email Code
              </div>
              <p className="text-sm text-[var(--color-text-secondary)] m-0">
                {isEnabled ? 'Enabled' : emailVerified ? 'Available' : 'Verify your email to enable'}
              </p>
            </div>
          </div>
          <Button
            variant={isEnabled ? 'outline' : 'secondary'}
            size="sm"
            disabled={!emailVerified}
            onClick={() => setModalMode(isEnabled ? 'disable' : 'enable')}
            className="shrink-0"
          >
            {isEnabled ? 'Disable' : 'Enable'}
          </Button>
        </div>
      </Card>

      <Modal
        open={modalMode !== null}
        onClose={() => { setModalMode(null); setPassword(''); }}
        title={modalMode === 'enable' ? 'Enable Email Code' : 'Disable Email Code'}
        size="sm"
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            error={errorMessage || undefined}
          />
          <ModalFooter>
            <Button variant="ghost" onClick={() => { setModalMode(null); setPassword(''); }}>Cancel</Button>
            <Button
              variant={modalMode === 'disable' ? 'danger' : 'primary'}
              loading={enableMutation.isPending || disableMutation.isPending}
              disabled={!password}
              onClick={handleSubmit}
            >
              Confirm
            </Button>
          </ModalFooter>
        </div>
      </Modal>
    </>
  );
}

// ─── Section: Security ────────────────────────────────────────────────────────

export function SecuritySection() {
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
        <EmailMfaCard />

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

export function HouseholdSection() {
  const queryClient = useQueryClient();
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
  const [inviteLink, setInviteLink] = useState('');
  const [removeTarget, setRemoveTarget] = useState<HouseholdMember | null>(null);
  const [twoFactorResetTarget, setTwoFactorResetTarget] = useState<HouseholdMember | null>(null);

  useEffect(() => {
    if (data) {
      setHouseholdName(data.name);
      setCurrency(data.currency);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => api.put('/settings/household', { name: householdName, currency }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'household'] });
      notify.success('Household saved');
    },
    onError: () => notify.error('Failed to save household'),
  });

  const inviteMutation = useMutation({
    mutationFn: () => api.post('/settings/household/invite', { email: inviteEmail, role: inviteRole }),
    onSuccess: (response) => {
      const nextInviteLink = response.data?.inviteUrl
        ? `${window.location.origin}${response.data.inviteUrl}`
        : '';
      setInviteLink(nextInviteLink);
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

  const resetTwoFactorMutation = useMutation({
    mutationFn: (memberId: string) => api.post(`/settings/household/members/${memberId}/disable-2fa`),
    onSuccess: () => {
      notify.success('Member 2FA disabled');
      setTwoFactorResetTarget(null);
      refetch();
    },
    onError: () => notify.error('Failed to disable member 2FA'),
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
                  {!isOwnerMember && member.totpEnabled && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setTwoFactorResetTarget(member)}
                    >
                      Reset 2FA
                    </Button>
                  )}
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
              {inviteLink && (
                <div className="rounded-[var(--radius-md)] bg-[var(--color-surface-hover)] p-3 text-sm text-[var(--color-text)]">
                  <div className="font-medium mb-1">Invite link</div>
                  <div className="break-all text-[var(--color-text-secondary)] mb-2">{inviteLink}</div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard?.writeText(inviteLink);
                      notify.success('Invite link copied');
                    }}
                  >
                    Copy link
                  </Button>
                </div>
              )}
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

      <Modal
        open={!!twoFactorResetTarget}
        onClose={() => setTwoFactorResetTarget(null)}
        title="Reset Member 2FA"
        size="sm"
      >
        <p className="text-sm text-[var(--color-text)] mb-2">
          Disable two-factor authentication for <strong>{twoFactorResetTarget ? `${twoFactorResetTarget.firstName} ${twoFactorResetTarget.lastName}`.trim() : ''}</strong>?
        </p>
        <p className="text-sm text-[var(--color-text-secondary)] mb-4">
          They can sign in with their password and set up two-factor authentication again from Security settings.
        </p>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setTwoFactorResetTarget(null)}>Cancel</Button>
          <Button
            variant="danger"
            loading={resetTwoFactorMutation.isPending}
            onClick={() => twoFactorResetTarget && resetTwoFactorMutation.mutate(twoFactorResetTarget.userId)}
          >
            Reset 2FA
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
