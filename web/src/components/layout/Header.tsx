import { Bird } from 'lucide-react'

export function Header() {
  return (
    <header className="sticky top-4 z-50 mx-auto flex w-[calc(100%-2rem)] max-w-6xl items-center justify-between rounded-2xl border border-border bg-card/90 px-5 py-3 shadow-sm backdrop-blur-md">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Bird className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <p className="font-heading text-lg font-semibold leading-tight text-foreground">
            Aves Sonoras
          </p>
          <p className="text-xs text-foreground/60">Identificador de cantos</p>
        </div>
      </div>
      <span className="hidden rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary sm:inline">
        30 especies · Colombia
      </span>
    </header>
  )
}
