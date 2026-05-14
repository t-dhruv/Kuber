import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

export default function OfflineStatus() {
  const [online, setOnline] = useState(() => (
    typeof navigator === 'undefined' ? true : navigator.onLine
  ));

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-[var(--z-toast)] flex -translate-x-1/2 items-center gap-2 rounded-[var(--radius-full)] border border-[var(--color-warning)] bg-[var(--color-warning-light)] px-4 py-2 text-sm font-medium text-[var(--color-text)] shadow-[var(--shadow-md)]">
      <WifiOff size={16} />
      Offline. Cached pages may still open, but changes need a connection.
    </div>
  );
}
