import { Download, Share, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '../ui/Button'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in navigator && (navigator as Navigator & { standalone?: boolean }).standalone === true)
  )
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [showIosHint, setShowIosHint] = useState(false)

  useEffect(() => {
    if (isStandalone()) return

    const handler = (event: Event) => {
      event.preventDefault()
      setDeferredPrompt(event as BeforeInstallPromptEvent)
    }

    window.addEventListener('beforeinstallprompt', handler)
    if (isIos()) setShowIosHint(true)

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  if (dismissed || isStandalone()) return null
  if (!deferredPrompt && !showIosHint) return null

  const handleInstall = async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    await deferredPrompt.userChoice
    setDeferredPrompt(null)
  }

  return (
    <div className="mx-auto mb-6 flex w-full max-w-6xl flex-col gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        {showIosHint && !deferredPrompt ? (
          <Share className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        ) : (
          <Download className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        )}
        <div>
          <p className="font-medium text-foreground">Instalar en tu teléfono</p>
          <p className="text-sm text-foreground/70">
            {showIosHint && !deferredPrompt
              ? 'En Safari: Compartir → Añadir a pantalla de inicio'
              : 'Accede rápido desde tu pantalla de inicio, sin descargar desde la tienda.'}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {deferredPrompt ? (
          <Button size="sm" onClick={handleInstall}>
            Instalar app
          </Button>
        ) : null}
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="cursor-pointer rounded-lg p-2 text-foreground/50 transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Cerrar aviso de instalación"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
