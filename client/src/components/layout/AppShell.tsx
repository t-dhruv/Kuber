import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

const STORAGE_KEY = 'kuber-sidebar-collapsed';

export function AppShell() {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  // Keep in sync when sidebar toggles itself (via its own button)
  useEffect(() => {
    const handler = () => {
      try {
        setCollapsed(localStorage.getItem(STORAGE_KEY) === 'true');
      } catch {
        // ignore
      }
    };
    window.addEventListener('storage', handler);
    // Poll localStorage since same-tab writes don't trigger storage event
    const interval = setInterval(handler, 150);
    return () => {
      window.removeEventListener('storage', handler);
      clearInterval(interval);
    };
  }, []);

  const sidebarWidth = collapsed ? 'pl-16' : 'pl-64';

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <Sidebar />
      <div className={`flex flex-col min-h-screen transition-all duration-200 ${sidebarWidth}`}>
        <Header
          onToggleSidebar={() => {
            const next = !collapsed;
            setCollapsed(next);
            try {
              localStorage.setItem(STORAGE_KEY, String(next));
            } catch {
              // ignore
            }
          }}
        />
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
