import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  User, Monitor, Bell, Shield, Home, Tag, Database, CreditCard,
  Pencil, Trash2, Plus, ChevronDown, ChevronRight, Upload,
} from 'lucide-react';
import { api } from '@/lib/api';
import {
  Button, Input, Select, Checkbox, Avatar, Card, CardDivider, Modal, ModalFooter, notify,
} from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';

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
  currentUserId: string;
  isOwner: boolean;
}

interface HouseholdMember {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarUrl?: string | null;
}

interface Category {
  id: string;
  name: string;
  emoji: string;
  group: string;
}

interface CategoriesData {
  groups: { name: string; categories: Category[] }[];
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
  | 'data'
  | 'billing';

const NAV_ITEMS: { id: NavSection; label: string; icon: React.ReactNode }[] = [
  { id: 'profile', label: 'Profile', icon: <User size={16} /> },
  { id: 'display', label: 'Display', icon: <Monitor size={16} /> },
  { id: 'notifications', label: 'Notifications', icon: <Bell size={16} /> },
  { id: 'security', label: 'Security', icon: <Shield size={16} /> },
  { id: 'household', label: 'Household', icon: <Home size={16} /> },
  { id: 'categories', label: 'Categories', icon: <Tag size={16} /> },
  { id: 'data', label: 'Data', icon: <Database size={16} /> },
  { id: 'billing', label: 'Billing', icon: <CreditCard size={16} /> },
];

// ─── Section: Profile ─────────────────────────────────────────────────────────

function ProfileSection() {
  const { user, setAuth } = useAuthStore();
  const { data, isLoading } = useQuery<ProfileData>({
    queryKey: ['settings', 'profile'],
    queryFn: () => api.get('/settings/profile').then((r) => r.data.data),
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
      const updated = res.data.data as ProfileData;
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

  const { data, isLoading } = useQuery<NotificationPrefs>({
    queryKey: ['settings', 'notifications'],
    queryFn: () => api.get('/settings/notifications').then((r) => r.data.data),
  });

  useEffect(() => {
    if (data) setPrefs(data);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: (updated: NotificationPrefs) => api.put('/settings/notifications', updated),
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
    queryFn: () => api.get('/settings/household').then((r) => r.data.data),
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
              const isCurrentUser = member.id === data?.currentUserId;
              return (
                <div
                  key={member.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.625rem 0',
                    borderBottom: '1px solid var(--color-border)',
                  }}
                >
                  <Avatar src={member.avatarUrl} name={member.name} size="sm" />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text)' }}>
                      {member.name}{isCurrentUser && <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}> (You)</span>}
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
                  {data?.isOwner && !isCurrentUser && (
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
          Remove <strong>{removeTarget?.name}</strong> from the household?
        </p>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setRemoveTarget(null)}>Cancel</Button>
          <Button
            variant="danger"
            loading={removeMutation.isPending}
            onClick={() => removeTarget && removeMutation.mutate(removeTarget.id)}
          >
            Remove
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

// ─── Section: Categories ──────────────────────────────────────────────────────

interface CategoryModalState {
  mode: 'add' | 'edit';
  category?: Category;
}

function CategoriesSection() {
  const queryClient = useQueryClient();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [modal, setModal] = useState<CategoryModalState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);

  // Modal form state
  const [catName, setCatName] = useState('');
  const [catEmoji, setCatEmoji] = useState('');
  const [catGroup, setCatGroup] = useState('');
  const [catError, setCatError] = useState('');

  const { data, isLoading } = useQuery<CategoriesData>({
    queryKey: ['settings', 'categories'],
    queryFn: () => api.get('/settings/categories').then((r) => r.data.data),
  });

  function openAdd(group?: string) {
    setCatName('');
    setCatEmoji('');
    setCatGroup(group ?? '');
    setCatError('');
    setModal({ mode: 'add' });
  }

  function openEdit(cat: Category) {
    setCatName(cat.name);
    setCatEmoji(cat.emoji);
    setCatGroup(cat.group);
    setCatError('');
    setModal({ mode: 'edit', category: cat });
  }

  function closeModal() {
    setModal(null);
    setCatError('');
  }

  const createMutation = useMutation({
    mutationFn: () => api.post('/settings/categories', { name: catName, emoji: catEmoji, group: catGroup }),
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
    mutationFn: () =>
      api.put(`/settings/categories/${modal?.category?.id}`, { name: catName, emoji: catEmoji, group: catGroup }),
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
        <SectionHeader title="Categories" description="Manage transaction categories." inline />
        <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={() => openAdd()}>
          Add category
        </Button>
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
                  {group.categories.map((cat, idx) => (
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
                      <span style={{ fontSize: '1rem' }}>{cat.emoji}</span>
                      <span style={{ flex: 1, fontSize: '0.875rem', color: 'var(--color-text)' }}>
                        {cat.name}
                      </span>
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
                  ))}
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
          <Input
            label="Emoji"
            value={catEmoji}
            onChange={(e) => setCatEmoji(e.target.value.slice(0, 2))}
            placeholder="🛒"
            maxLength={2}
          />
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

// ─── Section: Data ────────────────────────────────────────────────────────────

function DataSection() {
  const [cleanStartDate, setCleanStartDate] = useState('');
  const [deleteHistoryModalOpen, setDeleteHistoryModalOpen] = useState(false);

  function handleDownload(type: 'transactions' | 'balances') {
    notify.info('Export started — file will download shortly (not implemented in demo)');
  }

  function handleDeleteHistory() {
    setDeleteHistoryModalOpen(false);
    notify.info('History deletion not implemented in demo');
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
              <Button variant="secondary" size="sm" onClick={() => handleDownload('transactions')}>
                Download CSV
              </Button>
            </div>
            <div style={{ height: 1, backgroundColor: 'var(--color-border)' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text)' }}>Account Balances</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Download account balance history as CSV</div>
              </div>
              <Button variant="secondary" size="sm" onClick={() => handleDownload('balances')}>
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
          <Button variant="danger" onClick={handleDeleteHistory}>Delete history</Button>
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
