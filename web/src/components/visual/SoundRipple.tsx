import { useEffect, useRef } from 'react'
import { startRecordingRipple } from '../../lib/animations'
import { useReducedMotion } from '../../hooks/useReducedMotion'

interface SoundRippleProps {
  active: boolean
  audioLevel?: number
}

export function SoundRipple({ active, audioLevel = 0 }: SoundRippleProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    if (!active || !containerRef.current) return undefined
    const cleanup = startRecordingRipple('.ripple-ring', reducedMotion)
    return () => cleanup?.()
  }, [active, reducedMotion])

  if (!active) return null

  const scale = 1 + audioLevel * 0.3

  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
      aria-hidden="true"
    >
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="ripple-ring absolute rounded-full border-2 border-accent/40"
          style={{
            width: `${120 + i * 40}px`,
            height: `${120 + i * 40}px`,
            transform: `scale(${scale})`,
          }}
        />
      ))}
    </div>
  )
}
