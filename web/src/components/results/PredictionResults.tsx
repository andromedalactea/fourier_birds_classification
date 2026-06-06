import { Sparkles } from 'lucide-react'
import { useEffect } from 'react'
import { animateResultsCards } from '../../lib/animations'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import type { PredictionResponse } from '../../types/prediction'
import { SpeciesCard } from './SpeciesCard'

interface PredictionResultsProps {
  result: PredictionResponse
  onNewSearch: () => void
}

export function PredictionResults({ result, onNewSearch }: PredictionResultsProps) {
  const reducedMotion = useReducedMotion()
  const top = result.predictions[0]

  useEffect(() => {
    const cleanup = animateResultsCards('.result-card', reducedMotion)
    return () => cleanup?.()
  }, [result, reducedMotion])

  return (
    <section className="space-y-5" aria-live="polite">
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 sm:p-6">
        <div className="flex items-center gap-2 text-primary">
          <Sparkles className="h-5 w-5" aria-hidden="true" />
          <p className="text-sm font-medium uppercase tracking-wide">Resultado principal</p>
        </div>
        {top ? (
          <div className="mt-3">
            <h2 className="font-heading text-2xl font-bold italic text-foreground sm:text-3xl">
              {top.display_name}
            </h2>
            <p className="mt-1 text-foreground/60">
              Probabilidad: {Math.round(top.probability * 100)}%
            </p>
          </div>
        ) : null}
      </div>

      <div className="space-y-3">
        <h3 className="font-heading text-lg font-semibold text-foreground">
          Top {result.predictions.length} candidatos
        </h3>
        {result.predictions.map((prediction) => (
          <SpeciesCard
            key={prediction.species}
            prediction={prediction}
            isTop={prediction.rank === 1}
          />
        ))}
      </div>

      <p className="text-center text-xs text-foreground/50">
        Analizado: primeros {result.meta.clip_seconds}s a {result.meta.sample_rate / 1000} kHz
      </p>

      <div className="flex justify-center pt-2">
        <button
          type="button"
          onClick={onNewSearch}
          className="cursor-pointer text-sm font-medium text-primary underline-offset-4 transition-colors hover:underline"
        >
          Nueva identificación
        </button>
      </div>
    </section>
  )
}
