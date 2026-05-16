import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  CreditCard,
  ArrowLeftRight,
  TrendingUp,
  BarChart2,
  PiggyBank,
  RefreshCw,
  Target,
  LineChart,
  Settings,
  ChevronLeft,
  ChevronRight,
  Coins,
  Zap,
  Layers,
  Upload,
  LogOut,
  CheckCheck,
} from 'lucide-react';
import { Avatar } from '../ui/Avatar';
import { Tooltip } from '../ui/Tooltip';
import { useAuthStore } from '@/stores/authStore';

const STORAGE_KEY = 'kuber-sidebar-collapsed';

interface NavItem {
  to: string;
  icon: React.ReactNode;
  label: string;
  badge?: number;
  end?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({ mobileOpen = false, onMobileClose }: SidebarProps) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const { user, clearAuth } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(collapsed));
      window.dispatchEvent(new CustomEvent('sidebar-collapse', { detail: collapsed }));
    } catch {
      // ignore
    }
  }, [collapsed]);

  const { data: autoCatStatus } = useQuery({
    queryKey: ['auto-categorize-status'],
    queryFn: () => api.get('/auto-categorize/status').then((r) => r.data),
    refetchInterval: 60_000,
    staleTime: 60_000,
    retry: false,
  });
  const reviewCount: number = autoCatStatus?.reviewCount ?? 0;

  const navGroups: NavGroup[] = [
    {
      label: 'Overview',
      items: [
        { to: '/', icon: <LayoutDashboard size={18} />, label: 'Dashboard', end: true },
      ],
    },
    {
      label: 'Money',
      items: [
        { to: '/accounts', icon: <CreditCard size={18} />, label: 'Accounts', end: true },
        { to: '/transactions', icon: <ArrowLeftRight size={18} />, label: 'Transactions', end: true },
        { to: '/transactions/review', icon: <CheckCheck size={18} />, label: 'AI Review', badge: reviewCount > 0 ? reviewCount : undefined },
        { to: '/import', icon: <Upload size={18} />, label: 'Import' },
      ],
    },
    {
      label: 'Insights',
      items: [
        { to: '/cash-flow', icon: <TrendingUp size={18} />, label: 'Cash Flow' },
        { to: '/reports', icon: <BarChart2 size={18} />, label: 'Reports' },
        { to: '/wealth', icon: <Layers size={18} />, label: 'Wealth' },
        { to: '/investments', icon: <LineChart size={18} />, label: 'Investments' },
      ],
    },
    {
      label: 'Planning',
      items: [
        { to: '/budget', icon: <PiggyBank size={18} />, label: 'Budget' },
        { to: '/recurring', icon: <RefreshCw size={18} />, label: 'Recurring' },
        { to: '/goals', icon: <Target size={18} />, label: 'Goals' },
      ],
    },
    {
      label: 'Automation',
      items: [
        { to: '/rules', icon: <Zap size={18} />, label: 'Rules' },
      ],
    },
  ];

  const handleLogout = () => {
    clearAuth();
    navigate('/login');
  };

  const handleNavClick = () => {
    // Close mobile drawer when a nav item is clicked
    onMobileClose?.();
  };

  const width = collapsed ? 'w-16' : 'w-64';

  // On mobile: hidden by default, slides in as drawer when mobileOpen
  // On desktop (md+): always visible, width controlled by collapsed state
  const mobileVisibility = mobileOpen
    ? 'translate-x-0'
    : '-translate-x-full md:translate-x-0';

  return (
    <aside
      id="mobile-sidebar"
      className={`fixed left-0 top-0 h-full ${width} flex flex-col bg-[var(--color-surface)] border-r border-[var(--color-border)] transition-all duration-200 z-30 ${mobileVisibility}`}
      aria-label="Main navigation"
      role={mobileOpen ? 'dialog' : undefined}
      aria-modal={mobileOpen ? true : undefined}
    >
      {/* Logo */}
      <div className="flex items-center h-14 px-4 border-b border-[var(--color-border)] flex-shrink-0">
        {collapsed ? (
          <div className="flex items-center justify-center w-full">
            <Coins size={22} className="text-[var(--color-accent)]" />
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Coins size={22} className="text-[var(--color-accent)]" />
            <span className="text-base font-bold text-[var(--color-text)]">Kuber</span>
          </div>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto py-2 flex flex-col px-2" aria-label="App navigation">
        {navGroups.map((group, gi) => (
          <div key={group.label} className={gi > 0 ? 'mt-1' : ''}>
            {!collapsed && (
              <div className="nav-section-label">{group.label}</div>
            )}
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => (
                <Tooltip
                  key={item.to}
                  content={item.label}
                  placement="right"
                  disabled={!collapsed}
                >
                  <NavLink
                    to={item.to}
                    end={item.to === '/' || !!item.end}
                    onClick={handleNavClick}
                    className={({ isActive }) =>
                      `relative flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-md)] text-sm font-medium transition-colors ${
                        collapsed ? 'justify-center' : ''
                      } ${
                        isActive
                          ? 'nav-item-active bg-[var(--color-accent-light)] text-[var(--color-accent)]'
                          : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]'
                      }`
                    }
                    aria-label={item.label}
                    title={item.label}
                  >
                    <span className="flex-shrink-0">{item.icon}</span>
                    {!collapsed && (
                      <span className="flex-1 flex items-center justify-between truncate">
                        <span className="truncate">{item.label}</span>
                        {item.badge !== undefined && (
                          <span className="ml-2 flex-shrink-0 text-xs font-bold bg-[var(--color-accent)] text-white rounded-full px-1.5 py-0.5 leading-none">
                            {item.badge > 99 ? '99+' : item.badge}
                          </span>
                        )}
                      </span>
                    )}
                    {collapsed && item.badge !== undefined && (
                      <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[var(--color-accent)]" />
                    )}
                  </NavLink>
                </Tooltip>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom section */}
      <div className="flex flex-col gap-1 px-2 pb-3 border-t border-[var(--color-border)] pt-3 flex-shrink-0">
        {/* User profile */}
        <div className={`flex items-center ${collapsed ? 'justify-center px-0' : 'gap-2 px-1'} py-2`}>
          <Tooltip content="Sign out" placement="right" disabled={!collapsed}>
            <Avatar
              name={user ? `${user.firstName} ${user.lastName}` : 'User'}
              size="sm"
              className="flex-shrink-0 cursor-pointer"
              onClick={handleLogout}
              title="Click to sign out"
            />
          </Tooltip>
          {!collapsed && (
            <div className="flex-1 min-w-0 flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[var(--color-text)] truncate">{user ? `${user.firstName} ${user.lastName}` : 'User'}</p>
                <p className="text-xs text-[var(--color-text-muted)] truncate">{user?.email ?? ''}</p>
              </div>
              <div className="flex items-center gap-0.5 flex-shrink-0">
                <Tooltip content="Settings" placement="top">
                  <NavLink
                    to="/settings"
                    className="p-1.5 rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] transition-colors"
                    aria-label="Settings"
                  >
                    <Settings size={14} />
                  </NavLink>
                </Tooltip>
                <Tooltip content="Sign out" placement="top">
                  <button
                    onClick={handleLogout}
                    className="p-1.5 rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:bg-[var(--color-danger)]/10 hover:text-[var(--color-danger)] transition-colors"
                    aria-label="Sign out"
                  >
                    <LogOut size={14} />
                  </button>
                </Tooltip>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="hidden md:flex absolute -right-3 top-16 h-6 w-6 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)] shadow-[var(--shadow-sm)] hover:text-[var(--color-text)] hover:shadow-[var(--shadow-md)] transition-all z-40"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>
    </aside>
  );
}
