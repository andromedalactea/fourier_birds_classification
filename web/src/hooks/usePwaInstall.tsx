import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

interface PwaInstallContextValue {
  canInstall: boolean
  showIosHint: boolean
  showDesktopHint: boolean
  isStandalone: boolean
  install: () => Promise<boolean>
}

const PwaInstallContext = createContext<PwaInstallContextValue | null>(null)

const INSTALL_AVAILABLE_EVENT = 'pwa-install-available'

let capturedPrompt: BeforeInstallPromptEvent | null = null

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    capturedPrompt = event as BeforeInstallPromptEvent
    window.dispatchEvent(new Event(INSTALL_AVAILABLE_EVENT))
  })

  window.addEventListener('appinstalled', () => {
    capturedPrompt = null
  })
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

function isAndroid(): boolean {
  if (typeof navigator === 'undefined') return false
  return /android/i.test(navigator.userAgent)
}

function isDesktopBrowser(): boolean {
  return !isIos() && !isAndroid()
}

function isInStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in navigator &&
      (navigator as Navigator & { standalone?: boolean }).standalone === true)
  )
}

export function PwaInstallProvider({ children }: { children: ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(
    capturedPrompt,
  )
  const [isStandalone, setIsStandalone] = useState(isInStandaloneMode)

  useEffect(() => {
    if (capturedPrompt) {
      setDeferredPrompt(capturedPrompt)
    }

    const onInstallAvailable = () => {
      if (capturedPrompt) {
        setDeferredPrompt(capturedPrompt)
      }
    }

    const onAppInstalled = () => {
      capturedPrompt = null
      setDeferredPrompt(null)
      setIsStandalone(true)
    }

    window.addEventListener(INSTALL_AVAILABLE_EVENT, onInstallAvailable)
    window.addEventListener('appinstalled', onAppInstalled)

    const media = window.matchMedia('(display-mode: standalone)')
    const onDisplayChange = () => setIsStandalone(isInStandaloneMode())
    media.addEventListener('change', onDisplayChange)

    return () => {
      window.removeEventListener(INSTALL_AVAILABLE_EVENT, onInstallAvailable)
      window.removeEventListener('appinstalled', onAppInstalled)
      media.removeEventListener('change', onDisplayChange)
    }
  }, [])

  const install = useCallback(async () => {
    const prompt = deferredPrompt ?? capturedPrompt
    if (!prompt) return false

    await prompt.prompt()
    const { outcome } = await prompt.userChoice
    capturedPrompt = null
    setDeferredPrompt(null)

    if (outcome === 'accepted') {
      setIsStandalone(isInStandaloneMode())
    }

    return outcome === 'accepted'
  }, [deferredPrompt])

  const showIosHint = isIos() && !isStandalone && !deferredPrompt
  const showDesktopHint =
    isDesktopBrowser() && !isStandalone && !deferredPrompt

  const value = useMemo(
    () => ({
      canInstall: Boolean(deferredPrompt) && !isStandalone,
      showIosHint,
      showDesktopHint,
      isStandalone,
      install,
    }),
    [deferredPrompt, isStandalone, showIosHint, showDesktopHint, install],
  )

  return <PwaInstallContext.Provider value={value}>{children}</PwaInstallContext.Provider>
}

export function usePwaInstall(): PwaInstallContextValue {
  const context = useContext(PwaInstallContext)
  if (!context) {
    throw new Error('usePwaInstall must be used within PwaInstallProvider')
  }
  return context
}
