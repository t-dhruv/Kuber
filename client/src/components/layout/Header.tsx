import { useState, useEffect } from 'react';
import { useLocation, NavLink } from 'react-router-dom';
import { Menu, Search, Bell, Settings } from 'lucide-react';
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
  '/transactions': 'Transactions',
  '/cash-flow': 'Cash Flow',
  '/reports': 'Reports',
  '/wealth': 'Wealth',
  '/budget': 'Budget',
  '/recurring': 'Recurring',
  '/goals': 'Goals',
  '/investments': 'Investments',
  '/rules': 'Rules',
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

// ─── Header ───────────────────────────────────────────────────────────────────

export function Header({ onToggleSidebar }: HeaderProps) {
  const location = useLocation();
  const { user } = useAuthStore();
  const pageLabel = getPageLabel(location.pathname);
  const [notifOpen, setNotifOpen] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

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
                <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-danger)] text-[10px] font-bold text-white leading-none">
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

      {/* Notification drawer — rendered outside header flex to avoid layout interference */}
      <NotificationDrawer open={notifOpen} onClose={() => setNotifOpen(false)} />
    </>
  );
}
