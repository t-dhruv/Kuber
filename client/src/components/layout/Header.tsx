import { useState, useEffect, useRef } from 'react';
import { useLocation, NavLink } from 'react-router-dom';
import { Menu, Search, Bell, Settings } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Avatar } from '../ui/Avatar';
import { Tooltip } from '../ui/Tooltip';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';
import { SearchModal } from '@/components/search';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Notification {
  id: string;
  title: string;
  body: string;
  icon?: string;
  read: boolean;
  createdAt: string;
}

interface NotificationCount {
  unread: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return mins <= 1 ? 'just now' : `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const routeLabels: Record<string, string> = {
  '/': 'Dashboard',
  '/accounts': 'Accounts',
  '/transactions': 'Transactions',
  '/cash-flow': 'Cash Flow',
  '/reports': 'Reports',
  '/budget': 'Budget',
  '/recurring': 'Recurring',
  '/goals': 'Goals',
  '/investments': 'Investments',
  '/advice': 'AI Advice',
  '/settings': 'Settings',
};

function getPageLabel(pathname: string): string {
  if (routeLabels[pathname]) return routeLabels[pathname];
  const match = Object.keys(routeLabels).find((k) => k !== '/' && pathname.startsWith(k));
  return match ? routeLabels[match] : 'Kuber';
}

interface HeaderProps {
  onToggleSidebar?: () => void;
}

// ─── Notifications dropdown ───────────────────────────────────────────────────

function NotificationsDropdown({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();

  const { data: notifData } = useQuery<Notification[]>({
    queryKey: ['notifications'],
    queryFn: () =>
      api.get('/notifications?limit=10').then((r) => r.data.data ?? r.data),
    refetchInterval: 30_000,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => api.put(`/notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-count'] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => api.put('/notifications/read-all'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-count'] });
    },
  });

  const notifications = notifData ?? [];

  return (
    <div
      style={{
        position: 'absolute',
        top: 'calc(100% + 0.5rem)',
        right: 0,
        width: 280,
        maxHeight: 400,
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-lg)',
        zIndex: 500,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.75rem 1rem',
          borderBottom: '1px solid var(--color-border)',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)' }}>
          Notifications
        </span>
        <button
          onClick={() => markAllReadMutation.mutate()}
          disabled={markAllReadMutation.isPending}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '0.75rem',
            color: 'var(--color-accent)',
            fontWeight: 500,
            padding: 0,
          }}
        >
          Mark all read
        </button>
      </div>

      {/* List */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {notifications.length === 0 ? (
          <div
            style={{
              padding: '2rem 1rem',
              textAlign: 'center',
              color: 'var(--color-text-muted)',
              fontSize: '0.875rem',
            }}
          >
            No notifications
          </div>
        ) : (
          notifications.map((notif) => (
            <div
              key={notif.id}
              onClick={() => {
                if (!notif.read) markReadMutation.mutate(notif.id);
              }}
              style={{
                display: 'flex',
                gap: '0.625rem',
                padding: '0.75rem 1rem',
                cursor: notif.read ? 'default' : 'pointer',
                backgroundColor: notif.read ? 'transparent' : 'var(--color-accent-light)',
                borderBottom: '1px solid var(--color-border)',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => {
                if (!notif.read)
                  e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)';
              }}
              onMouseLeave={(e) => {
                if (!notif.read)
                  e.currentTarget.style.backgroundColor = 'var(--color-accent-light)';
              }}
            >
              {/* Unread dot */}
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: notif.read ? 'transparent' : 'var(--color-accent)',
                  marginTop: '0.375rem',
                  flexShrink: 0,
                }}
              />

              {/* Icon + text */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: 'flex',
                    gap: '0.375rem',
                    alignItems: 'flex-start',
                    marginBottom: '0.125rem',
                  }}
                >
                  {notif.icon && (
                    <span style={{ fontSize: '0.875rem', flexShrink: 0 }}>{notif.icon}</span>
                  )}
                  <span
                    style={{
                      fontSize: '0.8125rem',
                      fontWeight: notif.read ? 400 : 600,
                      color: 'var(--color-text)',
                      lineHeight: 1.4,
                    }}
                  >
                    {notif.title}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--color-text-secondary)',
                    lineHeight: 1.4,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {notif.body}
                </div>
                <div
                  style={{
                    fontSize: '0.6875rem',
                    color: 'var(--color-text-muted)',
                    marginTop: '0.25rem',
                  }}
                >
                  {fmtRelative(notif.createdAt)}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: '0.5rem 1rem',
          borderTop: '1px solid var(--color-border)',
          flexShrink: 0,
        }}
      >
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '0.8125rem',
            color: 'var(--color-accent)',
            fontWeight: 500,
            width: '100%',
            textAlign: 'center',
            padding: '0.25rem 0',
          }}
        >
          View all notifications →
        </button>
      </div>
    </div>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────────

