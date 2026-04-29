import { useState, useEffect, useRef } from 'react';
import { useLocation, NavLink, useNavigate } from 'react-router-dom';
import { Menu, Search, Bell, Settings, LogOut, User } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Avatar } from '../ui/Avatar';
import { Tooltip } from '../ui/Tooltip';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';
import { SearchModal } from '@/components/search';
import { NotificationDrawer } from '@/components/notifications/NotificationDrawer';

// ─── Types ────────────────────────────────────────────────────────────────────

interface NotificationsResponse {
  items: unknown[];
  unreadCount: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const routeLabels: Record<string, string> = {
  '/': 'Dashboard',
  '/accounts': 'Accounts',
  '/accounts/bulk-import': 'Bulk Import',
  '/transactions': 'Transactions',
  '/transactions/review': 'AI Review',
  '/import': 'Import',
  '/cash-flow': 'Cash Flow',
  '/reports': 'Reports',
  '/wealth': 'Wealth',
  '/budget': 'Budget',
  '/recurring': 'Recurring',
  '/goals': 'Goals',
  '/investments': 'Investments',
  '/rules': 'Rules',
  '/advice': 'AI Advisor',
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

// ─── Header ───────────────────────────────────────────────────────────────────

export function Header({ onToggleSidebar }: HeaderProps) {
  const location = useLocation();
  const { user, clearAuth } = useAuthStore();
  const navigate = useNavigate();
  const pageLabel = getPageLabel(location.pathname);
  const [notifOpen, setNotifOpen] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const handleLogout = () => {
    clearAuth();
    navigate('/login');
  };

  // Close user menu on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    if (userMenuOpen) {
      document.addEventListener('mousedown', handler);
    }
    return () => document.removeEventListener('mousedown', handler);
  }, [userMenuOpen]);

  // Fetch unread count via the notifications list query (shared with drawer)
  const { data: notifData } = useQuery<NotificationsResponse>({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications').then((r) => r.data),
    refetchInterval: 60_000,
  });

  const unreadCount = notifData?.unreadCount ?? 0;

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
          <Tooltip content="Notifications" placement="bottom">
            <button
              onClick={() => setNotifOpen(true)}
              className="relative p-2 rounded-[var(--radius-md)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] transition-colors focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
              aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full border border-[var(--color-danger)] text-[10px] font-bold text-[var(--color-danger)] leading-none">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          </Tooltip>
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

          {/* User avatar + dropdown menu */}
          <div className="ml-1 relative" ref={userMenuRef}>
            <Tooltip content="Account" placement="bottom" disabled={userMenuOpen}>
              <button
                onClick={() => setUserMenuOpen((v) => !v)}
                className="rounded-full focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
                aria-label="Open user menu"
                aria-expanded={userMenuOpen}
              >
                <Avatar
                  name={user ? `${user.firstName} ${user.lastName}` : 'User'}
                  size="sm"
                  className="cursor-pointer"
                />
              </button>
            </Tooltip>

            {/* Dropdown */}
            {userMenuOpen && (
              <div
                className="absolute right-0 top-full mt-2 w-52 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-lg)] z-50 overflow-hidden"
                role="menu"
              >
                {/* User info */}
                <div className="px-4 py-3 border-b border-[var(--color-border)]">
                  <p className="text-sm font-semibold text-[var(--color-text)] truncate">
                    {user ? `${user.firstName} ${user.lastName}` : 'User'}
                  </p>
                  <p className="text-xs text-[var(--color-text-muted)] truncate mt-0.5">
                    {user?.email ?? ''}
                  </p>
                </div>

                {/* Menu items */}
                <div className="py-1">
                  <NavLink
                    to="/settings"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] transition-colors"
                    role="menuitem"
                  >
                    <User size={14} />
                    Profile &amp; Settings
                  </NavLink>

                  <button
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 transition-colors"
                    role="menuitem"
                  >
                    <LogOut size={14} />
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Global search modal */}
      <SearchModal open={showSearch} onClose={() => setShowSearch(false)} />

      {/* Notification drawer — rendered outside header flex to avoid layout interference */}
      <NotificationDrawer open={notifOpen} onClose={() => setNotifOpen(false)} />
    </>
  );
}
