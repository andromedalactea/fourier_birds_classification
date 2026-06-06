import { useEffect, useRef } from 'react'
import { startWaveformLoop } from '../../lib/animations'
import { useReducedMotion } from '../../hooks/useReducedMotion'

interface WaveformVisualizerProps {
  active: boolean
  barCount?: number
}

export function WaveformVisualizer({ active, barCount = 24 }: WaveformVisualizerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    if (!active || !containerRef.current) return undefined
    const cleanup = startWaveformLoop('.wave-bar', reducedMotion)
    return () => cleanup?.()
  }, [active, reducedMotion])

  if (!active) return null

  return (
    <div
      ref={containerRef}
      className="flex h-16 items-end justify-center gap-1"
      role="status"
      aria-label="Analizando audio"
    >
      {Array.from({ length: barCount }).map((_, i) => (
        <div
          key={i}
          className="wave-bar w-1.5 origin-bottom rounded-full bg-primary"
          style={{ height: `${20 + (i % 5) * 12}%` }}
        />
      ))}
    </div>
  )
}
