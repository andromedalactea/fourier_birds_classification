import { Info } from 'lucide-react'
import { DeveloperCredits } from './DeveloperCredits'

export function Footer() {
  return (
    <footer className="mx-auto mt-16 max-w-6xl px-4 pb-10">
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="space-y-2 text-sm text-foreground/70">
            <p>
              Este modelo analiza los primeros <strong>12 segundos</strong> del audio
              usando transformadas de Fourier y características espectrales.
            </p>
            <p>
              Reconoce <strong>30 especies</strong> de la región entrenada en Colombia.
              Precisión aproximada: 60% (78% en top 3). Usa el botón{' '}
              <strong>Ver especies</strong> en la cabecera para consultar el catálogo completo.
            </p>
            <p className="text-xs text-foreground/50">
              Datos de entrenamiento: Xeno-Canto · Modelo: ExtraTreesClassifier
            </p>
          </div>
        </div>

        <DeveloperCredits />
      </div>
    </footer>
  )
}
