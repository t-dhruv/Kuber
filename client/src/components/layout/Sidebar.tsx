import { useState, useEffect } from 'react';
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
  Sparkles,
  Settings,
  ChevronLeft,
  ChevronRight,
  Coins,
  Zap,
} from 'lucide-react';
import { Avatar } from '../ui/Avatar';
import { Tooltip } from '../ui/Tooltip';
import { useAuthStore } from '@/stores/authStore';

const STORAGE_KEY = 'kuber-sidebar-collapsed';

interface NavItem {
  to: string;
  icon: React.ReactNode;
  label: string;
}

const navItems: NavItem[] = [
  { to: '/', icon: <LayoutDashboard size={18} />, label: 'Dashboard' },
  { to: '/accounts', icon: <CreditCard size={18} />, label: 'Accounts' },
  { to: '/transactions', icon: <ArrowLeftRight size={18} />, label: 'Transactions' },
  { to: '/cash-flow', icon: <TrendingUp size={18} />, label: 'Cash Flow' },
  { to: '/reports', icon: <BarChart2 size={18} />, label: 'Reports' },
  { to: '/budget', icon: <PiggyBank size={18} />, label: 'Budget' },
  { to: '/recurring', icon: <RefreshCw size={18} />, label: 'Recurring' },
  { to: '/goals', icon: <Target size={18} />, label: 'Goals' },
  { to: '/investments', icon: <LineChart size={18} />, label: 'Investments' },
  { to: '/rules', icon: <Zap size={18} />, label: 'Rules' },
  { to: '/advice', icon: <Sparkles size={18} />, label: 'Advice' },
];

export function Sidebar() {
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
    } catch {
      // ignore
    }
  }, [collapsed]);

  const handleLogout = () => {
    clearAuth();
    navigate('/login');
  };

  const width = collapsed ? 'w-16' : 'w-64';

  return (
    <aside
      className={`fixed left-0 top-0 h-full ${width} flex flex-col bg-[var(--color-surface)] border-r border-[var(--color-border)] transition-all duration-200 z-30`}
      aria-label="Main navigation"
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
      <nav className="flex-1 overflow-y-auto py-3 flex flex-col gap-0.5 px-2" aria-label="App navigation">
        {navItems.map((item) => (
          <Tooltip
            key={item.to}
            content={item.label}
            placement="right"
            disabled={!collapsed}
          >
            <NavLink
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-md)] text-sm font-medium transition-colors ${
                  collapsed ? 'justify-center' : ''
                } ${
                  isActive
                    ? 'bg-[var(--color-accent-light)] text-[var(--color-accent)]'
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]'
                }`
              }
              aria-label={collapsed ? item.label : undefined}
            >
              <span className="flex-shrink-0">{item.icon}</span>
              {!collapsed && <span className="truncate">{item.label}</span>}
            </NavLink>
          </Tooltip>
        ))}
      </nav>

      {/* Bottom section */}
      <div className="flex flex-col gap-1 px-2 pb-3 border-t border-[var(--color-border)] pt-3 flex-shrink-0">
        {/* AI Assistant */}
        <Tooltip content="AI Assistant" placement="right" disabled={!collapsed}>
          <NavLink
            to="/advice"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-md)] text-sm font-medium transition-colors ${
                collapsed ? 'justify-center' : ''
              } ${
                isActive
                  ? 'bg-[var(--color-accent-light)] text-[var(--color-accent)]'
                  : 'bg-gradient-to-r from-[var(--color-accent-light)] to-transparent text-[var(--color-accent)] hover:opacity-80'
              }`
            }
          >
            <Sparkles size={18} className="flex-shrink-0" />
            {!collapsed && <span className="truncate">AI Assistant</span>}
          </NavLink>
        </Tooltip>

        {/* User profile */}
        <div className={`flex items-center ${collapsed ? 'justify-center px-0' : 'gap-2 px-1'} py-2`}>
          <Avatar
            name={user ? `${user.firstName} ${user.lastName}` : 'User'}
            size="sm"
            className="flex-shrink-0 cursor-pointer"
            onClick={handleLogout}
            title="Click to sign out"
          />
          {!collapsed && (
            <div className="flex-1 min-w-0 flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[var(--color-text)] truncate">{user ? `${user.firstName} ${user.lastName}` : 'User'}</p>
                <p className="text-xs text-[var(--color-text-muted)] truncate">{user?.email ?? ''}</p>
              </div>
              <Tooltip content="Settings" placement="top">
                <NavLink
                  to="/settings"
                  className="p-1.5 rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] transition-colors flex-shrink-0"
                  aria-label="Settings"
                >
                  <Settings size={14} />
                </NavLink>
              </Tooltip>
            </div>
          )}
        </div>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="absolute -right-3 top-16 flex h-6 w-6 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)] shadow-[var(--shadow-sm)] hover:text-[var(--color-text)] hover:shadow-[var(--shadow-md)] transition-all z-40"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>
    </aside>
  );
}
