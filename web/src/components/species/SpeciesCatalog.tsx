import { Bird, MapPin, Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { animatePanelOpen, animateSpeciesItems } from '../../lib/animations'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { useSpecies } from '../../hooks/useSpecies'
import type { SpeciesItem } from '../../types/species'
import { Spinner } from '../ui/Spinner'

interface SpeciesCatalogProps {
  open: boolean
  onClose: () => void
}

function getGenus(species: string): string {
  return species.split('_')[0] ?? species
}

function getEpithet(species: string): string {
  const parts = species.split('_')
  return parts.slice(1).join(' ') || species
}

function groupByGenus(items: SpeciesItem[]): Map<string, SpeciesItem[]> {
  const groups = new Map<string, SpeciesItem[]>()
  for (const item of items) {
    const genus = getGenus(item.species)
    const list = groups.get(genus) ?? []
    list.push(item)
    groups.set(genus, list)
  }
  return new Map([...groups.entries()].sort(([a], [b]) => a.localeCompare(b)))
}

export function SpeciesCatalog({ open, onClose }: SpeciesCatalogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const reducedMotion = useReducedMotion()
  const { species, count, isLoading, error, reload } = useSpecies(open)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return species
    return species.filter(
      (item) =>
        item.species.toLowerCase().includes(q) ||
        item.display_name.toLowerCase().includes(q),
    )
  }, [species, query])

  const grouped = useMemo(() => groupByGenus(filtered), [filtered])

  useEffect(() => {
    if (!open) {
      setQuery('')
      return undefined
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    searchRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  useEffect(() => {
    if (!open || !panelRef.current) return undefined
    const cleanup = animatePanelOpen(panelRef.current, reducedMotion)
    return () => cleanup?.()
  }, [open, reducedMotion])

  useEffect(() => {
    if (!open || isLoading || filtered.length === 0) return undefined
    const cleanup = animateSpeciesItems('.species-item', reducedMotion)
    return () => cleanup?.()
  }, [open, isLoading, filtered, reducedMotion])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex justify-end" role="dialog" aria-modal="true" aria-labelledby="species-catalog-title">
      <button
        type="button"
        className="absolute inset-0 cursor-pointer bg-foreground/20 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-label="Cerrar catálogo de especies"
      />

      <div
        ref={panelRef}
        className="relative flex h-full w-full max-w-lg flex-col border-l border-border bg-background shadow-2xl sm:rounded-l-3xl"
      >
        <header className="shrink-0 border-b border-border bg-card/80 px-5 py-5 backdrop-blur-md sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-primary">
                Catálogo
              </p>
              <h2
                id="species-catalog-title"
                className="font-heading text-2xl font-bold text-foreground"
              >
                Especies identificables
              </h2>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-foreground/60">
                <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Región entrenada: Colombia
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-xl border border-border bg-card p-2.5 text-foreground/60 transition-colors duration-200 hover:border-primary/30 hover:text-foreground"
              aria-label="Cerrar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="relative mt-4">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/40"
              aria-hidden="true"
            />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre científico..."
              className="w-full rounded-2xl border border-border bg-muted/60 py-3 pl-10 pr-4 text-sm text-foreground outline-none transition-colors duration-200 placeholder:text-foreground/40 focus:border-primary/40 focus:bg-card focus:ring-2 focus:ring-primary/20"
              aria-label="Buscar especies"
            />
          </div>

          <p className="mt-3 text-xs text-foreground/50">
            {query
              ? `${filtered.length} de ${count} especies`
              : `${count} especies disponibles para identificación`}
          </p>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          {isLoading ? (
            <div className="flex justify-center py-16">
              <Spinner label="Cargando especies..." />
            </div>
          ) : null}

          {error ? (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-center">
              <p className="text-sm text-destructive">{error}</p>
              <button
                type="button"
                onClick={reload}
                className="mt-3 cursor-pointer text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                Reintentar
              </button>
            </div>
          ) : null}

          {!isLoading && !error && filtered.length === 0 ? (
            <div className="rounded-2xl border border-border bg-muted/50 px-4 py-10 text-center">
              <Bird className="mx-auto h-8 w-8 text-foreground/30" aria-hidden="true" />
              <p className="mt-3 font-medium text-foreground">Sin coincidencias</p>
              <p className="mt-1 text-sm text-foreground/60">
                Prueba con el género, por ejemplo{' '}
                <button
                  type="button"
                  onClick={() => setQuery('Colibri')}
                  className="cursor-pointer font-medium text-primary underline-offset-2 hover:underline"
                >
                  Colibri
                </button>{' '}
                o{' '}
                <button
                  type="button"
                  onClick={() => setQuery('Grallaria')}
                  className="cursor-pointer font-medium text-primary underline-offset-2 hover:underline"
                >
                  Grallaria
                </button>
              </p>
            </div>
          ) : null}

          {!isLoading && !error && filtered.length > 0 ? (
            <div className="space-y-6 pb-6">
              {[...grouped.entries()].map(([genus, items]) => (
                <section key={genus}>
                  <h3 className="mb-3 flex items-center gap-2 font-heading text-sm font-semibold uppercase tracking-wide text-primary">
                    <span className="h-px flex-1 bg-border" aria-hidden="true" />
                    {genus}
                    <span className="h-px flex-1 bg-border" aria-hidden="true" />
                  </h3>
                  <ul className="space-y-2">
                    {items.map((item) => (
                      <li key={item.species}>
                        <div className="species-item flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 transition-colors duration-200 hover:border-primary/25 hover:bg-primary/5">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                            <Bird className="h-4 w-4" aria-hidden="true" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-heading text-base italic text-foreground">
                              <span className="not-italic font-semibold">{genus}</span>{' '}
                              {getEpithet(item.species)}
                            </p>
                            <p className="truncate text-xs text-foreground/50">
                              {item.species}
                            </p>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
