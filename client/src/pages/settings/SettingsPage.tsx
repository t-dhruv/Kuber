import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  User, Monitor, Bell, Shield, Home, Tag, Database, CreditCard,
  Pencil, Trash2, Plus, ChevronDown, ChevronRight, Upload, ShieldCheck, ShieldOff, Mail, Bot,
  CheckCircle2, XCircle, Receipt,
} from 'lucide-react';
import { api } from '@/lib/api';
import {
  Button, Input, Select, Checkbox, Avatar, Card, CardDivider, Modal, ModalFooter, notify, Skeleton,
} from '@/components/ui';
import { ErrorBoundary } from '@/components/ErrorBoundary';
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
  | 'billing';

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
        <div style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>Loading...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Avatar row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
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
              <p style={{ marginTop: '0.375rem', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                JPG, PNG or GIF. Max 2 MB.
              </p>
            </div>
          </div>

          {/* Name row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
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
            style={{ backgroundColor: 'var(--color-surface-hover)', cursor: 'not-allowed' }}
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
        <div style={{ marginBottom: '0.75rem' }}>
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)' }}>
            Visual Appearance
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {options.map((opt) => (
            <label
              key={opt.value}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.75rem',
                borderRadius: 'var(--radius-md)',
                border: `1px solid ${theme === opt.value ? 'var(--color-accent)' : 'var(--color-border)'}`,
                backgroundColor: theme === opt.value ? 'var(--color-accent-light)' : 'transparent',
                cursor: 'pointer',
                transition: 'border-color 0.15s, background-color 0.15s',
              }}
            >
              <input
                type="radio"
                name="theme"
                value={opt.value}
                checked={theme === opt.value}
                onChange={() => handleThemeChange(opt.value)}
                style={{ accentColor: 'var(--color-accent)' }}
              />
              <div>
                <div style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text)' }}>
                  {opt.label}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
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

function NotificationsSection() {
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIF_PREFS);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data, isLoading } = useQuery<{ preferences: NotificationPrefs }>({
    queryKey: ['settings', 'notifications'],
    queryFn: () => api.get('/settings/notifications').then((r) => r.data),
  });

  useEffect(() => {
    if (data?.preferences) setPrefs(data.preferences);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: (updated: NotificationPrefs) =>
      api.put('/settings/notifications', { preferences: updated }),
    onError: () => notify.error('Failed to save notification preferences'),
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
        <div style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>Loading...</div>
      </div>
    );
  }

  return (
    <div>
      <SectionHeader title="Notifications" description="Choose what you want to be notified about." />

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', color: 'var(--color-text-muted)', fontWeight: 500, width: '100%' }} />
              {channels.map((ch) => (
                <th
                  key={ch.key}
                  style={{
                    textAlign: 'center',
                    padding: '0.5rem 1rem',
                    color: 'var(--color-text-secondary)',
                    fontWeight: 600,
                    fontSize: '0.75rem',
                    whiteSpace: 'nowrap',
                    minWidth: 72,
                  }}
                >
                  {ch.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(groups).map(([groupName, rows]) => (
              <>
                <tr key={`group-${groupName}`}>
                  <td
                    colSpan={4}
                    style={{
                      padding: '0.875rem 0.75rem 0.375rem',
                      fontSize: '0.6875rem',
                      fontWeight: 700,
                      color: 'var(--color-text-muted)',
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {groupName}
                  </td>
                </tr>
                {rows.map((row, idx) => (
                  <tr
                    key={row.key}
                    style={{
                      borderTop: `1px solid var(--color-border)`,
                    }}
                  >
                    <td style={{ padding: '0.625rem 0.75rem', color: 'var(--color-text)' }}>
                      {row.label}
                    </td>
                    {channels.map((ch) => (
                      <td key={ch.key} style={{ textAlign: 'center', padding: '0.625rem 1rem' }}>
                        <input
                          type="checkbox"
                          checked={prefs[row.key][ch.key]}
                          onChange={() => togglePref(row.key, ch.key)}
                          style={{
                            width: 16,
                            height: 16,
                            accentColor: 'var(--color-accent)',
                            cursor: 'pointer',
                          }}
                          aria-label={`${row.label} — ${ch.label}`}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </>
            ))}
          </tbody>
        </table>
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
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
            {isEnabled
              ? <ShieldCheck size={20} style={{ color: 'var(--color-success)', flexShrink: 0, marginTop: 2 }} />
              : <ShieldOff size={20} style={{ color: 'var(--color-text-muted)', flexShrink: 0, marginTop: 2 }} />
            }
            <div>
              <div style={{ fontWeight: 600, color: 'var(--color-text)', marginBottom: '0.25rem' }}>
                Two-Factor Authentication
              </div>
              <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', margin: 0 }}>
                {isEnabled
                  ? `Enabled — ${status?.backupCodesRemaining ?? 0} backup code${status?.backupCodesRemaining !== 1 ? 's' : ''} remaining`
                  : 'Add an extra layer of security using an authenticator app.'}
              </p>
            </div>
          </div>
          {step === 'idle' && (
            isEnabled ? (
              <Button variant="outline" size="sm" style={{ borderColor: 'var(--color-danger)', color: 'var(--color-danger)', flexShrink: 0 }} onClick={() => setDisableModalOpen(true)}>
                Disable
              </Button>
            ) : (
              <Button variant="secondary" size="sm" loading={setupMutation.isPending} onClick={handleStartSetup} style={{ flexShrink: 0 }}>
                Set up
              </Button>
            )
          )}
        </div>

        {/* Step: Show QR code */}
        {step === 'qr' && qrData && (
          <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--color-border)', paddingTop: '1.5rem' }}>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
              Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.), then click <strong>Next</strong>.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
              <img src={qrData.qrCodeDataUrl} alt="TOTP QR code" style={{ width: 180, height: 180, borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }} />
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textAlign: 'center', marginBottom: '1rem' }}>
              Can't scan? Enter this key manually: <code style={{ userSelect: 'all' }}>{qrData.secret}</code>
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={() => { setStep('idle'); setQrData(null); }}>Cancel</Button>
              <Button variant="primary" onClick={() => setStep('confirm')}>Next</Button>
            </div>
          </div>
        )}

        {/* Step: Confirm code */}
        {step === 'confirm' && (
          <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--color-border)', paddingTop: '1.5rem' }}>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
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
              style={{
                width: '100%', padding: '0.625rem 0.875rem', borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border-strong)', backgroundColor: 'var(--color-bg)',
                color: 'var(--color-text)', fontSize: '1.375rem', letterSpacing: '0.4em',
                textAlign: 'center', outline: 'none', boxSizing: 'border-box', marginBottom: '0.75rem',
              }}
            />
            {errorMessage && (
              <div style={{ padding: '0.625rem', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-danger-light)', color: 'var(--color-danger)', fontSize: '0.875rem', marginBottom: '0.75rem' }}>
                {errorMessage}
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
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
          <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--color-border)', paddingTop: '1.5rem' }}>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text)', fontWeight: 600, marginBottom: '0.5rem' }}>
              Save your backup codes
            </p>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
              Store these codes somewhere safe. Each can be used once if you lose access to your authenticator app.
            </p>
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem',
              backgroundColor: 'var(--color-surface-hover)', borderRadius: 'var(--radius-md)',
              padding: '1rem', marginBottom: '1rem', fontFamily: 'monospace', fontSize: '0.9375rem',
            }}>
              {backupCodes.map((code) => (
                <div key={code} style={{ color: 'var(--color-text)', letterSpacing: '0.05em' }}>{code}</div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text)' }}>
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
            <Button variant="secondary" onClick={() => { setDisableModalOpen(false); setDisablePassword(''); }}>Cancel</Button>
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
  const [deleteInput, setDeleteInput] = useState('');

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

  function handleDeleteConfirm() {
    if (deleteInput !== 'DELETE') return;
    setDeleteModalOpen(false);
    setDeleteInput('');
    notify.info('Account deletion requires contacting support.');
  }

  return (
    <div>
      <SectionHeader title="Security" description="Manage your password and account access." />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: 480 }}>
        {/* Change Password */}
        <Card padding="lg">
          <div style={{ marginBottom: '1.25rem', fontWeight: 600, color: 'var(--color-text)' }}>
            Change Password
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
              style={{ alignSelf: 'flex-start' }}
            >
              Update password
            </Button>
          </div>
        </Card>

        {/* Two-Factor Authentication */}
        <TwoFactorCard />

        {/* Danger Zone */}
        <Card padding="lg" style={{ borderColor: 'var(--color-danger)' }}>
          <div style={{ marginBottom: '0.5rem', fontWeight: 600, color: 'var(--color-danger)' }}>
            Danger Zone
          </div>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
            Permanently delete your account and all associated data. This cannot be undone.
          </p>
          <Button
            variant="outline"
            style={{
              borderColor: 'var(--color-danger)',
              color: 'var(--color-danger)',
            }}
            onClick={() => setDeleteModalOpen(true)}
          >
            Delete account
          </Button>
        </Card>
      </div>

      {/* Delete confirmation modal */}
      <Modal
        open={deleteModalOpen}
        onClose={() => { setDeleteModalOpen(false); setDeleteInput(''); }}
        title="Delete Account"
        description="This action is permanent and cannot be undone."
        size="sm"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text)' }}>
            Type <strong>DELETE</strong> to confirm.
          </p>
          <Input
            value={deleteInput}
            onChange={(e) => setDeleteInput(e.target.value)}
            placeholder="DELETE"
          />
          <ModalFooter>
            <Button variant="secondary" onClick={() => { setDeleteModalOpen(false); setDeleteInput(''); }}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={deleteInput !== 'DELETE'}
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
        <div style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>Loading...</div>
      </div>
    );
  }

  return (
    <div>
      <SectionHeader title="Household" description="Manage your household settings and members." />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: 560 }}>
        {/* Household settings */}
        <Card padding="lg">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
              style={{ alignSelf: 'flex-start' }}
            >
              Save
            </Button>
          </div>
        </Card>

        {/* Members */}
        <Card padding="lg">
          <div style={{ marginBottom: '1rem', fontWeight: 600, color: 'var(--color-text)' }}>
            Members
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {(data?.members ?? []).map((member) => {
              const fullName = `${member.firstName} ${member.lastName}`.trim();
              const isOwnerMember = member.role.toLowerCase() === 'owner';
              return (
                <div
                  key={member.userId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.625rem 0',
                    borderBottom: '1px solid var(--color-border)',
                  }}
                >
                  <Avatar src={null} name={fullName} size="sm" />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text)' }}>
                      {fullName}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{member.email}</div>
                  </div>
                  <span style={{
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    padding: '0.125rem 0.5rem',
                    borderRadius: 'var(--radius-full)',
                    backgroundColor: 'var(--color-surface-hover)',
                    color: 'var(--color-text-secondary)',
                  }}>
                    {member.role}
                  </span>
                  {!isOwnerMember && (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Trash2 size={13} />}
                      style={{ color: 'var(--color-danger)' }}
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
          <div style={{ marginTop: '0.75rem' }}>
            <div style={{ marginBottom: '0.75rem', fontWeight: 600, color: 'var(--color-text)', fontSize: '0.875rem' }}>
              Invite Member
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
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
                style={{ alignSelf: 'flex-start' }}
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
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text)', marginBottom: '0.5rem' }}>
          Remove <strong>{removeTarget ? `${removeTarget.firstName} ${removeTarget.lastName}`.trim() : ''}</strong> from the household?
        </p>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setRemoveTarget(null)}>Cancel</Button>
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
      <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text)', marginBottom: '0.375rem' }}>
        Emoji
      </label>
      <div style={{ position: 'relative' }} ref={ref}>
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.625rem',
            padding: '0.5rem 0.875rem',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border-strong)',
            backgroundColor: 'var(--color-bg)',
            cursor: 'pointer',
            fontSize: '1.5rem',
            lineHeight: 1,
            minWidth: 120,
          }}
        >
          <span>{value || '—'}</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginLeft: 'auto' }}>Pick ▾</span>
        </button>

        {open && (
          <div style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            zIndex: 100,
            backgroundColor: 'var(--color-surface-elevated, var(--color-surface))',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-lg)',
            width: 300,
            marginTop: 4,
          }}>
            {/* Tabs */}
            <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--color-border)', overflowX: 'auto', padding: '0.25rem 0.5rem 0' }}>
              {EMOJI_GROUPS.map((g, i) => (
                <button
                  key={g.label}
                  type="button"
                  onClick={() => setTab(i)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '0.25rem 0.5rem',
                    fontSize: '0.6875rem',
                    fontWeight: tab === i ? 700 : 400,
                    color: tab === i ? 'var(--color-accent)' : 'var(--color-text-muted)',
                    borderBottom: tab === i ? '2px solid var(--color-accent)' : '2px solid transparent',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  {g.label}
                </button>
              ))}
            </div>
            {/* Emoji grid */}
            <div style={{ padding: '0.5rem', display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '0.125rem' }}>
              {EMOJI_GROUPS[tab].emojis.map((em) => (
                <button
                  key={em}
                  type="button"
                  onClick={() => { onChange(em); setOpen(false); }}
                  style={{
                    background: value === em ? 'var(--color-accent-light)' : 'none',
                    border: 'none',
                    cursor: 'pointer',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '1.25rem',
                    padding: '0.25rem',
                    lineHeight: 1,
                    textAlign: 'center',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = value === em ? 'var(--color-accent-light)' : 'transparent')}
                  title={em}
                >
                  {em}
                </button>
              ))}
            </div>
            {/* Manual input for custom */}
            <div style={{ borderTop: '1px solid var(--color-border)', padding: '0.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', flexShrink: 0 }}>Custom:</span>
              <input
                value={value}
                onChange={(e) => onChange(e.target.value.slice(0, 2))}
                placeholder="✏️"
                maxLength={2}
                style={{
                  flex: 1, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
                  padding: '0.25rem 0.5rem', fontSize: '1rem', backgroundColor: 'var(--color-bg)',
                  color: 'var(--color-text)', outline: 'none',
                }}
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
        <div style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>Loading...</div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem', gap: '0.5rem', flexWrap: 'wrap' }}>
        <SectionHeader title="Categories" description="Manage transaction categories and 50/30/20 buckets." inline />
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => resetBucketsMutation.mutate()}
            loading={resetBucketsMutation.isPending}
            style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}
          >
            Reset buckets to defaults
          </Button>
          <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={() => openAdd()}>
            Add category
          </Button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1.25rem' }}>
        {(data?.groups ?? []).map((group) => {
          const isCollapsed = collapsed[group.name];
          return (
            <Card key={group.name} padding="none" style={{ overflow: 'hidden' }}>
              {/* Group header */}
              <button
                onClick={() => setCollapsed((prev) => ({ ...prev, [group.name]: !isCollapsed }))}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  width: '100%',
                  padding: '0.75rem 1rem',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  borderBottom: isCollapsed ? 'none' : '1px solid var(--color-border)',
                }}
              >
                {isCollapsed ? <ChevronRight size={14} style={{ color: 'var(--color-text-muted)' }} /> : <ChevronDown size={14} style={{ color: 'var(--color-text-muted)' }} />}
                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)' }}>
                  {group.name}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginLeft: '0.25rem' }}>
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
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        padding: '0.625rem 1rem 0.625rem 2rem',
                        borderBottom: idx < group.categories.length - 1 ? '1px solid var(--color-border)' : 'none',
                      }}
                    >
                      <span style={{ fontSize: '1.625rem', lineHeight: 1, width: 28, textAlign: 'center', flexShrink: 0 }}>
                        {cat.emoji || '·'}
                      </span>
                      <span style={{ flex: 1, fontSize: '0.875rem', color: 'var(--color-text)' }}>
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
                          style={{
                            fontSize: '0.75rem',
                            padding: '0.125rem 0.375rem',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--color-border)',
                            background: 'var(--color-surface)',
                            color: 'var(--color-text)',
                            cursor: 'pointer',
                          }}
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
                          style={{
                            fontSize: '0.6875rem',
                            fontWeight: 600,
                            padding: '0.1875rem 0.5rem',
                            borderRadius: '9999px',
                            background: bucketMeta.bg,
                            color: bucketMeta.text,
                            border: 'none',
                            cursor: 'pointer',
                            flexShrink: 0,
                            letterSpacing: '0.01em',
                          }}
                        >
                          {bucketMeta.label}
                        </button>
                      )}
                      {/* Tax deductible toggle */}
                      <button
                        onClick={() => toggleTaxMutation.mutate({ categoryId: cat.id, isTaxDeductible: !cat.isTaxDeductible })}
                        title={cat.isTaxDeductible ? 'Tax deductible (click to remove)' : 'Mark as tax deductible'}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          padding: '0.1875rem 0.4375rem',
                          borderRadius: '9999px',
                          fontSize: '0.6875rem',
                          fontWeight: 600,
                          border: '1px solid',
                          borderColor: cat.isTaxDeductible ? 'var(--color-success)' : 'var(--color-border)',
                          background: cat.isTaxDeductible ? 'color-mix(in srgb, var(--color-success) 12%, transparent)' : 'transparent',
                          color: cat.isTaxDeductible ? 'var(--color-success)' : 'var(--color-text-secondary)',
                          cursor: 'pointer',
                          flexShrink: 0,
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
                        style={{ color: 'var(--color-text-secondary)' }}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Trash2 size={13} />}
                        onClick={() => setDeleteTarget(cat)}
                        style={{ color: 'var(--color-danger)' }}
                      >
                        Delete
                      </Button>
                    </div>
                    );
                  })}
                  {/* Add to group */}
                  <button
                    onClick={() => openAdd(group.name)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      width: '100%',
                      padding: '0.625rem 1rem 0.625rem 2rem',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '0.8125rem',
                      color: 'var(--color-accent)',
                      fontWeight: 500,
                    }}
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
            <Button variant="secondary" onClick={closeModal}>Cancel</Button>
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
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text)' }}>
          Delete <strong>{deleteTarget?.emoji} {deleteTarget?.name}</strong>? This cannot be undone.
        </p>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
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
        <div style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>Loading...</div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <SectionHeader title="Tags" description="Manage transaction tags." inline />
        <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={openAdd}>
          New Tag
        </Button>
      </div>

      <Card padding="none">
        {(!tags || tags.length === 0) ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
            No tags yet. Create one to start organizing transactions.
          </div>
        ) : (
          tags.map((tag, idx) => (
            <div
              key={tag.id}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem',
                padding: '0.625rem 1rem',
                borderBottom: idx < tags.length - 1 ? '1px solid var(--color-border)' : 'none',
              }}
            >
              {/* Color swatch */}
              <div style={{
                width: 16, height: 16, borderRadius: 'var(--radius-full)',
                backgroundColor: tag.color, flexShrink: 0,
              }} />
              {/* Name */}
              <span style={{ flex: 1, fontSize: '0.875rem', color: 'var(--color-text)', fontWeight: 500 }}>
                {tag.name}
              </span>
              {/* Transaction count badge */}
              <span style={{
                fontSize: '0.75rem', fontWeight: 600,
                color: 'var(--color-text-muted)',
                backgroundColor: 'var(--color-surface-hover)',
                borderRadius: 'var(--radius-full)',
                padding: '0.125rem 0.5rem',
              }}>
                {tag.transactionCount} {tag.transactionCount === 1 ? 'tx' : 'txs'}
              </span>
              <Button
                variant="ghost"
                size="sm"
                icon={<Pencil size={13} />}
                onClick={() => openEdit(tag)}
                style={{ color: 'var(--color-text-secondary)' }}
              >
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon={<Trash2 size={13} />}
                onClick={() => setDeleteTarget(tag)}
                style={{ color: 'var(--color-danger)' }}
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <Input
            label="Name"
            value={tagName}
            onChange={(e) => setTagName(e.target.value)}
            placeholder="e.g. Business"
            error={tagError || undefined}
          />
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text)', marginBottom: '0.5rem' }}>
              Color
            </label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {TAG_PRESET_COLORS.map((c) => (
                <div
                  key={c}
                  onClick={() => setTagColor(c)}
                  style={{
                    width: 28, height: 28, borderRadius: 'var(--radius-full)',
                    backgroundColor: c, cursor: 'pointer',
                    outline: tagColor === c ? `3px solid ${c}` : '3px solid transparent',
                    outlineOffset: 2,
                    transition: 'outline 0.1s',
                  }}
                />
              ))}
            </div>
          </div>
          <ModalFooter>
            <Button variant="secondary" onClick={closeModal}>Cancel</Button>
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
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text)' }}>
          This tag will be removed from all transactions. Are you sure you want to delete <strong>{deleteTarget?.name}</strong>?
        </p>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
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
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <Input
          placeholder="Search merchants..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ maxWidth: 260 }}
        />
        <div style={{ display: 'flex', gap: '0.375rem' }}>
          <button
            onClick={() => setOrder('TRANSACTION_COUNT')}
            style={{
              padding: '0.375rem 0.75rem', borderRadius: 'var(--radius-sm)', fontSize: '0.8125rem',
              fontWeight: 600, border: '1px solid var(--color-border)', cursor: 'pointer',
              backgroundColor: order === 'TRANSACTION_COUNT' ? 'var(--color-accent)' : 'var(--color-surface)',
              color: order === 'TRANSACTION_COUNT' ? '#fff' : 'var(--color-text-secondary)',
            }}
          >
            By transaction count
          </button>
          <button
            onClick={() => setOrder('NAME')}
            style={{
              padding: '0.375rem 0.75rem', borderRadius: 'var(--radius-sm)', fontSize: '0.8125rem',
              fontWeight: 600, border: '1px solid var(--color-border)', cursor: 'pointer',
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
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
            Loading merchants...
          </div>
        ) : visible.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
            {search ? 'No merchants match your search.' : 'No merchants yet.'}
          </div>
        ) : (
          visible.map((m, idx) => (
            <div
              key={m.id}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem',
                padding: '0.625rem 1rem',
                borderBottom: idx < visible.length - 1 ? '1px solid var(--color-border)' : 'none',
              }}
            >
              {/* Name or inline editor */}
              {editingId === m.id ? (
                <input
                  autoFocus
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  onKeyDown={e => handleEditKeyDown(e, m.id)}
                  onBlur={() => commitEdit(m.id)}
                  style={{
                    flex: 1, fontSize: '0.875rem', fontWeight: 500,
                    padding: '0.25rem 0.5rem',
                    border: '1px solid var(--color-accent)',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--color-surface)',
                    color: 'var(--color-text)',
                    outline: 'none',
                  }}
                />
              ) : (
                <span style={{ flex: 1, fontSize: '0.875rem', color: 'var(--color-text)', fontWeight: 500 }}>
                  {m.displayName}
                  {m.displayName !== m.name && (
                    <span style={{ marginLeft: '0.375rem', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                      ({m.name})
                    </span>
                  )}
                </span>
              )}

              {/* Transaction count badge */}
              <span style={{
                fontSize: '0.75rem', fontWeight: 600,
                color: 'var(--color-text-muted)',
                backgroundColor: 'var(--color-surface-hover)',
                borderRadius: 'var(--radius-full)',
                padding: '0.125rem 0.5rem',
                flexShrink: 0,
              }}>
                {m.transactionCount} {m.transactionCount === 1 ? 'tx' : 'txs'}
              </span>

              <Button
                variant="ghost"
                size="sm"
                icon={<Pencil size={13} />}
                onClick={() => startEdit(m)}
                style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }}
              >
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon={<Trash2 size={13} />}
                onClick={() => setDeleteTarget(m)}
                style={{ color: 'var(--color-danger)', flexShrink: 0 }}
              >
                Delete
              </Button>
            </div>
          ))
        )}
      </Card>

      {/* Show more */}
      {filtered.length > showCount && (
        <div style={{ marginTop: '0.75rem', textAlign: 'center' }}>
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
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text)' }}>
          Remove this merchant? Transactions will become unlinked.{' '}
          Are you sure you want to remove <strong>{deleteTarget?.displayName}</strong>?
        </p>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
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
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <Bot size={18} color="var(--color-primary)" />
        <span style={{ fontWeight: 600, color: 'var(--color-text)' }}>AI Advisor</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          backgroundColor: isConfigured ? 'var(--color-success, #22c55e)' : 'var(--color-text-muted)',
          display: 'inline-block', flexShrink: 0,
        }} />
        <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
          {isConfigured
            ? `Configured — ${PROVIDER_DEFAULTS[config.provider]?.label ?? config.provider} (${config.model})`
            : 'Not configured'}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
        {/* Provider */}
        <div>
          <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text)', display: 'block', marginBottom: '0.375rem' }}>
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
            <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text)', display: 'block', marginBottom: '0.375rem' }}>
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
            <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text)', display: 'block', marginBottom: '0.375rem' }}>
              API Key
              {keyHint && (
                <span style={{ fontWeight: 400, color: 'var(--color-text-muted)', marginLeft: '0.5rem' }}>
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
            <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text)', display: 'block', marginBottom: '0.375rem' }}>
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
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            fontSize: '0.8125rem',
            color: testResult.valid ? 'var(--color-success, #22c55e)' : 'var(--color-danger, #ef4444)',
          }}>
            {testResult.valid
              ? <><CheckCircle2 size={14} /> Connection successful</>
              : <><XCircle size={14} /> {testResult.error ?? 'Connection failed'}</>}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.25rem' }}>
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: 560 }}>
        {/* AI Advisor */}
        <AiAdvisorCard />

        {/* SMTP */}
        <Card padding="lg">
          <div style={{ marginBottom: '0.75rem' }}>
            <div style={{ fontWeight: 600, color: 'var(--color-text)', marginBottom: '0.25rem' }}>
              Email (SMTP)
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', margin: 0 }}>
              Kuber uses SMTP for password reset emails and account notifications. Configure SMTP via environment variables on your server:
            </p>
          </div>

          <div style={{
            backgroundColor: 'var(--color-surface-hover)',
            borderRadius: 'var(--radius-md)',
            padding: '0.875rem 1rem',
            fontFamily: 'monospace',
            fontSize: '0.8125rem',
            color: 'var(--color-text-secondary)',
            marginBottom: '1rem',
            lineHeight: 1.6,
          }}>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Enable toggle */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--color-text)', marginBottom: '0.25rem' }}>
                    Enable digest emails
                  </div>
                  <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', margin: 0 }}>
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
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.875rem',
                      fontWeight: 500,
                      color: 'var(--color-text)',
                      marginBottom: '0.5rem',
                    }}
                  >
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
                <div
                  style={{
                    fontSize: '0.8125rem',
                    color: 'var(--color-text-secondary)',
                    borderTop: '1px solid var(--color-border)',
                    paddingTop: '0.75rem',
                  }}
                >
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: 560 }}>
        {/* Export */}
        <Card padding="lg">
          <div style={{ marginBottom: '1rem', fontWeight: 600, color: 'var(--color-text)' }}>
            Export Data
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text)' }}>Transactions</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Download all transactions as CSV</div>
              </div>
              <Button variant="secondary" size="sm" onClick={() => downloadFile('/transactions/export/csv', 'transactions.csv')}>
                Download CSV
              </Button>
            </div>
            <div style={{ height: 1, backgroundColor: 'var(--color-border)' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text)' }}>Account Balances</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Download account balance history as CSV</div>
              </div>
              <Button variant="secondary" size="sm" onClick={() => downloadFile('/accounts/export/csv', 'account-balances.csv')}>
                Download CSV
              </Button>
            </div>
          </div>
        </Card>

        {/* Delete history */}
        <Card padding="lg" style={{ borderColor: 'var(--color-warning)' }}>
          <div style={{ marginBottom: '0.5rem', fontWeight: 600, color: 'var(--color-warning)' }}>
            Delete History
          </div>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
            Set a clean start date — all transactions before this date will be permanently deleted.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
            <Input
              label="Delete transactions before"
              type="date"
              value={cleanStartDate}
              onChange={(e) => setCleanStartDate(e.target.value)}
              style={{ maxWidth: 220 }}
            />
            <Button
              variant="outline"
              style={{ borderColor: 'var(--color-warning)', color: 'var(--color-warning)', marginBottom: 2 }}
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
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text)' }}>
          All transactions before <strong>{cleanStartDate}</strong> will be permanently deleted.
        </p>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setDeleteHistoryModalOpen(false)}>Cancel</Button>
          <Button variant="danger" onClick={handleDeleteHistory} disabled={deleteMutation.isPending}>
            {deleteMutation.isPending ? 'Deleting…' : 'Delete history'}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

