import { Mic, Square } from 'lucide-react'
import { formatDuration } from '../../lib/formatSpecies'
import { SoundRipple } from '../visual/SoundRipple'
import { Button } from '../ui/Button'

interface RecorderPanelProps {
  isRecording: boolean
  duration: number
  audioLevel: number
  error: string | null
  disabled?: boolean
  onStart: () => void
  onStop: () => void
}

export function RecorderPanel({
  isRecording,
  duration,
  audioLevel,
  error,
  disabled = false,
  onStart,
  onStop,
}: RecorderPanelProps) {
  const recommended = duration >= 12

  return (
    <div className="relative flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-border bg-muted/50 px-6 py-10">
      <SoundRipple active={isRecording} audioLevel={audioLevel} />

      <div
        className={`relative z-10 flex h-24 w-24 items-center justify-center rounded-full transition-colors duration-200 ${
          isRecording ? 'bg-accent/15 text-accent' : 'bg-primary/10 text-primary'
        }`}
      >
        <Mic className="h-10 w-10" aria-hidden="true" />
      </div>

      <p className="relative z-10 mt-6 font-heading text-3xl font-semibold tabular-nums text-foreground">
        {formatDuration(duration)}
      </p>

      <p className="relative z-10 mt-2 text-sm text-foreground/60">
        {isRecording
          ? recommended
            ? 'Duración óptima alcanzada. Puedes detener la grabación.'
            : 'Graba al menos 12 segundos para mejores resultados.'
          : 'Pulsa el botón para empezar a grabar el canto del ave.'}
      </p>

      {error ? (
        <p className="relative z-10 mt-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <div className="relative z-10 mt-6">
        {isRecording ? (
          <Button variant="accent" onClick={onStop} disabled={disabled}>
            <Square className="h-4 w-4 fill-current" aria-hidden="true" />
            Detener grabación
          </Button>
        ) : (
          <Button onClick={onStart} disabled={disabled}>
            <Mic className="h-4 w-4" aria-hidden="true" />
            Iniciar grabación
          </Button>
        )}
      </div>

      {isRecording ? (
        <div className="relative z-10 mt-4 h-2 w-48 overflow-hidden rounded-full bg-border">
          <div
            className="h-full rounded-full bg-accent transition-all duration-100"
            style={{ width: `${Math.min(audioLevel * 100, 100)}%` }}
          />
        </div>
      ) : null}
    </div>
  )
}