export function Header({ onToggleSidebar }: HeaderProps) {
  const location = useLocation();
  const { user } = useAuthStore();
  const pageLabel = getPageLabel(location.pathname);
  const [showNotifs, setShowNotifs] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const notifsRef = useRef<HTMLDivElement>(null);

  // Fetch unread count (poll every 30s)
  const { data: countData } = useQuery<NotificationCount>({
    queryKey: ['notifications-count'],
    queryFn: () => api.get('/notifications/count').then((r) => r.data.data ?? r.data),
    refetchInterval: 30_000,
  });

  const unreadCount = countData?.unread ?? 0;

  // Close notifications on click-outside
  useEffect(() => {
    if (!showNotifs) return;
    function handler(e: MouseEvent) {
      if (notifsRef.current && !notifsRef.current.contains(e.target as Node)) {
        setShowNotifs(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showNotifs]);

  // Global Cmd+K / Ctrl+K
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowSearch(true);
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <>
      <header className="h-14 flex items-center justify-between gap-4 px-4 border-b border-[var(--color-border)] bg-[var(--color-surface)] flex-shrink-0">
        {/* Left: sidebar toggle + breadcrumb */}
        <div className="flex items-center gap-3">
          {onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              className="p-2 rounded-[var(--radius-md)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] transition-colors focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
              aria-label="Toggle sidebar"
            >
              <Menu size={18} />
            </button>
          )}
          <nav aria-label="Breadcrumb">
            <ol className="flex items-center gap-1.5 text-sm">
              <li className="text-[var(--color-text-muted)] hidden sm:block">Kuber</li>
              <li className="text-[var(--color-text-muted)] hidden sm:block" aria-hidden="true">/</li>
              <li className="font-semibold text-[var(--color-text)]">{pageLabel}</li>
            </ol>
          </nav>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-1">
          {/* Search */}
          <Tooltip content="Search (Cmd+K)" placement="bottom">
            <button
              onClick={() => setShowSearch(true)}
              className="p-2 rounded-[var(--radius-md)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] transition-colors focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
              aria-label="Search"
            >
              <Search size={18} />
            </button>
          </Tooltip>

          {/* Notifications */}
          <div ref={notifsRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setShowNotifs((v) => !v)}
              className="relative p-2 rounded-[var(--radius-md)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] transition-colors focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
              aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-danger)] text-[10px] font-bold text-white leading-none">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            {showNotifs && (
              <NotificationsDropdown onClose={() => setShowNotifs(false)} />
            )}
          </div>

          {/* Settings */}
          <Tooltip content="Settings" placement="bottom">
            <NavLink
              to="/settings"
              className="p-2 rounded-[var(--radius-md)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] transition-colors focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
              aria-label="Settings"
            >
              <Settings size={18} />
            </NavLink>
          </Tooltip>

          {/* User avatar */}
          <div className="ml-1">
            <Avatar
              name={user ? `${user.firstName} ${user.lastName}` : 'User'}
              size="sm"
              className="cursor-pointer"
            />
          </div>
        </div>
      </header>

      {/* Global search modal */}
      <SearchModal open={showSearch} onClose={() => setShowSearch(false)} />
    </>
  );
}
