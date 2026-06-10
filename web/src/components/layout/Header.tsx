import { Download, List } from 'lucide-react'
import { usePwaInstall } from '../../hooks/usePwaInstall.tsx'
import { AppLogo } from '../ui/AppLogo'
import { Button } from '../ui/Button'

interface HeaderProps {
  onOpenSpecies?: () => void
}

export function Header({ onOpenSpecies }: HeaderProps) {
  const { canInstall, showDesktopHint, install } = usePwaInstall()

  const handleInstall = async () => {
    const installed = await install()
    if (!installed && showDesktopHint) {
      document.getElementById('install-prompt')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  return (
    <header className="sticky top-4 z-50 mx-auto flex w-[calc(100%-2rem)] max-w-6xl items-center justify-between rounded-2xl border border-border bg-card/90 px-5 py-3 shadow-sm backdrop-blur-md">
      <div className="flex items-center gap-3">
        <AppLogo size={40} className="shrink-0 drop-shadow-sm" />
        <div>
          <p className="font-heading text-lg font-semibold leading-tight text-foreground">
            Aves Sonoras
          </p>
          <p className="text-xs text-foreground/60">Identificador de cantos</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {canInstall || showDesktopHint ? (
          <>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleInstall}
              className="hidden sm:inline-flex"
              aria-label="Instalar aplicación"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Instalar
            </Button>
            <button
              type="button"
              onClick={handleInstall}
              className="inline-flex cursor-pointer items-center justify-center rounded-full border border-primary/20 bg-primary/10 p-2 text-primary transition-colors duration-200 hover:border-primary/40 hover:bg-primary/15 sm:hidden"
              aria-label="Instalar aplicación"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
            </button>
          </>
        ) : null}

        {onOpenSpecies ? (
          <button
            type="button"
            onClick={onOpenSpecies}
            className="flex cursor-pointer items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-2 text-xs font-medium text-primary transition-colors duration-200 hover:border-primary/40 hover:bg-primary/15 sm:px-4 sm:text-sm"
            aria-label="Ver catálogo de especies identificables"
          >
            <List className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline">Ver especies</span>
            <span className="sm:hidden">30 aves</span>
          </button>
        ) : (
          <span className="hidden rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary sm:inline">
            30 especies · Colombia
          </span>
        )}
      </div>
    </header>
  )
}
