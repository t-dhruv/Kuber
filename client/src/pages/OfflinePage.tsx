import { WifiOff, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui';

export default function OfflinePage() {
  return (
    <main className="min-h-[100dvh] flex flex-col items-center justify-center bg-[var(--color-bg)] text-[var(--color-text)] p-6 text-center">
      <div
        className="mb-6 flex h-16 w-16 items-center justify-center rounded-[var(--radius-xl)] bg-[var(--color-accent-light)] text-[var(--color-accent)]"
        aria-hidden="true"
      >
        <WifiOff className="w-7 h-7" />
      </div>
      <h1 className="kb-h1 text-balance">You're offline</h1>
      <p className="kb-body-sm mt-2 mb-8 max-w-[38ch] text-pretty">
        Check your connection and try again. Cached pages may still open, but new data needs the
        server.
      </p>
      <Button size="lg" icon={<RefreshCw className="w-4 h-4" />} onClick={() => window.location.reload()}>
        Try again
      </Button>
    </main>
  );
}
