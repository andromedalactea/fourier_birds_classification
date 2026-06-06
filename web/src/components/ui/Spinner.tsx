interface SpinnerProps {
  label?: string
}

export function Spinner({ label = 'Cargando...' }: SpinnerProps) {
  return (
    <div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
      <p className="text-sm text-foreground/70">{label}</p>
    </div>
  )
}
