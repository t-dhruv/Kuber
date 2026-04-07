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
    <div className="fixed bottom-20 md:bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl p-4 z-50 flex items-start gap-3">
      <div className="flex-shrink-0 w-10 h-10 bg-[#E5622A] rounded-lg flex items-center justify-center">
        <Download className="w-5 h-5 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white">Install Kuber</p>
        {showIOSInstructions ? (
          <p className="text-xs text-slate-400 mt-1">
            Tap <span className="text-white">Share</span> then{' '}
            <span className="text-white">Add to Home Screen</span> to install.
          </p>
        ) : (
          <>
            <p className="text-xs text-slate-400 mt-1">Install for quick access, even offline.</p>
            <button
              onClick={handleInstall}
              className="mt-2 text-xs bg-[#E5622A] hover:bg-[#d4531e] text-white px-3 py-1.5 rounded-md font-medium transition-colors"
            >
              Install
            </button>
          </>
        )}
      </div>
      <button onClick={handleDismiss} className="flex-shrink-0 text-slate-400 hover:text-white transition-colors">
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
