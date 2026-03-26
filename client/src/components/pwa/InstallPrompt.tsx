/**
 * InstallPrompt.tsx
 * Shows a "Add to Home Screen" banner when the PWA install prompt is available.
 * Dismissable, persists dismissal in localStorage.
 */
import { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem('pwa-install-dismissed') === '1');

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  async function handleInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setDeferredPrompt(null);
  }

  function handleDismiss() {
    localStorage.setItem('pwa-install-dismissed', '1');
    setDismissed(true);
  }

  if (!deferredPrompt || dismissed) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 z-50 bg-[color:var(--surface)] border border-[color:var(--border)] rounded-xl shadow-xl p-4 flex items-start gap-3">
      <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/40 rounded-lg flex items-center justify-center shrink-0">
        <Download size={20} className="text-indigo-600 dark:text-indigo-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm">Install Kuber</p>
        <p className="text-xs text-[color:var(--text-secondary)] mt-0.5">Add to your home screen for quick access</p>
        <button
          onClick={handleInstall}
          className="mt-2 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
        >
          Install app
        </button>
      </div>
      <button onClick={handleDismiss} className="p-0.5 text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]">
        <X size={16} />
      </button>
    </div>
  );
}
