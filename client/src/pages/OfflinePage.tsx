import { WifiOff, RefreshCw } from 'lucide-react';
import { getColorToken } from '@/lib/colors';

export default function OfflinePage() {
  const accentColor = getColorToken('accent');
  const accentHover = getColorToken('accent-hover');

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#0f172a] text-white p-6 text-center">
      <WifiOff className="w-16 h-16 mb-6" style={{ color: accentColor }} />
      <h1 className="text-2xl font-bold mb-2">You're offline</h1>
      <p className="text-slate-400 mb-8 max-w-sm">
        Check your connection and try again. Cached pages may still open, but new data needs the server.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="flex items-center gap-2 text-white font-medium px-6 py-3 rounded-lg transition-colors"
        style={{ backgroundColor: accentColor }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = accentHover)}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = accentColor)}
      >
        <RefreshCw className="w-4 h-4" />
        Try again
      </button>
    </div>
  );
}