// ─── Section: Billing ─────────────────────────────────────────────────────────

function BillingSection() {
  return (
    <div>
      <SectionHeader title="Billing" description="Manage your subscription." />

      <Card padding="lg" style={{ maxWidth: 400 }}>
        <div style={{ marginBottom: '0.375rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Current Plan
        </div>
        <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text)', marginBottom: '0.5rem' }}>
          Kuber Free
        </div>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: '1.25rem' }}>
          Upgrade to Pro for unlimited accounts, advanced reports, and priority support.
        </p>
        <Button
          variant="outline"
          style={{ borderColor: 'var(--color-accent)', color: 'var(--color-accent)' }}
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
    <div style={{ marginBottom: '1.5rem' }}>
      <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>
        {title}
      </h2>
      {description && (
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginTop: '0.25rem' }}>
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
    }
  }

  return (
    <div style={{ display: 'flex', gap: 0, minHeight: '100%' }}>
      {/* Sidebar */}
      <nav
        aria-label="Settings navigation"
        style={{
          width: 200,
          flexShrink: 0,
          paddingRight: '1rem',
          borderRight: '1px solid var(--color-border)',
          marginRight: '2rem',
        }}
      >
        <div style={{ marginBottom: '0.75rem', fontSize: '0.6875rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Settings
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
          {NAV_ITEMS.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.625rem',
                  width: '100%',
                  padding: '0.5rem 0.625rem',
                  borderRadius: 'var(--radius-md)',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: '0.875rem',
                  fontWeight: isActive ? 600 : 400,
                  backgroundColor: isActive ? 'var(--color-accent-light)' : 'transparent',
                  color: isActive ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                  transition: 'background-color 0.15s, color 0.15s',
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
                <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                  {item.icon}
                </span>
                {item.label}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Main content */}
      <main style={{ flex: 1, minWidth: 0, paddingBottom: '2rem' }}>
        {renderSection()}
      </main>
    </div>
  );
}
