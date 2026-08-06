import { useState, useEffect } from 'react'
import { Download, X } from 'lucide-react'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISSED_KEY = 'pwa-install-dismissed'
const DISMISS_DURATION = 7 * 24 * 60 * 60 * 1000 // 7 days

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showIOSInstructions, setShowIOSInstructions] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const dismissed = localStorage.getItem(DISMISSED_KEY)
    if (dismissed && Date.now() - Number(dismissed) < DISMISS_DURATION) return

    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
    const isInStandaloneMode = window.matchMedia('(display-mode: standalone)').matches

    if (isInStandaloneMode) return // Already installed

    if (isIOS) {
      setShowIOSInstructions(true)
      setVisible(true)
      return
    }

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setVisible(true)
    }

    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') setVisible(false)
    setDeferredPrompt(null)
  }

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, String(Date.now()))
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="fixed bottom-20 md:bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-[var(--radius-xl)] shadow-[var(--shadow-lg)] p-4 z-50 flex items-start gap-3">
      <div className="flex-shrink-0 w-10 h-10 bg-[var(--color-accent)] rounded-[var(--radius-md)] flex items-center justify-center">
        <Download className="w-5 h-5 text-[var(--color-on-accent)]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[var(--color-text)]">Install Kuber</p>
        {showIOSInstructions ? (
          <p className="text-xs text-[var(--color-text-secondary)] mt-1">
            Tap <span className="font-medium text-[var(--color-text)]">Share</span> then{' '}
            <span className="font-medium text-[var(--color-text)]">Add to Home Screen</span> to install.
          </p>
        ) : (
          <>
            <p className="text-xs text-[var(--color-text-secondary)] mt-1">
              Install for quick access, even offline.
            </p>
            <button
              onClick={handleInstall}
              className="mt-2 text-xs bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-[var(--color-on-accent)] px-3 py-1.5 rounded-[var(--radius-md)] font-medium transition-colors duration-150 active:scale-[0.98]"
            >
              Install
            </button>
          </>
        )}
      </div>
      <button
        onClick={handleDismiss}
        aria-label="Dismiss install prompt"
        className="flex-shrink-0 text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors duration-150"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
