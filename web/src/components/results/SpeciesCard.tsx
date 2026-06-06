import { useEffect, useRef } from 'react'
import { Bird } from 'lucide-react'
import { animateProbabilityBar } from '../../lib/animations'
import { formatProbability } from '../../lib/formatSpecies'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import type { PredictionItem } from '../../types/prediction'

interface SpeciesCardProps {
  prediction: PredictionItem
  isTop?: boolean
}

export function SpeciesCard({ prediction, isTop = false }: SpeciesCardProps) {
  const barRef = useRef<HTMLDivElement>(null)
  const reducedMotion = useReducedMotion()
  const percent = Math.round(prediction.probability * 100)

  useEffect(() => {
    if (!barRef.current) return undefined
    const cleanup = animateProbabilityBar(barRef.current, percent, reducedMotion)
    return () => cleanup?.()
  }, [percent, reducedMotion])

  return (
    <article
      className={`result-card rounded-2xl border p-4 transition-colors duration-200 sm:p-5 ${
        isTop
          ? 'border-primary/30 bg-primary/5 shadow-md shadow-primary/10'
          : 'border-border bg-card'
      }`}
    >
      <div className="flex items-start gap-4">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
            isTop ? 'bg-primary text-on-primary' : 'bg-muted text-primary'
          }`}
        >
          {isTop ? (
            <span className="font-heading text-lg font-bold">1</span>
          ) : (
            <span className="font-medium">{prediction.rank}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Bird
              className={`h-4 w-4 shrink-0 ${isTop ? 'text-primary' : 'text-foreground/40'}`}
              aria-hidden="true"
            />
            <h3
              className={`truncate font-heading italic ${
                isTop ? 'text-xl font-semibold text-foreground' : 'text-lg text-foreground/90'
              }`}
            >
              {prediction.display_name}
            </h3>
          </div>
          <p className="mt-1 text-xs text-foreground/50">{prediction.species}</p>

          <div className="mt-3 flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                ref={barRef}
                className={`h-full rounded-full ${isTop ? 'bg-primary' : 'bg-secondary'}`}
                style={reducedMotion ? { width: `${percent}%` } : { width: '0%' }}
              />
            </div>
            <span className="w-12 text-right text-sm font-semibold tabular-nums text-foreground">
              {formatProbability(prediction.probability)}
            </span>
          </div>
        </div>
      </div>
    </article>
  )
}
